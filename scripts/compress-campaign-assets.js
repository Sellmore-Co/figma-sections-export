#!/usr/bin/env node
// Compress final campaign assets only, leaving _ref screenshots untouched.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const preview = args.includes('--preview');
const slug = args.find((arg) => !arg.startsWith('--'));

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MIN_SAVINGS_BYTES = 1024;

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

if (!slug) {
  printHelp();
  process.exit(1);
}

let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  console.error('[compress-assets] "sharp" is required. Run npm install.');
  process.exit(1);
}

const imagesDir = path.join(root, 'src', slug, 'assets', 'images');

if (!fs.existsSync(imagesDir)) {
  console.error(`[compress-assets] No image asset directory found: src/${slug}/assets/images/`);
  process.exit(1);
}

const imagePaths = collectImages(imagesDir);
if (!imagePaths.length) {
  console.log(`[compress-assets] No JPG, PNG, WebP, or GIF assets found for ${slug}.`);
  process.exit(0);
}

compressAll(imagePaths).catch((error) => {
  console.error(`[compress-assets] ${error.message}`);
  process.exit(1);
});

async function compressAll(paths) {
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let totalSaved = 0;

  console.log(`[compress-assets] ${preview ? 'Previewing' : 'Compressing'} ${paths.length} image asset${paths.length === 1 ? '' : 's'} in src/${slug}/assets/images/`);

  for (const filePath of paths) {
    try {
      const result = await compressImage(filePath);
      const rel = toPosix(path.relative(root, filePath));
      if (result.skipped) {
        skipped++;
        continue;
      }

      processed++;
      totalSaved += result.bytesSaved;
      console.log(`  ${preview ? 'preview' : 'saved'} ${rel} ${formatSize(result.originalSize)} -> ${formatSize(result.compressedSize)} (${formatSize(result.bytesSaved)} saved)`);
    } catch (error) {
      errors++;
      console.error(`  error ${toPosix(path.relative(root, filePath))}: ${error.message}`);
    }
  }

  console.log(`[compress-assets] ${processed} ${preview ? 'ready' : 'compressed'}, ${skipped} skipped, ${formatSize(totalSaved)} saved.`);
  if (preview) console.log('[compress-assets] Preview only. Run without --preview to apply changes.');
  if (errors) process.exit(1);
}

async function compressImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const originalSize = fs.statSync(filePath).size;

  let pipeline = sharp(filePath);
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      pipeline = pipeline.jpeg({ quality: 80, progressive: true });
      break;
    case '.png':
      pipeline = pipeline.png({ compressionLevel: 9, palette: true });
      break;
    case '.webp':
      pipeline = pipeline.webp({ quality: 80 });
      break;
    case '.gif':
      pipeline = pipeline.gif();
      break;
  }

  const compressedBuffer = await pipeline.toBuffer();
  const compressedSize = compressedBuffer.length;

  if (compressedSize >= originalSize || originalSize - compressedSize < MIN_SAVINGS_BYTES) {
    return { skipped: true, originalSize, compressedSize: originalSize, bytesSaved: 0 };
  }

  if (!preview) fs.writeFileSync(filePath, compressedBuffer);
  return { skipped: false, originalSize, compressedSize, bytesSaved: originalSize - compressedSize };
}

function collectImages(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectImages(full, files);
      continue;
    }

    if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files.sort();
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function printHelp() {
  console.log(`Usage:
  npm run compress -- <slug>
  npm run compress:preview -- <slug>

Compresses only final handoff assets under:
  src/<slug>/assets/images/

It does not touch:
  src/<slug>/_ref/
  src/<slug>/_includes/
  any other campaign folder`);
}
