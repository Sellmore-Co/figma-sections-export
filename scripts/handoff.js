#!/usr/bin/env node
// Final handoff check for a locally exported campaign.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { describeScreenshots, parsePageIdArgs, writeManifest } = require('./write-handoff-manifest');
const { REQUIRED_VIEWPORTS } = require('./lib/page-screenshots');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

const parsed = parseArgs(args);
const flags = parsed.flags;
const positional = parsed.positional;
const [slug, maybeSection, maybePort] = positional;
const port = maybePort && /^\d+$/.test(maybePort) ? maybePort : '3000';
const noCompress = flags.has('--no-compress');
const pageIdOverrides = parsed.pageIdOverrides;

if (!slug) {
  printHelp();
  process.exit(1);
}

const campaignDir = path.join(root, 'src', slug);
const refDir = path.join(campaignDir, '_ref');
const imagesDir = path.join(campaignDir, 'assets', 'images');

if (!fs.existsSync(campaignDir)) {
  console.error(`[handoff] Campaign not found: src/${slug}/`);
  process.exit(1);
}

console.log(`[handoff] Checking ${slug}`);

// The manifest is rewritten at the end of this run. A previous run that ended
// blocked (missing screenshot proof) left one that validate would reject, so
// every later handoff would fail at the validate step before it could fix it.
const previousManifest = path.join(campaignDir, '.campaigns-os', 'source-html-manifest.json');
if (fs.existsSync(previousManifest)) {
  fs.rmSync(previousManifest);
  console.log('[handoff] Removed the previous source-html manifest; it is rewritten at the end of this run.');
}

runStep('Validate export', ['run', 'validate', '--', slug]);

const compareSection = resolveCompareSection(refDir, maybeSection);
if (compareSection) {
  runStep('Generate compare page', ['run', 'compare', '--', slug, compareSection, port]);
} else {
  const prefixes = listRefPrefixes(refDir);
  if (prefixes.length > 1) {
    console.log(`[handoff] Compare skipped: choose a section because _ref has multiple sets: ${prefixes.join(', ')}`);
    console.log(`[handoff] Example: npm run handoff -- ${slug} ${prefixes[0]}`);
  } else {
    console.log('[handoff] Compare skipped: no Figma reference PNGs found in _ref/.');
  }
}

if (noCompress) {
  console.log('[handoff] Image compression skipped by --no-compress.');
} else if (hasCompressibleImages(imagesDir)) {
  runStep('Compress final images', ['run', 'compress', '--', slug]);
} else {
  console.log('[handoff] Image compression skipped: no JPG, PNG, or WebP files found.');
}

console.log('\n[handoff] Writing campaigns-os handoff manifest');
try {
  const { manifest, outPath, warnings } = writeManifest({
    campaignDir,
    slug,
    generatorRoot: root,
    pageIdOverrides,
  });
  const relPath = toPosix(path.relative(root, outPath));
  for (const warning of warnings) console.warn(`[handoff] WARNING: ${warning}`);
  if (manifest.pages.length === 0) {
    console.warn(`[handoff] ${relPath} written with empty pages[] — no landing.html or presell.html detected; campaigns-os will treat this as collect-inputs.`);
  } else {
    const summary = manifest.pages.map((p) => `${p.page_id} (${p.path})`).join(', ');
    console.log(`[handoff] ${relPath} — ${summary}`);
    for (const page of manifest.pages) {
      console.log(`[handoff]   ${page.page_id} screenshots: ${describeScreenshots(page)}`);
    }
    // validate ran before the manifest existed, so it could not see these.
    // campaigns-os 1.20 blocks intake without desktop + mobile proof; do not
    // print "Ready for developer handoff" over a manifest that would block.
    const missing = manifest.pages.flatMap((p) => (p.screenshots || [])
      .filter((s) => REQUIRED_VIEWPORTS.includes(s.viewport) && s.availability !== 'available')
      .map((s) => `${p.page_id} ${s.viewport}: ${s.unavailable_reason}`));
    if (missing.length) {
      missing.forEach((m) => console.error(`[handoff] ERROR: ${m}`));
      console.error('[handoff] Missing source screenshot proof; campaigns-os intake would block. Save the refs named above and re-run handoff.');
      process.exit(1);
    }
  }
} catch (error) {
  console.error(`[handoff] Manifest write failed: ${error.message}`);
  process.exit(1);
}

console.log('\n[handoff] Ready for developer handoff checks.');
console.log(`[handoff] Folder: src/${slug}/`);
console.log(`[handoff] Manifest: src/${slug}/.campaigns-os/source-html-manifest.json`);
if (compareSection) {
  console.log(`[handoff] Compare page: src/${slug}/_ref/compare.html`);
}

function runStep(label, npmArgs) {
  console.log(`\n[handoff] ${label}`);
  const result = spawnSync('npm', npmArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(`[handoff] ${label} failed: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[handoff] ${label} failed.`);
    process.exit(result.status || 1);
  }
}

function resolveCompareSection(dir, explicitSection) {
  const prefixes = listRefPrefixes(dir);
  if (explicitSection) {
    const expected = path.join(dir, `${explicitSection}-desktop.png`);
    if (!fs.existsSync(expected)) {
      console.log(`[handoff] Compare skipped: expected src/${slug}/_ref/${explicitSection}-desktop.png`);
      if (prefixes.length) console.log(`[handoff] Available refs: ${prefixes.join(', ')}`);
      return null;
    }
    return explicitSection;
  }

  return prefixes.length === 1 ? prefixes[0] : null;
}

function listRefPrefixes(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('-desktop.png') && !file.startsWith('rendered-'))
    .map((file) => file.replace(/-desktop\.png$/, ''))
    .sort();
}

function hasCompressibleImages(dir) {
  if (!fs.existsSync(dir)) return false;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (/\.(jpe?g|png|webp)$/i.test(entry.name)) return true;
    }
  }
  return false;
}

function parseArgs(rawArgs) {
  const parsed = parsePageIdArgs(rawArgs, (message) => {
    console.error(`[handoff] ${message}`);
    process.exit(1);
  });
  const out = {
    flags: new Set(),
    positional: [],
    pageIdOverrides: parsed.pageIdOverrides,
  };

  for (const arg of parsed.rest) {
    if (arg.startsWith('--')) {
      out.flags.add(arg);
      continue;
    }
    out.positional.push(arg);
  }

  return out;
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function printHelp() {
  console.log(`Usage:
  npm run handoff -- <slug> [section] [port]
  npm run handoff -- <slug> [section] --no-compress
  npm run handoff -- <slug> --page-id landing=page_most7ygt_415
  npm run handoff -- <slug> --page-id presell=page_most7ygt_414

Runs final developer handoff checks:
  - validates the export
  - generates the compare page when one ref set exists, or when [section] is provided
  - compresses final JPG, PNG, and WebP assets unless --no-compress is passed
  - writes .campaigns-os/source-html-manifest.json for Campaigns OS source intake,
    stitching the per-section Figma renders in _ref/ into page-level desktop and
    mobile screenshots under _ref/pages/ (the campaigns-os 1.20 intake gate)

Page IDs default to filename-derived values such as "landing" and "presell".
Use --page-id <page>=<id> when the CampaignSpec has generated page ids.

Examples:
  npm run handoff -- novaburn
  npm run handoff -- novaburn hero-1
  npm run handoff -- novaburn hero-1 3001
  npm run handoff -- novaburn --no-compress
  npm run handoff -- novaburn --page-id landing=page_most7ygt_415`);
}
