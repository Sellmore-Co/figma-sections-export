#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PNG } = require('pngjs');
const pixelmatchModule = require('pixelmatch');
const { ssim } = require('ssim.js');

const pixelmatch = pixelmatchModule.default || pixelmatchModule;
const ROOT = path.join(__dirname, '..', '..');
const GOLDEN = path.join(ROOT, 'src', 'shield', '_ref', 'hero-4-desktop.png');
const OUT_DIR = path.join(__dirname, 'out');
const RESULTS_PATH = path.join(__dirname, 'RESULTS.json');
const REPORT_PATH = path.join(__dirname, 'REPORT.md');

const COMPARISONS = [
  { id: 'self', class: 'CONTROL', file: null, label: 'Golden vs itself' },
  { id: 'translate-x-1px', class: 'NOISE', file: 'noise-translate-x-1px.png', label: '1px horizontal translate' },
  { id: 'blur-sigma-0.5', class: 'NOISE', file: 'noise-blur-sigma-0.5.png', label: 'Gaussian blur sigma 0.5' },
  { id: 'blur-sigma-1.0', class: 'NOISE', file: 'noise-blur-sigma-1.0.png', label: 'Gaussian blur sigma 1.0' },
  { id: 'brightness-plus-2pct', class: 'NOISE', file: 'noise-brightness-plus-2pct.png', label: 'Global brightness +2%' },
  { id: 'band-shift-y-24px', class: 'DEFECT', file: 'defect-band-shift-y-24px.png', label: '200px band shifted down 24px' },
  { id: 'missing-button', class: 'DEFECT', file: 'defect-missing-button.png', label: 'Button-sized region removed' },
  { id: 'hue-rotate-30deg', class: 'DEFECT', file: 'defect-hue-rotate-30deg.png', label: 'Whole image hue +30deg' },
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

async function normalizePng(file, targetWidth, targetHeight) {
  const metadata = await sharp(file).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Could not read dimensions: ${file}`);

  // Top-left anchoring matches browser screenshots. Excess right/bottom pixels
  // are cropped; missing right/bottom pixels are padded opaque white.
  const cropWidth = Math.min(metadata.width, targetWidth);
  const cropHeight = Math.min(metadata.height, targetHeight);
  const buffer = await sharp(file)
    .flatten({ background: '#ffffff' })
    .extract({ left: 0, top: 0, width: cropWidth, height: cropHeight })
    .extend({
      right: targetWidth - cropWidth,
      bottom: targetHeight - cropHeight,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  return PNG.sync.read(buffer);
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
    `| ${row.class} | ${row.label} | ${fixed(row.pixelmatch.threshold01.mismatchRatio)} | ${fixed(row.pixelmatch.threshold01.runtimeMs, 2)} | ${fixed(row.pixelmatch.threshold03.mismatchRatio)} | ${fixed(row.pixelmatch.threshold03.runtimeMs, 2)} | ${fixed(row.ssim.mean)} | ${fixed(row.ssim.runtimeMs, 2)} |`,
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

  const cleanMetrics = items.filter(([, item]) => item.separates).map(([name]) => name);
  const recommendation = results.separability.ssim.separates
    ? `Ratify **SSIM as the pass/fail gate** at a provisional mean threshold of **${fixed(results.separability.ssim.candidateThreshold)} or lower = defect**, and retain **Pixelmatch 0.1 for a diagnostic heatmap/localization**, not as the sole gate. On this corpus, SSIM separates every tolerated noise case from every required defect${cleanMetrics.length > 1 ? `; the other separating metric(s) were ${cleanMetrics.filter((name) => name !== 'SSIM').join(', ')}` : ''}. The threshold is provisional: Phase 2 should validate it against real browser captures before production adoption.`
    : `Ratify **neither metric as a standalone pass/fail gate** from this spike. Pixelmatch 0.1 confuses tolerated blur with the missing-button defect, Pixelmatch 0.3 misses the hue defect entirely, and luminance-oriented SSIM rates the hue defect as more similar than the tolerated 1px translation. If Phase 2 must proceed before another metric spike, carry **SSIM as structural telemetry plus Pixelmatch 0.1 as a diagnostic heatmap/localizer**, with no automated pass/fail threshold. A production gate needs either a validated compound rule with an explicitly color-sensitive term or a broader real-capture corpus that changes the class boundary; deriving a two-dimensional rule from this single frame would be overfitting.`;

  return `# Image-diff metric decision spike\n\n## Golden frame\n\nThe golden frame is \`src/shield/_ref/hero-4-desktop.png\` (${results.golden.width}×${results.golden.height}). It has a complete \`hero-4\` desktop/tablet/mobile reference set and is the richest complete desktop candidate: a large natural photograph, multiple font sizes and weights, small icons/checkmarks, a high-contrast CTA, and a testimonial card. This gives the metrics textured imagery, antialiased text edges, flat-color UI, and fine detail in one frame.\n\nThe local \`src/shield/_ref/\` files are read-only inputs and remain gitignored. Generated perturbation PNGs live in \`scripts/spike/out/\` and are also gitignored.\n\n## Dimension strategy\n\nBefore scoring, both images are normalized to the golden canvas. They are anchored at the top-left (matching page screenshots), excess pixels are cropped from the right/bottom, and missing pixels are padded on the right/bottom with opaque white. The generated spike variants already match the golden dimensions, but this makes the scorer safe for future unequal inputs. Image decode and normalization time is excluded from per-metric runtime; each runtime measures only the metric call.\n\n## Results\n\nPixelmatch values are mismatched-pixel ratios (lower is more similar). SSIM is mean structural similarity (higher is more similar). Runtimes are wall-clock milliseconds from one offline run and are comparative, not benchmarks. Raw precision is in \`RESULTS.json\`.\n\n| Class | Perturbation | Pixelmatch 0.1 | ms | Pixelmatch 0.3 | ms | Mean SSIM | ms |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows}\n\n## Separability\n\nFor Pixelmatch, the NOISE boundary is the highest mismatch ratio and the DEFECT boundary is the lowest mismatch ratio. For SSIM, the NOISE boundary is the lowest similarity and the DEFECT boundary is the highest similarity. A positive gap means a single threshold cleanly separates all four cases in each class.\n\n| Metric | Worst NOISE | Best DEFECT | Gap | Separates? | Candidate threshold |\n| --- | ---: | ---: | ---: | :---: | --- |\n${separationRows}\n\n## Recommendation\n\n${recommendation}\n`;
}

async function main() {
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
  const golden = await normalizePng(GOLDEN, width, height);
  const comparisons = [];

  for (const comparison of COMPARISONS) {
    const file = comparison.file ? path.join(OUT_DIR, comparison.file) : GOLDEN;
    const candidate = await normalizePng(file, width, height);
    const row = {
      id: comparison.id,
      class: comparison.class,
      label: comparison.label,
      file: comparison.file ? path.relative(ROOT, file) : path.relative(ROOT, GOLDEN),
      pixelmatch: {
        threshold01: pixelmatchScore(golden, candidate, 0.1),
        threshold03: pixelmatchScore(golden, candidate, 0.3),
      },
      ssim: ssimScore(golden, candidate),
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
    normalization: 'Top-left anchor; crop excess right/bottom; pad missing right/bottom opaque white.',
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
