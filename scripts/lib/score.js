const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PNG } = require('pngjs');
const { ssim } = require('ssim.js');

const PIXELMATCH_THRESHOLD = 0.1;
const REGION_ROWS = 12;
const REGION_COLUMNS = 6;
const DEFAULT_TOP_REGIONS = 8;

let pixelmatchPromise;

function loadPixelmatch() {
  if (!pixelmatchPromise) {
    pixelmatchPromise = import('pixelmatch').then((module) => module.default);
  }
  return pixelmatchPromise;
}

function elapsedMs(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

async function readDimensions(input) {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) throw new Error('Could not read PNG dimensions.');
  return { width: metadata.width, height: metadata.height };
}

async function padPng(input, dimensions, targetWidth, targetHeight) {
  const buffer = await sharp(input)
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

async function normalizePair(referenceInput, candidateInput) {
  const referenceDimensions = await readDimensions(referenceInput);
  const candidateDimensions = await readDimensions(candidateInput);
  const width = Math.max(referenceDimensions.width, candidateDimensions.width);
  const height = Math.max(referenceDimensions.height, candidateDimensions.height);

  return {
    reference: await padPng(referenceInput, referenceDimensions, width, height),
    candidate: await padPng(candidateInput, candidateDimensions, width, height),
    referenceDimensions,
    candidateDimensions,
    normalizedCanvas: { width, height },
  };
}

async function pixelmatchScore(reference, candidate, threshold = PIXELMATCH_THRESHOLD, includeDiff = false) {
  const pixelmatch = await loadPixelmatch();
  const diff = includeDiff ? new PNG({ width: reference.width, height: reference.height }) : null;
  const start = process.hrtime.bigint();
  const mismatchPixels = pixelmatch(
    reference.data,
    candidate.data,
    diff ? diff.data : null,
    reference.width,
    reference.height,
    { threshold },
  );

  const result = {
    mismatchPixels,
    mismatchRatio: mismatchPixels / (reference.width * reference.height),
    runtimeMs: elapsedMs(start),
  };
  if (diff) result.diff = diff;
  return result;
}

function ssimScore(reference, candidate) {
  const start = process.hrtime.bigint();
  const measurement = ssim(reference, candidate);
  return {
    mean: measurement.mssim,
    runtimeMs: elapsedMs(start),
  };
}

function isMismatchPixel(data, offset) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  return (red === 255 && green === 0 && blue === 0)
    || (red === 0 && green === 255 && blue === 0);
}

function topMismatchRegions(diff, options = {}) {
  const rows = options.rows || REGION_ROWS;
  const columns = options.columns || REGION_COLUMNS;
  const limit = options.limit || DEFAULT_TOP_REGIONS;
  const regions = [];

  for (let row = 0; row < rows; row += 1) {
    const y = Math.floor((row * diff.height) / rows);
    const bottom = Math.floor(((row + 1) * diff.height) / rows);
    for (let column = 0; column < columns; column += 1) {
      const x = Math.floor((column * diff.width) / columns);
      const right = Math.floor(((column + 1) * diff.width) / columns);
      const width = right - x;
      const height = bottom - y;
      if (width === 0 || height === 0) continue;

      let mismatchPixels = 0;
      for (let pixelY = y; pixelY < bottom; pixelY += 1) {
        for (let pixelX = x; pixelX < right; pixelX += 1) {
          const offset = (pixelY * diff.width + pixelX) * 4;
          if (isMismatchPixel(diff.data, offset)) mismatchPixels += 1;
        }
      }

      if (mismatchPixels > 0) {
        regions.push({
          row,
          column,
          bounds: { x, y, width, height },
          mismatchPixels,
          mismatchRatio: mismatchPixels / (width * height),
        });
      }
    }
  }

  return regions
    .sort((a, b) => b.mismatchRatio - a.mismatchRatio
      || b.mismatchPixels - a.mismatchPixels
      || a.row - b.row
      || a.column - b.column)
    .slice(0, limit);
}

async function scorePair(referenceInput, candidateInput, options = {}) {
  const normalized = await normalizePair(referenceInput, candidateInput);
  const pixelmatch = await pixelmatchScore(
    normalized.reference,
    normalized.candidate,
    options.pixelmatchThreshold ?? PIXELMATCH_THRESHOLD,
    true,
  );
  const structuralSimilarity = ssimScore(normalized.reference, normalized.candidate);
  const heatmapBuffer = PNG.sync.write(pixelmatch.diff);

  if (options.heatmapPath) {
    fs.mkdirSync(path.dirname(options.heatmapPath), { recursive: true });
    fs.writeFileSync(options.heatmapPath, heatmapBuffer);
  }

  return {
    score: pixelmatch.mismatchRatio,
    mismatchPixels: pixelmatch.mismatchPixels,
    dimensionsMatch: normalized.referenceDimensions.width === normalized.candidateDimensions.width
      && normalized.referenceDimensions.height === normalized.candidateDimensions.height,
    dimensionDelta: {
      width: normalized.candidateDimensions.width - normalized.referenceDimensions.width,
      height: normalized.candidateDimensions.height - normalized.referenceDimensions.height,
    },
    dimensions: {
      reference: normalized.referenceDimensions,
      candidate: normalized.candidateDimensions,
      normalizedCanvas: normalized.normalizedCanvas,
    },
    ssim: structuralSimilarity.mean,
    topRegions: topMismatchRegions(pixelmatch.diff, { limit: options.topRegionCount }),
    heatmapBuffer,
    runtimeMs: {
      pixelmatch: pixelmatch.runtimeMs,
      ssim: structuralSimilarity.runtimeMs,
    },
  };
}

function evaluateThreshold(scores, threshold) {
  const entries = Array.isArray(scores)
    ? scores.map((result, index) => [String(index), result])
    : Object.entries(scores);
  const values = entries.map(([, result]) => result);
  // The dimension gate is independent of the optional pixel threshold: a
  // dimension mismatch always fails, even when no threshold is supplied.
  if (!values.every((result) => result.dimensionsMatch)) return false;
  if (threshold === null || threshold === undefined) return null;
  return entries.every(([name, result]) => {
    const breakpointThreshold = typeof threshold === 'number' ? threshold : threshold[name];
    return Number.isFinite(breakpointThreshold) && result.score <= breakpointThreshold;
  });
}

function resolveThresholds(explicitThreshold, calibration, breakpointNames) {
  if (explicitThreshold !== null && explicitThreshold !== undefined) {
    return {
      thresholds: Object.fromEntries(breakpointNames.map((name) => [name, explicitThreshold])),
      source: 'flag',
    };
  }
  if (calibration) {
    const thresholds = Object.fromEntries(breakpointNames.map((name) => [name, calibration[name]?.threshold]));
    if (Object.values(thresholds).every(Number.isFinite)) return { thresholds, source: 'calibration' };
  }
  return { thresholds: null, source: null };
}

module.exports = {
  DEFAULT_TOP_REGIONS,
  PIXELMATCH_THRESHOLD,
  REGION_COLUMNS,
  REGION_ROWS,
  evaluateThreshold,
  resolveThresholds,
  normalizePair,
  readDimensions,
  pixelmatchScore,
  scorePair,
  ssimScore,
  topMismatchRegions,
};
