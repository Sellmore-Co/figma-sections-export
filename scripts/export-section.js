#!/usr/bin/env node
// export-section.js — token-based REST extraction for interactive sections.
//
// This is the reliability fallback for the Figma MCP plugin (which can
// disconnect mid-run) and the source of the two interactive output shapes:
//
//   • hotspot  — responsive <picture> + a transparent <a> over ONLY the CTA
//                button, one per breakpoint (no more whole-section links).
//   • accordion — a native <details> accordion built from FAQ Q&A content.
//
// Usage:
//   node scripts/export-section.js --slug <slug> --section <name> \
//        --desktop <url|id> [--tablet <url|id>] [--mobile <url|id>] \
//        [--file-key KEY] [--type auto|hotspot|accordion] [--scale 2] \
//        [--button-name "Link → Button"] [--href "<liquid>"] \
//        [--nodes-json path] [--dry-run] [--force] [--print]
//
// Examples:
//   node scripts/export-section.js --slug acme --section hero-1 \
//     --desktop "https://www.figma.com/design/KEY/Name?node-id=143-10518" \
//     --tablet  "...node-id=143-10610" --mobile "...node-id=143-12936"
//
//   node scripts/export-section.js --slug acme --section faq-1 \
//     --desktop 143:9001 --file-key KEY --type accordion
//
// Requires FIGMA_ACCESS_TOKEN in .env (REST path). --nodes-json runs offline
// from a saved /v1/files/:key/nodes response or a { breakpoint: doc } map.

const fs = require('fs');
const path = require('path');

const rest = require('./lib/figma-rest');
const tree = require('./lib/figma-tree');
const { computeHotspot } = require('./lib/hotspots');
const { renderHotspotSection, renderAccordionSection, varPrefix } = require('./lib/interactive-html');
const { extractAccordionItems } = require('./lib/accordion-extract');

const ROOT = path.resolve(__dirname, '..');
const BREAKPOINTS = ['desktop', 'tablet', 'mobile'];

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

async function main() {
  rest.loadEnv();
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) { printHelp(); return; }

  const section = normalizeSection(requireOpt(opts, 'section'));
  const slug = requireOpt(opts, 'slug');

  // Resolve node ids + file key from URLs / flags / env.
  const nodeInputs = {};
  for (const bp of BREAKPOINTS) if (opts[bp]) nodeInputs[bp] = opts[bp];
  if (!Object.keys(nodeInputs).length && !opts['nodes-json']) {
    throw new Error('Provide at least one of --desktop / --tablet / --mobile (a Figma URL or node id), or --nodes-json.');
  }

  let fileKey = opts['file-key'] || process.env.FIGMA_FILE_KEY || '';
  for (const value of Object.values(nodeInputs)) {
    const fromUrl = rest.extractFileKey(value);
    if (fromUrl) { fileKey = fromUrl; break; }
  }

  const nodeIds = {};
  for (const [bp, value] of Object.entries(nodeInputs)) nodeIds[bp] = rest.normalizeNodeId(value);

  // Fetch node documents per breakpoint — REST or offline fixture.
  const docs = await loadDocuments({ opts, fileKey, nodeIds });
  const presentBps = BREAKPOINTS.filter((bp) => docs[bp]);
  if (!presentBps.length) throw new Error('No node documents resolved for any breakpoint.');

  // Annotations (issue #27 ask 3) — collected across all breakpoints.
  const annotations = presentBps.flatMap((bp) => tree.collectAnnotations(docs[bp]));
  if (annotations.length) {
    console.log(`[export-section] captured ${annotations.length} Dev Mode annotation(s)`);
  }

  const type = resolveType(opts.type, section);
  const summary = { section, slug, type, fileKey, images: [], hotspots: {}, frontmatter: {}, warnings: [], annotations: annotations.length };

  let html;
  if (type === 'accordion') {
    ({ html } = await buildAccordion({ section, docs, presentBps, annotations, summary }));
  } else {
    ({ html } = await buildHotspot({ section, slug, docs, presentBps, nodeIds, fileKey, opts, summary }));
  }

  const outPath = opts.out
    ? path.resolve(opts.out)
    : path.join(ROOT, 'src', slug, '_includes', 'landing', `${section}.html`);

  if (fs.existsSync(outPath) && !opts.force) {
    summary.warnings.push(`${relative(outPath)} exists — re-run with --force to overwrite.`);
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
    summary.partial = relative(outPath);
  }

  if (opts.print) {
    console.log('\n--- partial ---\n');
    console.log(html);
  }

  printSummary(section, summary);
}

// --- document loading -------------------------------------------------------

async function loadDocuments({ opts, fileKey, nodeIds }) {
  const docs = {};

  if (opts['nodes-json']) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(opts['nodes-json']), 'utf8'));
    // Accept either { desktop: <doc>, ... } or a raw /v1/.../nodes response.
    const nodesMap = raw.nodes || raw;
    for (const bp of BREAKPOINTS) {
      if (raw[bp] && raw[bp].id) { docs[bp] = raw[bp]; continue; }
      const id = nodeIds[bp];
      if (id && nodesMap[id]) docs[bp] = nodesMap[id].document || nodesMap[id];
    }
    // If a single doc was supplied with no breakpoint mapping, use it as desktop.
    if (!Object.keys(docs).length && raw.id) docs.desktop = raw;
    return docs;
  }

  if (!fileKey) throw new Error('No Figma file key. Pass --file-key, a full Figma URL, or set FIGMA_FILE_KEY.');
  if (!process.env.FIGMA_ACCESS_TOKEN) throw new Error('FIGMA_ACCESS_TOKEN not set. Add it to .env (REST extraction path).');

  const ids = Object.values(nodeIds);
  const nodesMap = await rest.getNodes(fileKey, ids);
  for (const bp of BREAKPOINTS) {
    const id = nodeIds[bp];
    if (id && nodesMap[id]) docs[bp] = nodesMap[id].document;
  }
  return docs;
}

// --- hotspot section --------------------------------------------------------

async function buildHotspot({ section, slug, docs, presentBps, nodeIds, fileKey, opts, summary }) {
  const scale = Number(opts.scale || 2);
  const prefix = varPrefix(section);
  const breakpoints = [];
  let ctaHref = '';

  // Render + download one image slice per breakpoint (skipped on --dry-run).
  let urls = {};
  if (!opts['dry-run'] && fileKey) {
    urls = await rest.getImageUrls(fileKey, Object.values(nodeIds), { format: 'png', scale });
  }

  for (const bp of presentBps) {
    const doc = docs[bp];
    const frameBox = doc.absoluteBoundingBox;
    if (!frameBox) {
      summary.warnings.push(`${bp}: frame has no absoluteBoundingBox — cannot place hotspot.`);
    }

    // Locate the CTA button node for this breakpoint.
    const button = opts['button-name']
      ? tree.findButtonByName(doc, opts['button-name'])
      : tree.findButtonNodes(doc)[0];

    let hotspot = null;
    if (button && frameBox) {
      hotspot = computeHotspot(button.absoluteBoundingBox, frameBox);
      summary.hotspots[bp] = { name: button.name, ...hotspot };
      if (!ctaHref) ctaHref = tree.extractHyperlink(button);
    } else if (frameBox) {
      summary.warnings.push(`${bp}: no CTA button node found (looked for ${opts['button-name'] || 'Link → Button / CTA / btn'}).`);
    }

    // Download the rendered slice.
    const assetRel = `images/${section}/${section}-${bp}.png`;
    if (!opts['dry-run']) {
      const url = urls[nodeIds[bp]];
      if (url) {
        const outFile = path.join(ROOT, 'src', slug, 'assets', assetRel);
        const sig = await rest.download(url, outFile);
        if (sig !== 'png') summary.warnings.push(`${assetRel}: downloaded signature is ${sig}, expected png.`);
        summary.images.push(assetRel);
      } else {
        summary.warnings.push(`${bp}: no render URL returned by /v1/images.`);
      }
    }

    breakpoints.push({ name: bp, assetExpr: `'${assetRel}' | campaign_asset`, hotspot });
  }

  const hrefExpr = opts.href || `${prefix}_cta_url | campaign_link`;
  const html = renderHotspotSection({ section, sectionId: section, breakpoints, hrefExpr });

  summary.frontmatter[`${prefix}_alt`] = '';
  summary.frontmatter[`${prefix}_cta_label`] = '';
  if (!opts.href) summary.frontmatter[`${prefix}_cta_url`] = ctaHref || 'checkout.html';

  return { html };
}

// --- accordion section ------------------------------------------------------

async function buildAccordion({ section, docs, presentBps, annotations, summary }) {
  const sourceDoc = docs.desktop || docs[presentBps[0]];
  const { items, source } = extractAccordionItems(sourceDoc, annotations);

  if (!items.length) {
    summary.warnings.push('No accordion Q&A could be extracted; check the frame structure or pass content via Dev Mode annotations.');
  }
  if (source === 'questions-only' && items.length) {
    summary.warnings.push('Extracted questions but no answers (answers may live in Dev Mode annotations or hidden layers) — fill the *_a_* frontmatter values.');
  }
  summary.accordionSource = source;

  const heading = findHeading(sourceDoc, items);
  const { html, frontmatter } = renderAccordionSection({ section, sectionId: section, items, headingText: heading });
  Object.assign(summary.frontmatter, frontmatter);

  return { html };
}

// Heading = the largest-font text node that is not one of the questions.
function findHeading(doc, items) {
  const questionIds = new Set(items.map((i) => i.questionNodeId));
  const texts = tree.findTextNodes(doc).filter((t) => !questionIds.has(t.id));
  if (!texts.length) return '';
  texts.sort((a, b) => (b.fontSize || 0) - (a.fontSize || 0));
  return texts[0].text;
}

// --- helpers ----------------------------------------------------------------

function resolveType(explicit, section) {
  if (explicit && explicit !== 'auto') return explicit;
  const category = section.split('-')[0];
  return /^(faq|accordion)$/.test(category) ? 'accordion' : 'hotspot';
}

function normalizeSection(name) {
  const cleaned = String(name)
    .trim()
    .toLowerCase()
    .replace(/[-_ ]?(desktop|tablet|mobile)$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const compact = cleaned.match(/^([a-z]+)(\d+)$/);
  if (compact) return `${compact[1]}-${compact[2]}`;
  return cleaned;
}

function parseArgs(argv) {
  const opts = {};
  const flags = new Set(['dry-run', 'force', 'print', 'help']);
  for (let i = 0; i < argv.length; i += 1) {
    let arg = argv[i];
    if (arg === '-h') arg = '--help';
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      opts[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    if (flags.has(key)) { opts[key] = true; continue; }
    opts[key] = argv[i + 1];
    i += 1;
  }
  return opts;
}

function requireOpt(opts, key) {
  if (!opts[key]) throw new Error(`Missing required --${key}`);
  return opts[key];
}

function relative(p) {
  return path.relative(ROOT, p) || p;
}

function printSummary(section, summary) {
  console.log(`\n[export-section] ${section} → ${summary.type}`);
  if (summary.partial) console.log(`  partial: ${summary.partial}`);
  if (summary.images.length) console.log(`  images: ${summary.images.join(', ')}`);
  for (const [bp, h] of Object.entries(summary.hotspots)) {
    console.log(`  hotspot[${bp}]: left ${h.left}% top ${h.top}% w ${h.width}% h ${h.height}%  (${h.name})`);
  }
  if (summary.accordionSource) console.log(`  accordion answers: ${summary.accordionSource}`);
  const fmKeys = Object.keys(summary.frontmatter);
  if (fmKeys.length) {
    console.log('\n  Add to landing.html frontmatter:');
    for (const key of fmKeys) console.log(`    ${key}: ${JSON.stringify(summary.frontmatter[key] || '')}`);
    console.log(`\n  Then assemble it:`);
    console.log(`    {% campaign_include 'landing/${section}.html' %}`);
  }
  if (summary.warnings.length) {
    console.log(`\n  Warnings (${summary.warnings.length}):`);
    for (const w of summary.warnings) console.log(`    - ${w}`);
  }
}

function printHelp() {
  console.log(`export-section — REST extraction for interactive sections

Usage:
  node scripts/export-section.js --slug <slug> --section <name> \\
       --desktop <url|id> [--tablet <url|id>] [--mobile <url|id>] [options]

Options:
  --file-key KEY        Figma file key (inferred from URLs or FIGMA_FILE_KEY)
  --type TYPE           auto | hotspot | accordion   (default: auto from name)
  --scale N             render scale for image slices (default: 2)
  --button-name STR     override CTA button layer match (substring)
  --href "<liquid>"     CTA href Liquid expression (default: <prefix>_cta_url | campaign_link)
  --out PATH            output partial path (default: src/<slug>/_includes/landing/<section>.html)
  --nodes-json PATH     read node docs from a saved /v1/.../nodes response (offline / MCP handoff)
  --dry-run             compute hotspots/markup but do not render or download images
  --force               overwrite an existing partial
  --print               also print the generated partial to stdout
  -h, --help            show this help

Requires FIGMA_ACCESS_TOKEN in .env for the REST path.`);
}
