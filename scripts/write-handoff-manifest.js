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
//   "producer_provenance": {
//     "source_type": "semantic_figma_export",
//     "screenshot_fallback_used": false,
//     "export_log": ".campaigns-os/source-export-log.json",
//     "figma_file_key": "...",
//     "semantic_section_count": 15,
//     "material_fingerprint": "..."
//   },
//   "pages": [
//     { "page_id": "landing", "path": "landing.html", "page_type": "landing", "page_url": "", "source_hash": "..." },
//     { "page_id": "presell", "path": "presell.html", "page_type": "presell", "page_url": "presell", "source_hash": "..." }
//   ],
//   "files": [
//     { "path": "_includes/landing/hero-1.html", "role": "partial", "sha256": "..." }
//   ]
// }

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = 'source-html-manifest/v0';

const PAGE_DETECTORS = [
  { page_id: 'landing', filename: 'landing.html', page_type: 'landing' },
  { page_id: 'presell', filename: 'presell.html', page_type: 'presell' },
];

function detectPages(campaignDir, pageIdOverrides = new Map()) {
  const pages = [];
  PAGE_DETECTORS.forEach((candidate, index) => {
    const full = path.join(campaignDir, candidate.filename);
    if (fs.existsSync(full)) {
      const page = {
        page_id: resolvePageId(candidate, index, pageIdOverrides),
        path: candidate.filename,
        page_type: candidate.page_type,
        source_hash: sha256File(full),
      };
      const pageUrl = pageUrlFor(candidate.filename);
      if (pageUrl) page.page_url = pageUrl;
      pages.push(page);
    }
  });
  return pages;
}

function resolvePageId(candidate, index, pageIdOverrides) {
  const keys = [
    candidate.filename,
    path.basename(candidate.filename, '.html'),
    candidate.page_type,
    String(index + 1),
  ];

  for (const key of keys) {
    if (pageIdOverrides.has(key)) return pageIdOverrides.get(key);
  }

  return candidate.page_id;
}

function pageUrlFor(filename) {
  return filename === 'landing.html' ? '' : filename.replace(/\.html$/i, '');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readPackageVersion(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function buildManifest({ campaignDir, slug, generatorRoot, pageIdOverrides }) {
  const pages = detectPages(campaignDir, pageIdOverrides);
  const files = collectMaterialFiles(campaignDir);
  const exportLog = readExportLog(campaignDir);
  const producerProvenance = buildProducerProvenance({
    campaignDir,
    generatorRoot,
    files,
    exportLog,
  });

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    generator: `figma-sections-export@${readPackageVersion(generatorRoot)}`,
    campaign_slug: slug,
    root: '.',
    producer_provenance: producerProvenance,
    pages,
    files,
  };
}

function writeManifest({ campaignDir, slug, generatorRoot, pageIdOverrides }) {
  const manifest = buildManifest({ campaignDir, slug, generatorRoot, pageIdOverrides });
  const outDir = path.join(campaignDir, '.campaigns-os');
  const outPath = path.join(outDir, 'source-html-manifest.json');

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');

  return { manifest, outPath };
}

function collectMaterialFiles(campaignDir) {
  const files = [];
  for (const relPath of walk(campaignDir).sort()) {
    if (!isManifestMaterialPath(relPath)) continue;
    const fullPath = path.join(campaignDir, relPath);
    files.push({
      path: toPosix(relPath),
      role: fileRole(relPath),
      sha256: sha256File(fullPath),
      bytes: fs.statSync(fullPath).size,
    });
  }
  return files;
}

function isManifestMaterialPath(relPath) {
  if (relPath === '.campaigns-os/source-html-manifest.json') return false;
  return (
    relPath === 'landing.html'
    || relPath === 'presell.html'
    || relPath.startsWith(`_includes${path.sep}landing${path.sep}`)
    || relPath.startsWith(`_layouts${path.sep}`)
    || relPath.startsWith(`assets${path.sep}`)
    || relPath === '.campaigns-os/source-export-log.json'
  );
}

function fileRole(relPath) {
  if (/^(landing|presell)\.html$/i.test(relPath)) return 'page';
  if (relPath.startsWith(`_includes${path.sep}`)) return 'partial';
  if (relPath.startsWith(`_layouts${path.sep}`)) return 'layout';
  if (relPath.startsWith(`assets${path.sep}`)) return 'asset';
  if (relPath === '.campaigns-os/source-export-log.json') return 'export_log';
  return 'support';
}

function walk(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = prefix ? path.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      out.push(...walk(path.join(dir, entry.name), relPath));
      continue;
    }
    if (entry.isFile()) out.push(relPath);
  }
  return out;
}

function readExportLog(campaignDir) {
  const logPath = path.join(campaignDir, '.campaigns-os', 'source-export-log.json');
  if (!fs.existsSync(logPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    return parsed && Array.isArray(parsed.entries) ? parsed : null;
  } catch {
    return null;
  }
}

function buildProducerProvenance({ campaignDir, generatorRoot, files, exportLog }) {
  const entries = Array.isArray(exportLog?.entries) ? exportLog.entries : [];
  const hasHotspotEntries = entries.some((entry) => entry && entry.type === 'hotspot');
  const fileKeys = unique(entries.map((entry) => entry.file_key).filter(Boolean));
  const sectionExports = entries.map((entry) => ({
    section: entry.section,
    type: entry.type,
    source_type: entry.source_type || (entry.type === 'hotspot' ? 'figma_hotspot_image_slice' : 'semantic_figma_export'),
    file_key: entry.file_key || null,
    node_ids: entry.node_ids || {},
    partial: entry.partial || null,
    images: Array.isArray(entry.images) ? entry.images : [],
    command: entry.command || null,
    warnings: Array.isArray(entry.warnings) ? entry.warnings : [],
  }));

  const semanticSectionCount = files.filter((file) => file.role === 'partial' && /^_includes\/landing\/.+\.html$/i.test(file.path)).length;
  const breakpointImageCount = files.filter((file) => file.role === 'asset' && /^assets\/images\/.+\.(png|jpe?g|webp)$/i.test(file.path)).length;
  const packageHash = crypto.createHash('sha256');
  for (const file of files) packageHash.update(`${file.sha256}  ${file.path}\n`);

  return {
    source_type: hasHotspotEntries ? 'mixed_figma_export' : 'semantic_figma_export',
    screenshot_fallback_used: false,
    generator_repo: path.basename(generatorRoot),
    generator_version: readPackageVersion(generatorRoot),
    export_log: fs.existsSync(path.join(campaignDir, '.campaigns-os', 'source-export-log.json'))
      ? '.campaigns-os/source-export-log.json'
      : null,
    figma_file_key: fileKeys.length === 1 ? fileKeys[0] : null,
    figma_file_keys: fileKeys,
    semantic_section_count: semanticSectionCount,
    breakpoint_image_count: breakpointImageCount,
    material_fingerprint: packageHash.digest('hex'),
    section_exports: sectionExports,
  };
}

function unique(values) {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))];
}

function toPosix(value) {
  return String(value).split(path.sep).join('/');
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
