#!/usr/bin/env node
// Emit a source-html manifest for campaigns-os to consume.
//
// The manifest is the contract between figma-sections-export and the
// downstream campaigns-os Build Packet. It enumerates the page-kit pages
// that this campaign export produced (landing.html, presell.html) so a
// build agent can populate `source_html.pages[]` without re-scanning the
// filesystem or hand-authoring the packet.
//
// Output: <campaign_dir>/.campaigns-os/source-html-manifest.json
//
// Schema: source-html-manifest/v0
// {
//   "schema_version": "source-html-manifest/v0",
//   "generated_at": "ISO-8601",
//   "generator": "figma-sections-export@<version>",
//   "campaign_slug": "<slug>",
//   "root": ".",                 // self-reference; relative to the manifest's own location
//   "pages": [
//     { "page_id": "landing", "path": "landing.html", "page_type": "landing" },
//     { "page_id": "presell", "path": "presell.html", "page_type": "presell" }
//   ]
// }

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 'source-html-manifest/v0';

const PAGE_DETECTORS = [
  { page_id: 'landing', filename: 'landing.html', page_type: 'landing' },
  { page_id: 'presell', filename: 'presell.html', page_type: 'presell' },
];

function detectPages(campaignDir) {
  const pages = [];
  for (const candidate of PAGE_DETECTORS) {
    const full = path.join(campaignDir, candidate.filename);
    if (fs.existsSync(full)) {
      pages.push({
        page_id: candidate.page_id,
        path: candidate.filename,
        page_type: candidate.page_type,
      });
    }
  }
  return pages;
}

function readPackageVersion(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function buildManifest({ campaignDir, slug, generatorRoot }) {
  const pages = detectPages(campaignDir);

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    generator: `figma-sections-export@${readPackageVersion(generatorRoot)}`,
    campaign_slug: slug,
    root: '.',
    pages,
  };
}

function writeManifest({ campaignDir, slug, generatorRoot }) {
  const manifest = buildManifest({ campaignDir, slug, generatorRoot });
  const outDir = path.join(campaignDir, '.campaigns-os');
  const outPath = path.join(outDir, 'source-html-manifest.json');

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');

  return { manifest, outPath };
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`Usage:
  node scripts/write-handoff-manifest.js <slug>

Writes <campaign>/.campaigns-os/source-html-manifest.json describing the
page-kit pages this export produced (landing.html, presell.html).

The manifest is consumed by campaigns-os to populate the Build Packet's
source_html.pages[] block without manual authoring.`);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const slug = args.find((arg) => !arg.startsWith('--'));
  const generatorRoot = path.resolve(__dirname, '..');
  const campaignDir = path.join(generatorRoot, 'src', slug);

  if (!fs.existsSync(campaignDir)) {
    console.error(`[handoff-manifest] Campaign not found: src/${slug}/`);
    process.exit(1);
  }

  const { manifest, outPath } = writeManifest({ campaignDir, slug, generatorRoot });

  if (manifest.pages.length === 0) {
    console.warn(`[handoff-manifest] No landing.html or presell.html found in src/${slug}/. Manifest written with empty pages[] — campaigns-os will treat this as collect-inputs.`);
  } else {
    const summary = manifest.pages.map((p) => `${p.page_id} (${p.path})`).join(', ');
    console.log(`[handoff-manifest] Wrote ${path.relative(generatorRoot, outPath)} — ${summary}`);
  }
}

module.exports = { buildManifest, writeManifest, SCHEMA_VERSION, PAGE_DETECTORS };
