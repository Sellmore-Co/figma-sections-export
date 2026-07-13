const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

const BREAKPOINTS = [
  { name: 'desktop', width: 1440 },
  { name: 'tablet', width: 768 },
  { name: 'mobile', width: 375 },
];

function readRefSidecar(refDir, section) {
  const sidecarPath = path.join(refDir, `${section}-refs.json`);
  if (!fs.existsSync(sidecarPath)) return null;
  return JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
}

function parseComparisonPositionals(positional) {
  const [slug, arg2, arg3] = positional;
  let explicitSection = null;
  let port = 3000;

  if (arg2 !== undefined) {
    if (/^\d+$/.test(arg2)) {
      port = parseInt(arg2, 10);
    } else {
      explicitSection = arg2;
      if (arg3 !== undefined) {
        if (!/^\d+$/.test(arg3)) {
          return { slug, explicitSection, port, invalidPort: arg3 };
        }
        port = parseInt(arg3, 10);
      }
    }
  }

  return { slug, explicitSection, port, invalidPort: null };
}

function listDesktopPrefixes(files) {
  const out = files
    .filter((file) => file.endsWith('-desktop.png') && !file.startsWith('rendered-'))
    .map((file) => file.replace(/-desktop\.png$/, ''));
  return [...new Set(out)].sort();
}

function resolveReferenceSection({ refDir, explicitSection, slug, command = 'npm run compare' }) {
  const existingFiles = fs.readdirSync(refDir);
  const prefixes = listDesktopPrefixes(existingFiles);

  if (explicitSection) {
    const desktopPath = path.join(refDir, `${explicitSection}-desktop.png`);
    if (!fs.existsSync(desktopPath)) {
      const errors = [
        `No Figma ref for section "${explicitSection}": expected src/${slug}/_ref/${explicitSection}-desktop.png`,
      ];
      if (prefixes.length) {
        errors.push(`Available ref prefixes: ${prefixes.join(', ')}`);
      } else {
        errors.push('No *-desktop.png files in _ref/ — run save-ref.sh first.');
      }
      return { sectionName: null, prefixes, warning: null, errors };
    }
    return { sectionName: explicitSection, prefixes, warning: null, errors: [] };
  }

  const warning = prefixes.length > 1
    ? `Warning: multiple *-desktop.png ref sets in _ref/ (${prefixes.join(', ')}). Using "${prefixes[0]}". `
      + `Pass an explicit section: ${command} ${slug} <section>`
    : null;
  return { sectionName: prefixes[0] || null, prefixes, warning, errors: [] };
}

function buildLiveUrl(port, slug, entryUrl = getCampaignEntryUrl(slug)) {
  return `http://localhost:${port}/${slug}/${normalizeEntryUrl(entryUrl)}`;
}

function getCampaignEntryUrl(slug, projectRoot = PROJECT_ROOT) {
  const campaignsPath = path.join(projectRoot, '_data', 'campaigns.json');
  if (!fs.existsSync(campaignsPath)) return '';

  try {
    const campaigns = JSON.parse(fs.readFileSync(campaignsPath, 'utf8'));
    return campaigns?.[slug]?.entry_url || '';
  } catch {
    return '';
  }
}

function normalizeEntryUrl(entryUrl) {
  if (typeof entryUrl !== 'string') return '';
  const trimmed = entryUrl
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.html$/i, '');
  return trimmed ? `${trimmed}/` : '';
}

function stripMarkupComments(source) {
  return source
    .replace(/<!--[^]*?-->/g, '')
    .replace(/{%-?\s*comment\s*-?%}[^]*?{%-?\s*endcomment\s*-?%}/g, '');
}

const INCLUDE_PATTERN = /{%-?\s*campaign_include\s+(['"])([^'"]+)\1\s*-?%}/g;

function extractCampaignIncludes(source) {
  const includes = [];
  const includePattern = new RegExp(INCLUDE_PATTERN.source, 'g');
  let match;
  const uncommentedSource = stripMarkupComments(source);
  while ((match = includePattern.exec(uncommentedSource)) !== null) {
    includes.push(match[2].trim().replace(/^\/+/, ''));
  }
  return includes;
}

function countRootSections(source) {
  const withoutComments = stripMarkupComments(source);
  const sectionTagPattern = /<\s*(\/?)\s*section\b[^>]*>/gi;
  let depth = 0;
  let count = 0;
  let match;

  while ((match = sectionTagPattern.exec(withoutComments)) !== null) {
    if (match[1]) {
      depth = Math.max(0, depth - 1);
    } else {
      if (depth === 0) count += 1;
      if (!/\/\s*>$/.test(match[0])) depth += 1;
    }
  }

  return count;
}

function resolveSectionIndex({ pagePath, includesDir, section }) {
  if (!pagePath || !fs.existsSync(pagePath)) {
    return {
      index: null,
      reason: `page source not found: ${pagePath || '(unknown)'}`,
    };
  }

  // Work on comment-stripped source throughout so commented-out includes and
  // sections never desynchronize include positions from literal-section counts.
  const pageSource = stripMarkupComments(fs.readFileSync(pagePath, 'utf8'));
  const targetInclude = `landing/${section}.html`;

  // The target partial must contribute exactly one root <section>: zero would
  // silently capture the FOLLOWING section; more than one cannot be scoped to
  // a single element screenshot.
  const targetPath = path.join(includesDir, targetInclude);
  if (!fs.existsSync(targetPath)) {
    return { index: null, reason: `target partial not found: ${targetPath}` };
  }
  const targetSource = stripMarkupComments(fs.readFileSync(targetPath, 'utf8'));
  // Partials are leaf files in this repo. A partial that itself includes other
  // partials would render sections countRootSections() cannot see, silently
  // desynchronizing the index — reject rather than expand recursively.
  const nestedIncludeReason = (include, where) => ({
    index: null,
    reason: `${where} ${include} contains campaign_include tags; section-index capture only supports leaf partials — use --selector to scope it`,
  });
  if (extractCampaignIncludes(targetSource).length > 0) {
    return nestedIncludeReason(targetInclude, 'target partial');
  }
  const targetRootSections = countRootSections(targetSource);
  if (targetRootSections !== 1) {
    return {
      index: null,
      reason: `target partial ${targetInclude} has ${targetRootSections} root <section> elements (need exactly 1); use --selector to scope it`,
    };
  }

  // Walk section tags and includes in document order, tracking literal
  // <section> nesting depth so that (a) a target include nested inside a
  // literal section is rejected (capture only selects top-level sections),
  // (b) includes rendered inside a literal section contribute no top-level
  // slots, and (c) depth-0 literal sections before the target count as slots.
  // NOTE: written out literally (not composed from INCLUDE_PATTERN) because
  // the quote backreference must be renumbered for the combined group order.
  const tokenPattern = /<\s*(\/?)\s*section\b[^>]*>|{%-?\s*campaign_include\s+(['"])([^'"]+)\2\s*-?%}/gi;
  let depth = 0;
  let index = 0;
  let match;

  while ((match = tokenPattern.exec(pageSource)) !== null) {
    if (match[0].startsWith('<')) {
      const isClosing = Boolean(match[1]);
      if (isClosing) {
        depth = Math.max(0, depth - 1);
      } else {
        if (depth === 0) index += 1;
        if (!/\/\s*>$/.test(match[0])) depth += 1;
      }
      continue;
    }

    const includeName = match[3].trim().replace(/^\/+/, '');
    if (includeName === targetInclude) {
      if (depth > 0) {
        return {
          index: null,
          reason: `section "${section}" is included inside a literal <section> in ${pagePath}; use --selector to scope it`,
        };
      }
      return { index, reason: null };
    }

    if (depth > 0) continue;
    const partialPath = path.join(includesDir, includeName);
    if (!fs.existsSync(partialPath)) {
      return {
        index: null,
        reason: `included partial not found while resolving section order: ${partialPath}`,
      };
    }
    const partialSource = stripMarkupComments(fs.readFileSync(partialPath, 'utf8'));
    if (extractCampaignIncludes(partialSource).length > 0) {
      return nestedIncludeReason(includeName, 'preceding partial');
    }
    index += countRootSections(partialSource);
  }

  return {
    index: null,
    reason: `section "${section}" was not found in the campaign_include sequence in ${pagePath}`,
  };
}

function entryUrlToSourcePath(srcDir, entryUrl) {
  let relative = typeof entryUrl === 'string' ? entryUrl.trim() : '';
  relative = relative.split(/[?#]/, 1)[0].replace(/^\/+/, '');
  if (!relative) return path.join(srcDir, 'index.html');
  if (relative.endsWith('/')) relative += 'index.html';
  if (!path.extname(relative)) relative += '.html';
  return path.join(srcDir, relative);
}

function resolveSectionPage({ slug, section, projectRoot = PROJECT_ROOT }) {
  const srcDir = path.join(projectRoot, 'src', slug);
  const landingPartialPath = path.join(srcDir, '_includes', 'landing', `${section}.html`);
  const entryUrl = fs.existsSync(landingPartialPath)
    ? 'landing.html'
    : getCampaignEntryUrl(slug, projectRoot);

  return {
    entryUrl,
    pagePath: entryUrlToSourcePath(srcDir, entryUrl),
    includesDir: path.join(srcDir, '_includes'),
  };
}

function resolveSectionCapture({ slug, section, projectRoot = PROJECT_ROOT }) {
  const page = resolveSectionPage({ slug, section, projectRoot });
  const resolution = resolveSectionIndex({
    pagePath: page.pagePath,
    includesDir: page.includesDir,
    section,
  });

  return {
    ...page,
    sectionIndex: resolution.index,
    warning: resolution.reason
      ? `Warning: could not scope capture for section "${section}": ${resolution.reason}. Falling back to full-page capture.`
      : null,
  };
}

module.exports = {
  BREAKPOINTS,
  PROJECT_ROOT,
  buildLiveUrl,
  countRootSections,
  entryUrlToSourcePath,
  extractCampaignIncludes,
  getCampaignEntryUrl,
  listDesktopPrefixes,
  normalizeEntryUrl,
  parseComparisonPositionals,
  readRefSidecar,
  resolveReferenceSection,
  resolveSectionCapture,
  resolveSectionIndex,
  resolveSectionPage,
};
