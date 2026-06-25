#!/usr/bin/env node
// Scaffold the font contract for an exported campaign.
//
// Scans a campaign's HTML for Tailwind arbitrary font-family classes
// (e.g. font-['TT_Octosquares',sans-serif]), then for every non-system family:
//   - writes assets/css/fonts.css with an @font-face scaffold + backing class
//     rules (so the families render even if the downstream Tailwind build does
//     not scope the consumed HTML),
//   - creates assets/fonts/,
//   - reports the .woff2 files the designer/brand must supply (the tool cannot
//     conjure them — Figma/MCP does not hand over font files).
//
// Usage:
//   node scripts/generate-fonts-css.js [<slug>...]   # default: all of src/
//   node scripts/generate-fonts-css.js <slug> --force # overwrite existing fonts.css

const fs = require('fs');
const path = require('path');
const {
  extractFontUsages,
  isSafeFamily,
  expectedFontFileBase,
  escapeClassSelector,
} = require('./font-contract');

const root = path.resolve(__dirname, '..');
const srcRoot = path.join(root, 'src');

const args = process.argv.slice(2);
let force = false;
const targets = [];
for (const arg of args) {
  if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }
  if (arg === '--force') {
    force = true;
    continue;
  }
  targets.push(arg);
}

const campaignDirs = resolveTargets(targets);
if (!campaignDirs.length) {
  console.log('[generate-fonts-css] no campaigns found in src/');
  process.exit(0);
}

let anyMissing = false;
for (const dir of campaignDirs) {
  anyMissing = processCampaign(dir) || anyMissing;
}

process.exit(0);

function printHelp() {
  console.log(`Usage:
  npm run fonts                 # scaffold fonts.css for every campaign in src/
  npm run fonts -- <slug>       # scaffold fonts.css for one campaign
  npm run fonts -- <slug> --force  # overwrite an existing fonts.css

For every non-system Tailwind font-['Family'] class used in a campaign's HTML
it writes assets/css/fonts.css (@font-face scaffold + backing class rules),
creates assets/fonts/, and lists the .woff2 files the brand must supply.`);
}

function resolveTargets(rawTargets) {
  if (!rawTargets.length) {
    if (!fs.existsSync(srcRoot)) return [];
    return fs
      .readdirSync(srcRoot)
      .map((entry) => path.join(srcRoot, entry))
      .filter((entryPath) => fs.statSync(entryPath).isDirectory());
  }
  return rawTargets.map((target) => {
    const direct = path.resolve(root, target);
    if (fs.existsSync(direct)) return direct;
    return path.join(srcRoot, target);
  });
}

function processCampaign(campaignDir) {
  const relCampaign = path.relative(root, campaignDir);
  if (!fs.existsSync(campaignDir)) {
    console.log(`[generate-fonts-css] ${relCampaign}: does not exist`);
    return false;
  }

  const htmlFiles = walk(campaignDir).filter((f) => f.endsWith('.html'));
  const familyMap = new Map(); // family -> Set of rawClass
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    for (const { rawClass, family } of extractFontUsages(html)) {
      if (isSafeFamily(family)) continue;
      if (!familyMap.has(family)) familyMap.set(family, new Set());
      familyMap.get(family).add(rawClass);
    }
  }

  if (!familyMap.size) {
    console.log(`[generate-fonts-css] ${relCampaign}: no custom font families used (system/Google fonts only)`);
    return false;
  }

  const cssPath = path.join(campaignDir, 'assets', 'css', 'fonts.css');
  const fontsDir = path.join(campaignDir, 'assets', 'fonts');
  fs.mkdirSync(fontsDir, { recursive: true });
  fs.mkdirSync(path.dirname(cssPath), { recursive: true });

  const families = [...familyMap.keys()].sort();

  const existing = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : null;
  const isStub = existing !== null && !/@font-face/.test(existing);
  if (existing !== null && !force && !isStub) {
    console.log(`[generate-fonts-css] ${relCampaign}: fonts.css already has @font-face — not overwriting (use --force).`);
  } else {
    fs.writeFileSync(cssPath, buildFontsCss(familyMap, families));
    console.log(`[generate-fonts-css] ${relCampaign}: wrote ${path.relative(root, cssPath)} for ${families.length} family(ies): ${families.join(', ')}`);
  }

  // Report required files and write a manifest the designer can act on.
  const required = [];
  for (const family of families) {
    const base = expectedFontFileBase(family);
    required.push({ family, file: `${base}.woff2` });
  }
  const missing = required.filter((r) => !fs.existsSync(path.join(fontsDir, r.file)));

  const reqPath = path.join(fontsDir, 'FONTS-REQUIRED.txt');
  fs.writeFileSync(reqPath, buildRequiredTxt(required, missing));

  if (missing.length) {
    anyMissingMessage(relCampaign, missing, fontsDir);
    return true;
  }
  console.log(`[generate-fonts-css] ${relCampaign}: all expected font files present in assets/fonts/`);
  return false;
}

function anyMissingMessage(relCampaign, missing, fontsDir) {
  console.log(`[generate-fonts-css] ${relCampaign}: ${missing.length} font file(s) MISSING — the brand/designer must supply these (Figma cannot export them):`);
  for (const m of missing) {
    console.log(`  - assets/fonts/${m.file}   (family "${m.family}")`);
  }
  console.log(`  See ${path.relative(root, path.join(fontsDir, 'FONTS-REQUIRED.txt'))}`);
}

function buildFontsCss(familyMap, families) {
  const header = `/* Brand web fonts — GENERATED by scripts/generate-fonts-css.js.
 *
 * The landing markup styles type with Tailwind arbitrary font-family classes
 * (e.g. font-['TT_Octosquares',sans-serif]). Tailwind turns underscores into
 * spaces, so the resolved families are the spaced names below. Nothing else in
 * the export ships these fonts, so without this file every custom family falls
 * back to ui-sans-serif.
 *
 * THE .woff2/.woff FILES ARE NOT GENERATED — the brand/designer must drop them
 * into assets/fonts/ (see FONTS-REQUIRED.txt). Update the @font-face weights to
 * match the files you actually ship.
 *
 * This file is @font-face + font-family backing rules ONLY — it sets no layout,
 * colour, or component styles, so it cannot regress the design.
 */
`;

  const faces = families
    .map((family) => {
      const base = expectedFontFileBase(family);
      return `@font-face {
  font-family: "${family}";
  src: url("../fonts/${base}.woff2") format("woff2"),
       url("../fonts/${base}.woff") format("woff");
  font-weight: 400 700; /* TODO: split into per-weight @font-face blocks for the weights you ship */
  font-style: normal;
  font-display: swap;
}`;
    })
    .join('\n\n');

  // Backing class rules — belt-and-suspenders so the families resolve even if
  // the downstream Tailwind build does not scan the consumed HTML.
  const backingHeader = `\n\n/* Backing rules for the exact arbitrary classes the templates use, so the
 * families resolve regardless of whether the Tailwind build scoped this HTML. */\n`;
  const backing = families
    .flatMap((family) => [...familyMap.get(family)].sort().map((rawClass) => {
      const generic = genericFor(rawClass);
      return `${escapeClassSelector(rawClass)} { font-family: "${family}"${generic ? `, ${generic}` : ''}; }`;
    }))
    .join('\n');

  return `${header}\n${faces}${backingHeader}${backing}\n`;
}

// Pull the generic fallback (last comma-segment) from a raw font-[...] class.
function genericFor(rawClass) {
  const inside = rawClass.match(/font-\[(?:family-name:)?([^\]]*)\]/);
  if (!inside) return '';
  const parts = inside[1].split(',');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].trim().replace(/_/g, ' ');
}

function buildRequiredTxt(required, missing) {
  const lines = [];
  lines.push('Fonts required for this campaign');
  lines.push('================================');
  lines.push('');
  lines.push('Figma/MCP does not export font files. Drop the web font files for each');
  lines.push('family below into this folder (assets/fonts/), then update assets/css/fonts.css');
  lines.push('to declare the exact weights/styles you ship.');
  lines.push('');
  lines.push('Prefer .woff2 (with a .woff fallback). Provide each weight used in the design.');
  lines.push('');
  for (const r of required) {
    const present = missing.find((m) => m.file === r.file) ? 'MISSING' : 'present';
    lines.push(`  [${present}] ${r.file}   family "${r.family}"`);
  }
  lines.push('');
  return lines.join('\n');
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '_site', '.git', '.campaigns-os', '_ref'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    if (entry.isFile()) files.push(full);
  }
  return files;
}
