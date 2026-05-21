#!/usr/bin/env node
// Validate local Figma export output against the public starter-template patterns.

const fs = require('fs');
const path = require('path');
const { Liquid } = require('liquidjs');

const root = path.resolve(__dirname, '..');
const srcRoot = path.join(root, 'src');
const args = process.argv.slice(2);
const targets = [];
let quiet = false;

for (const arg of args) {
  if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }
  if (arg === '--quiet') {
    quiet = true;
    continue;
  }
  targets.push(arg);
}

const errors = [];
const warnings = [];
const engine = new Liquid({ strictFilters: false, strictVariables: false });

const scanRoots = resolveTargets(targets);

for (const scanRoot of scanRoots) {
  if (!fs.existsSync(scanRoot)) {
    errors.push(`${relative(scanRoot)}: target does not exist`);
    continue;
  }
  validateCampaign(scanRoot);
}

if (!quiet) {
  console.log(`[validate-export] scanned ${scanRoots.map(relative).join(', ') || 'nothing'}`);
}

if (warnings.length && !quiet) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const warning of warnings) console.log(`  - ${warning}`);
}

if (errors.length) {
  console.log(`\nErrors (${errors.length}):`);
  for (const error of errors) console.log(`  - ${error}`);
  process.exit(1);
}

console.log('[validate-export] PASS');

function printHelp() {
  console.log(`Usage:
  npm run validate
  npm run validate -- <slug>
  npm run validate -- <path>

Checks exported local campaigns for:
  - invalid Liquid syntax
  - flat image paths that should be namespaced
  - hardcoded visible copy in landing partials
  - unprefixed section variables
  - per-section JS files instead of shared landing.js
  - landing handoff files under landing.html and _includes/landing/
  - Swiper/accordion/expandable/video markup that bypasses shared data-* contracts
  - missing reference wrappers for landing and presell pages`);
}

function resolveTargets(rawTargets) {
  if (!rawTargets.length) {
    if (!fs.existsSync(srcRoot)) return [];
    return fs.readdirSync(srcRoot)
      .map((entry) => path.join(srcRoot, entry))
      .filter((entryPath) => fs.statSync(entryPath).isDirectory());
  }

  return rawTargets.map((target) => {
    const direct = path.resolve(root, target);
    if (fs.existsSync(direct)) return direct;
    return path.join(srcRoot, target);
  });
}

function validateCampaign(campaignDir) {
  const relCampaign = relative(campaignDir);
  const files = walk(campaignDir).filter((file) => /\.(html|js|css)$/.test(file));
  const htmlFiles = files.filter((file) => file.endsWith('.html'));
  const includeFiles = htmlFiles.filter((file) => file.includes(`${path.sep}_includes${path.sep}`));
  const landingIncludeFiles = includeFiles.filter((file) => file.includes(`${path.sep}_includes${path.sep}landing${path.sep}`));
  const pageFiles = htmlFiles.filter((file) => !file.includes(`${path.sep}_includes${path.sep}`) && !file.includes(`${path.sep}_layouts${path.sep}`));
  const jsFiles = files.filter((file) => file.endsWith('.js'));

  if (landingIncludeFiles.length && !fs.existsSync(path.join(campaignDir, '_layouts', 'base-landing.html'))) {
    warnings.push(`${relCampaign}: landing sections exist but _layouts/base-landing.html is missing`);
  }

  if (landingIncludeFiles.length && !fs.existsSync(path.join(campaignDir, 'landing.html'))) {
    errors.push(`${relCampaign}: landing sections should be assembled by landing.html for developer handoff`);
  }

  validateEntryUrl(campaignDir);

  for (const file of includeFiles) {
    if (!file.includes(`${path.sep}_includes${path.sep}landing${path.sep}`)) {
      warnings.push(`${relative(file)}: landing handoff partials should live under _includes/landing/ to avoid checkout include collisions`);
    }
  }

  for (const file of htmlFiles) {
    validateLiquid(file);
    validateAssetReferences(file, campaignDir);
  }

  for (const file of includeFiles) {
    validateLandingPartial(file);
  }

  for (const file of pageFiles) {
    validatePage(file, campaignDir);
  }

  validateJsFiles(jsFiles, campaignDir);
}

function validateEntryUrl(campaignDir) {
  const slug = path.basename(campaignDir);
  const campaignsPath = path.join(root, '_data', 'campaigns.json');
  if (!fs.existsSync(campaignsPath)) return;

  let campaigns;
  try {
    campaigns = JSON.parse(fs.readFileSync(campaignsPath, 'utf8'));
  } catch {
    return;
  }

  const entryUrl = campaigns?.[slug]?.entry_url;
  if (!entryUrl) return;

  const entryFile = entryUrl.replace(/^\/+|\/+$/g, '').replace(/\.html$/i, '') + '.html';
  if (!fs.existsSync(path.join(campaignDir, entryFile))) {
    errors.push(`${relative(campaignDir)}: _data/campaigns.json entry_url "${entryUrl}" does not match ${entryFile}`);
  }

  const indexPath = path.join(campaignDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    const index = fs.readFileSync(indexPath, 'utf8');
    if (/window\.location\.replace\(["'](?:landing|presell)\.html["']\)/.test(index)) {
      warnings.push(`${relative(indexPath)}: preview redirect is unnecessary; use _data/campaigns.json entry_url instead`);
    }
  }
}

function validateLiquid(file) {
  const raw = fs.readFileSync(file, 'utf8');
  if (/TODO: replace|Your Heading Here|Your body copy here|Section partial not yet exported/i.test(raw)) {
    warnings.push(`${relative(file)}: scaffold placeholder text remains`);
  }

  const content = stripFrontmatter(raw)
    .replace(/{%\s*campaign_include\b[^%]*%}/g, '')
    .replace(/{%\s*schema\b[\s\S]*?{%\s*endschema\s*%}/g, '');

  try {
    engine.parse(content);
  } catch (error) {
    errors.push(`${relative(file)}: invalid Liquid (${error.message})`);
  }
}

function validateAssetReferences(file, campaignDir) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = relative(file);
  const assetRefs = [...content.matchAll(/(['"])(images\/[^'"]+)\1\s*\|\s*campaign_asset/g)].map((match) => match[2]);

  for (const assetPath of assetRefs) {
    const parts = assetPath.split('/');
    if (parts.length === 2) {
      errors.push(`${rel}: flat image path "${assetPath}" should be images/{section}/... or images/_shared/...`);
    }

    const full = path.join(campaignDir, 'assets', assetPath);
    if (!fs.existsSync(full)) {
      warnings.push(`${rel}: campaign_asset reference "${assetPath}" does not exist yet`);
    }
  }
}

function validateLandingPartial(file) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = relative(file);
  const section = path.basename(file, '.html');
  const sectionPrefix = section.replace(/-/g, '_');

  if (!/max-w-\[(?:1440px|800px)\]|max-w-7xl/.test(content)) {
    warnings.push(`${rel}: no obvious max-width wrapper found`);
  }

  if (/lg:px-\[120px\]/.test(content) && !/lg:px-\[60px\][^"]*xl:px-\[120px\]/.test(content)) {
    warnings.push(`${rel}: uses lg:px-[120px] without the lg:px-[60px] xl:px-[120px] bridge`);
  }

  if (/<script\b/i.test(content)) {
    warnings.push(`${rel}: inline script found; prefer shared landing.js data-* behavior unless matching reference exception`);
  }

  for (const issue of embeddedCopyVariables(content)) {
    errors.push(`${rel}: suspicious Liquid variable "{{ ${issue} }}" looks like Figma copy was concatenated into the variable name`);
  }

  if (/class=["'][^"']*\bswiper\b/.test(content) || /\bdata-swiper\b/.test(content)) {
    if (!/\bdata-swiper-root\b/.test(content)) {
      errors.push(`${rel}: Swiper markup must include data-swiper-root on the root wrapper`);
    }
    if (!/\bdata-slides\b/.test(content)) {
      warnings.push(`${rel}: Swiper root should declare data-slides/data-gap/data-loop values`);
    }
    if (/\bswiper-pagination\b/.test(content) && !/rounded-\[(?:24|30|999)px\]|rounded-full/.test(content)) {
      warnings.push(`${rel}: Swiper pagination has no obvious rounded pill/container; compare against Figma mobile tablist/dot wrapper`);
    }
  }

  if (/\bdata-accordion-item\b/.test(content) && !/\bdata-accordion\b/.test(content)) {
    errors.push(`${rel}: accordion items require a data-accordion wrapper`);
  }

  if (/\bdata-expandable\b/.test(content)) {
    if (!/\bdata-expandable-panel\b/.test(content)) {
      errors.push(`${rel}: data-expandable requires a data-expandable-panel`);
    }
    if (!/\bdata-expandable-toggle\b/.test(content)) {
      errors.push(`${rel}: data-expandable requires a data-expandable-toggle`);
    }
  }

  if (/\bdata-expandable-panel\b/.test(content) && !/\bdata-expandable\b/.test(content)) {
    errors.push(`${rel}: data-expandable-panel requires a data-expandable wrapper`);
  }

  if (/\bdata-modal-trigger\b/.test(content)) {
    if (!/\bdata-modal-type=/.test(content)) {
      warnings.push(`${rel}: data-modal-trigger should declare data-modal-type`);
    }
    if (!/\bdata-modal-src=|\bdata-modal-target=/.test(content)) {
      errors.push(`${rel}: data-modal-trigger requires data-modal-src or data-modal-target`);
    }
  }

  if (/\bdata-video-inline\b/.test(content) && !/\bdata-video-src=/.test(content)) {
    errors.push(`${rel}: data-video-inline requires data-video-src`);
  }

  for (const variable of liquidVariables(content)) {
    if (isAllowedSharedVariable(variable)) continue;
    if (variable.startsWith(sectionPrefix + '_')) continue;
    if (variable.startsWith('campaign.')) continue;
    warnings.push(`${rel}: variable "{{ ${variable} }}" is not prefixed with "${sectionPrefix}_"`);
  }

  for (const text of hardcodedTextSnippets(content)) {
    warnings.push(`${rel}: hardcoded copy "${text}" should usually be a frontmatter variable`);
  }
}

function validatePage(file, campaignDir) {
  const raw = fs.readFileSync(file, 'utf8');
  const rel = relative(file);
  const frontmatter = getFrontmatter(raw);
  const isPresell = /page_layout:\s*base-presell\.html/.test(frontmatter) || path.basename(file) === 'presell.html';
  const isLanding = /page_layout:\s*base-landing\.html/.test(frontmatter);

  if (isPresell) {
    if (!/page_layout:\s*base-presell\.html/.test(frontmatter)) {
      errors.push(`${rel}: presell page should use page_layout: base-presell.html`);
    }
    if (!fs.existsSync(path.join(campaignDir, '_layouts', 'base-presell.html'))) {
      errors.push(`${relative(campaignDir)}: presell page exists but _layouts/base-presell.html is missing`);
    }
    if (!/max-w-\[800px\]/.test(raw)) {
      warnings.push(`${rel}: presell page should use the editorial max-w-[800px] article wrapper`);
    }
    if (!/images\/presell\//.test(raw)) {
      warnings.push(`${rel}: presell assets should live under images/presell/`);
    }
    if (!/next_url:/.test(frontmatter)) {
      errors.push(`${rel}: presell frontmatter should define next_url`);
    }
    return;
  }

  if (isLanding && !fs.existsSync(path.join(campaignDir, 'assets', 'js', 'landing.js'))) {
    errors.push(`${relative(campaignDir)}: base-landing page exists but assets/js/landing.js is missing`);
  }
}

function validateJsFiles(jsFiles, campaignDir) {
  for (const file of jsFiles) {
    const rel = relative(file);
    if (rel.endsWith('assets/js/landing.js')) continue;
    if (rel.includes('assets/js/presell/')) continue;
    if (/assets\/js\/[^/]+-(slider|accordion|swiper|countdown)\.js$/.test(toPosix(rel))) {
      errors.push(`${rel}: per-section JS found; use shared assets/js/landing.js data-* behavior`);
    }
  }
}

function liquidVariables(content) {
  const out = [];
  for (const match of content.matchAll(/{{\s*([^}|]+?)(?:\s*\|[^}]*)?}}/g)) {
    const variable = match[1].trim();
    if (!variable) continue;
    if (/^['"`0-9]/.test(variable)) continue;
    if (/[\s()[\]+\-*/]/.test(variable)) continue;
    out.push(variable);
  }
  return [...new Set(out)];
}

function embeddedCopyVariables(content) {
  const out = [];
  for (const match of content.matchAll(/{{\s*([a-z][a-z0-9_]*)([A-Z][^}|]*?(?:\\"|"|[.!?]))\s*}}/g)) {
    const expression = `${match[1]}${match[2]}`.replace(/\s+/g, ' ').trim();
    if (expression.length > 40 || /\s/.test(match[2])) out.push(expression);
  }
  return [...new Set(out)];
}

function isAllowedSharedVariable(variable) {
  return new Set([
    'next_url',
    'cta_text',
    'cta_button_arrow',
    'guarantee_icon',
    'guarantee_text',
    'content',
    'title',
    'page_type',
    'style',
    'script'
  ]).has(variable);
}

function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

function getFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : '';
}

function hardcodedTextSnippets(content) {
  const snippets = new Set();
  const withoutIgnored = content
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/{%[\s\S]*?%}/g, ' ')
    .replace(/{{[\s\S]*?}}/g, ' ');

  for (const match of withoutIgnored.matchAll(/>([^<>]+)</g)) {
    collectHardcodedSnippet(snippets, match[1]);
  }

  for (const match of withoutIgnored.matchAll(/\b(?:alt|aria-label|title)=["']([^"']+)["']/gi)) {
    collectHardcodedSnippet(snippets, match[1]);
  }

  return [...snippets].slice(0, 12);
}

function collectHardcodedSnippet(snippets, value) {
  const text = decodeHtmlEntities(value).replace(/\s+/g, ' ').trim();
  if (!text) return;
  if (text.length < 4) return;
  if (/^[\W\d_]+$/.test(text)) return;
  if (/^(previous|next|close|open|menu|play|pause)$/i.test(text)) return;
  if (/^(http|\/|#)/i.test(text)) return;

  const wordCount = (text.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) || []).length;
  if (wordCount < 2 && text.length < 18) return;

  snippets.add(text.length > 80 ? text.slice(0, 77) + '...' : text);
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '_site' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    if (entry.isFile()) files.push(full);
  }
  return files;
}

function relative(file) {
  return toPosix(path.relative(root, file));
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}
