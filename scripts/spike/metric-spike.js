#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PNG } = require('pngjs');
const { ssim } = require('ssim.js');

let pixelmatch;
const ROOT = path.join(__dirname, '..', '..');
const GOLDEN = path.join(ROOT, 'src', 'shield', '_ref', 'hero-4-desktop.png');
const OUT_DIR = path.join(__dirname, 'out');
const RESULTS_PATH = path.join(__dirname, 'RESULTS.json');
const REPORT_PATH = path.join(__dirname, 'REPORT.md');

const COMPARISONS = [
  { id: 'self', class: 'CONTROL', file: null, label: 'Golden vs itself' },
  { id: 'translate-x-1px', class: 'NOISE', file: 'noise-translate-x-1px.png', label: '1px horizontal translate' },
  { id: 'text-edge-aa-mild', class: 'NOISE', file: 'noise-text-edge-aa-mild.png', label: 'Localized text/vector-edge AA (mild)' },
  { id: 'text-edge-aa-strong', class: 'NOISE', file: 'noise-text-edge-aa-strong.png', label: 'Localized text/vector-edge AA (strong)' },
  { id: 'brightness-plus-2pct', class: 'NOISE', file: 'noise-brightness-plus-2pct.png', label: 'Global brightness +2%' },
  { id: 'band-shift-y-24px', class: 'DEFECT', file: 'defect-band-shift-y-24px.png', label: '200px band shifted down 24px' },
  { id: 'missing-button', class: 'DEFECT', file: 'defect-missing-button.png', label: 'Button-sized region removed' },
  { id: 'hue-rotate-30deg', class: 'DEFECT', file: 'defect-hue-rotate-30deg.png', label: 'Whole image hue +30deg' },
  { id: 'extra-right-strip-100px', class: 'DEFECT', file: 'defect-extra-right-strip-100px.png', label: 'Extra 100px right-side canvas strip' },
  { id: 'text-area-scale-115pct', class: 'DEFECT', file: 'defect-text-area-scale-115pct.png', label: 'Text area scaled to 115%' },
];

function elapsedMs(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function timed(fn) {
  const start = process.hrtime.bigint();
  const value = fn();
  return { value, runtimeMs: elapsedMs(start) };
}

async function readDimensions(file) {
  const metadata = await sharp(file).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Could not read dimensions: ${file}`);
  return { width: metadata.width, height: metadata.height };
}

async function padPng(file, dimensions, targetWidth, targetHeight) {
  const buffer = await sharp(file)
    .flatten({ background: '#ffffff' })
    .extend({
      right: targetWidth - dimensions.width,
      bottom: targetHeight - dimensions.height,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  return PNG.sync.read(buffer);
}

async function normalizePair(goldenFile, candidateFile) {
  const goldenDimensions = await readDimensions(goldenFile);
  const candidateDimensions = await readDimensions(candidateFile);
  const width = Math.max(goldenDimensions.width, candidateDimensions.width);
  const height = Math.max(goldenDimensions.height, candidateDimensions.height);
  return {
    golden: await padPng(goldenFile, goldenDimensions, width, height),
    candidate: await padPng(candidateFile, candidateDimensions, width, height),
    goldenDimensions,
    candidateDimensions,
    normalizedCanvas: { width, height },
  };
}

function pixelmatchScore(golden, candidate, threshold) {
  const measurement = timed(() =>
    pixelmatch(golden.data, candidate.data, null, golden.width, golden.height, { threshold }),
  );
  return {
    mismatchPixels: measurement.value,
    mismatchRatio: measurement.value / (golden.width * golden.height),
    runtimeMs: measurement.runtimeMs,
  };
}

function ssimScore(golden, candidate) {
  const measurement = timed(() => ssim(golden, candidate));
  return {
    mean: measurement.value.mssim,
    runtimeMs: measurement.runtimeMs,
  };
}

function separability(rows, selector, direction) {
  const noise = rows.filter((row) => row.class === 'NOISE');
  const defects = rows.filter((row) => row.class === 'DEFECT');
  const worstNoise = direction === 'higher-is-worse'
    ? noise.reduce((a, b) => (selector(b) > selector(a) ? b : a))
    : noise.reduce((a, b) => (selector(b) < selector(a) ? b : a));
  const bestDefect = direction === 'higher-is-worse'
    ? defects.reduce((a, b) => (selector(b) < selector(a) ? b : a))
    : defects.reduce((a, b) => (selector(b) > selector(a) ? b : a));
  const noiseBoundary = selector(worstNoise);
  const defectBoundary = selector(bestDefect);
  const gap = direction === 'higher-is-worse'
    ? defectBoundary - noiseBoundary
    : noiseBoundary - defectBoundary;
  return {
    direction,
    worstNoise: { id: worstNoise.id, value: noiseBoundary },
    bestDefect: { id: bestDefect.id, value: defectBoundary },
    gap,
    separates: gap > 0,
    candidateThreshold: gap > 0 ? (noiseBoundary + defectBoundary) / 2 : null,
  };
}

function fixed(value, digits = 6) {
  return Number(value).toFixed(digits);
}

function renderReport(results) {
  const rows = results.comparisons.map((row) =>
    `| ${row.class} | ${row.label} | ${row.dimensionsMatch ? 'Yes' : `No (${row.dimensionDelta.width >= 0 ? '+' : ''}${row.dimensionDelta.width}×${row.dimensionDelta.height >= 0 ? '+' : ''}${row.dimensionDelta.height})`} | ${fixed(row.pixelmatch.threshold01.mismatchRatio)} | ${fixed(row.pixelmatch.threshold01.runtimeMs, 2)} | ${fixed(row.pixelmatch.threshold03.mismatchRatio)} | ${fixed(row.pixelmatch.threshold03.runtimeMs, 2)} | ${fixed(row.ssim.mean)} | ${fixed(row.ssim.runtimeMs, 2)} |`,
  ).join('\n');

  const items = [
    ['Pixelmatch 0.1', results.separability.pixelmatchThreshold01, 'mismatch ratio', 'fail at or above'],
    ['Pixelmatch 0.3', results.separability.pixelmatchThreshold03, 'mismatch ratio', 'fail at or above'],
    ['SSIM', results.separability.ssim, 'mean SSIM', 'fail at or below'],
  ];
  const separationRows = items.map(([name, item, unit, policy]) => {
    const threshold = item.candidateThreshold === null ? 'none' : `${fixed(item.candidateThreshold)} (${policy})`;
    return `| ${name} | ${item.worstNoise.id}: ${fixed(item.worstNoise.value)} | ${item.bestDefect.id}: ${fixed(item.bestDefect.value)} | ${fixed(item.gap)} | ${item.separates ? 'Yes' : 'No'} | ${threshold} |`;
  }).join('\n');

  const separatingMetrics = items.filter(([, item]) => item.separates);
  const thresholdSummary = separatingMetrics.map(([name, item, , policy]) =>
    `**${name} ${fixed(item.candidateThreshold)}** (${policy})`,
  ).join(' and ');
  const recommendation = separatingMetrics.length > 0
    ? `The corrected corpus supports ${separatingMetrics.length === 1 ? '**one standalone candidate gate**' : `**${separatingMetrics.length} standalone candidate gates**`}: ${thresholdSummary}. This recommendation is selected generically from every metric whose worst NOISE and best DEFECT boundaries have a positive gap; it does not privilege SSIM. Dimension equality must remain a separate first-class gate because even white excess canvas can be invisible to pixel metrics after padding. Thresholds remain provisional until Phase 2 validates them against real browser captures.`
    : `**No measured metric is a standalone pass/fail candidate** on the corrected corpus because none has a positive NOISE-to-DEFECT gap. Keep dimension equality as a separate first-class gate and retain the metrics as diagnostics only. A production pixel gate needs a broader real-capture corpus and possibly a compound color-sensitive rule; deriving one from this single frame would be overfitting.`;

  return `# Image-diff metric decision spike\n\n## Golden frame\n\nThe golden frame is \`src/shield/_ref/hero-4-desktop.png\` (${results.golden.width}×${results.golden.height}). It has a complete \`hero-4\` desktop/tablet/mobile reference set and is the richest complete desktop candidate: a large natural photograph, multiple font sizes and weights, small icons/checkmarks, a high-contrast CTA, and a testimonial card. This gives the metrics textured imagery, antialiased text edges, flat-color UI, and fine detail in one frame.\n\nThe local \`src/shield/_ref/\` files are read-only inputs and remain gitignored. Generated perturbation PNGs live in \`scripts/spike/out/\` and are also gitignored.\n\n## Noise model\n\nThe former full-frame sigma-1.0 blur was removed from the tolerated NOISE class because browser font rasterization does not blur photos and backgrounds. Both replacement AA cases detect high-contrast edges with a deterministic luminance gradient, expand that mask by two pixels, and blend a Gaussian-softened value only inside the mask. The sigma-0.5 case is localized too: although mild full-frame blur can resemble resampling, localizing it makes the tolerated class specifically model glyph/vector coverage variation rather than camera/content softness.\n\n## Dimension strategy\n\nDimension equality is reported independently for every comparison as \`dimensionsMatch\` plus signed width/height deltas. For pixel scoring, both images are top-left anchored and padded to the union canvas with opaque white; no candidate pixels are cropped. Thus excess candidate content contributes to image metrics, while even an all-white extra strip still fails the explicit dimension signal. Image decode and normalization time is excluded from per-metric runtime; each runtime measures only the metric call.\n\n## Results\n\nPixelmatch values are mismatched-pixel ratios (lower is more similar). SSIM is mean structural similarity (higher is more similar). Dimension deltas are candidate minus golden. Runtimes are wall-clock milliseconds from one offline run and are comparative, not benchmarks. Raw precision is in \`RESULTS.json\`.\n\n| Class | Perturbation | Dimensions match? | Pixelmatch 0.1 | ms | Pixelmatch 0.3 | ms | Mean SSIM | ms |\n| --- | --- | :---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows}\n\n## Separability\n\nFor Pixelmatch, the NOISE boundary is the highest mismatch ratio and the DEFECT boundary is the lowest mismatch ratio. For SSIM, the NOISE boundary is the lowest similarity and the DEFECT boundary is the highest similarity. A positive gap means a single threshold cleanly separates all ${results.comparisons.filter((row) => row.class === 'NOISE').length} NOISE cases from all ${results.comparisons.filter((row) => row.class === 'DEFECT').length} DEFECT cases. The dimension boolean is not numerically combined with these scores; the union-canvas pixels from the dimension-defect case are still part of the scalar corpus.\n\n| Metric | Worst NOISE | Best DEFECT | Gap | Separates? | Candidate threshold |\n| --- | ---: | ---: | ---: | :---: | --- |\n${separationRows}\n\n## Recommendation\n\n${recommendation}\n`;
}

async function main() {
  ({ default: pixelmatch } = await import('pixelmatch'));
  if (!fs.existsSync(GOLDEN)) throw new Error(`Golden frame is missing: ${path.relative(ROOT, GOLDEN)}`);
  for (const comparison of COMPARISONS.filter((item) => item.file)) {
    const file = path.join(OUT_DIR, comparison.file);
    if (!fs.existsSync(file)) {
      throw new Error(`Missing perturbation: ${path.relative(ROOT, file)}. Run generate-perturbations.js first.`);
    }
  }

  const metadata = await sharp(GOLDEN).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) throw new Error('Could not read golden-frame dimensions.');
  const comparisons = [];

  for (const comparison of COMPARISONS) {
    const file = comparison.file ? path.join(OUT_DIR, comparison.file) : GOLDEN;
    const normalized = await normalizePair(GOLDEN, file);
    const dimensionsMatch = normalized.goldenDimensions.width === normalized.candidateDimensions.width
      && normalized.goldenDimensions.height === normalized.candidateDimensions.height;
    const row = {
      id: comparison.id,
      class: comparison.class,
      label: comparison.label,
      file: comparison.file ? path.relative(ROOT, file) : path.relative(ROOT, GOLDEN),
      dimensionsMatch,
      dimensionDelta: {
        width: normalized.candidateDimensions.width - normalized.goldenDimensions.width,
        height: normalized.candidateDimensions.height - normalized.goldenDimensions.height,
      },
      dimensions: {
        golden: normalized.goldenDimensions,
        candidate: normalized.candidateDimensions,
        normalizedCanvas: normalized.normalizedCanvas,
      },
      pixelmatch: {
        threshold01: pixelmatchScore(normalized.golden, normalized.candidate, 0.1),
        threshold03: pixelmatchScore(normalized.golden, normalized.candidate, 0.3),
      },
      ssim: ssimScore(normalized.golden, normalized.candidate),
    };
    comparisons.push(row);
    console.log(`  scored ${comparison.class.padEnd(7)} ${comparison.id}`);
  }

  const results = {
    spike: 'phase-1-image-diff-metric',
    golden: {
      file: path.relative(ROOT, GOLDEN),
      referenceSet: ['hero-4-desktop.png', 'hero-4-tablet.png', 'hero-4-mobile.png'],
      width,
      height,
    },
    normalization: 'Top-left anchor; pad both images to union canvas with opaque white; never crop excess content.',
    comparisons,
    separability: {
      pixelmatchThreshold01: separability(comparisons, (row) => row.pixelmatch.threshold01.mismatchRatio, 'higher-is-worse'),
      pixelmatchThreshold03: separability(comparisons, (row) => row.pixelmatch.threshold03.mismatchRatio, 'higher-is-worse'),
      ssim: separability(comparisons, (row) => row.ssim.mean, 'lower-is-worse'),
    },
  };

  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(results, null, 2)}\n`);
  fs.writeFileSync(REPORT_PATH, renderReport(results));
  console.log(`\nWrote ${path.relative(ROOT, RESULTS_PATH)} and ${path.relative(ROOT, REPORT_PATH)}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
