#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..', '..');
const GOLDEN = path.join(ROOT, 'src', 'shield', '_ref', 'hero-4-desktop.png');
const OUT_DIR = path.join(__dirname, 'out');

async function write(name, pipeline) {
  const output = path.join(OUT_DIR, `${name}.png`);
  await pipeline.png().toFile(output);
  console.log(`  wrote ${path.relative(ROOT, output)}`);
}

function gaussianKernel(sigma) {
  const radius = Math.ceil(sigma * 3);
  const width = radius * 2 + 1;
  const kernel = [];
  let sum = 0;
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const weight = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
      kernel.push(weight);
      sum += weight;
    }
  }
  return { width, height: width, kernel: kernel.map((weight) => weight / sum) };
}

async function localizedEdgeBlur(sigma, strength) {
  const source = sharp(GOLDEN).flatten({ background: '#ffffff' }).ensureAlpha();
  const { data: original, info } = await source.clone().raw().toBuffer({ resolveWithObject: true });
  const blurred = await source.clone().convolve(gaussianKernel(sigma)).raw().toBuffer();
  const luminance = new Uint8Array(info.width * info.height);
  const edge = new Uint8Array(info.width * info.height);
  const radius = 2;

  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * info.channels;
    luminance[index] = Math.round(
      original[offset] * 0.2126 + original[offset + 1] * 0.7152 + original[offset + 2] * 0.0722,
    );
  }

  // Browser font/AA differences alter coverage near high-contrast vector edges;
  // they do not soften the entire screenshot. Detect those edges with a simple
  // central-difference gradient, then expand the mask by two pixels.
  for (let y = 1; y < info.height - 1; y += 1) {
    for (let x = 1; x < info.width - 1; x += 1) {
      const index = y * info.width + x;
      const gradientX = Math.abs(luminance[index + 1] - luminance[index - 1]);
      const gradientY = Math.abs(luminance[index + info.width] - luminance[index - info.width]);
      if (Math.max(gradientX, gradientY) < 48) continue;
      for (let maskY = Math.max(0, y - radius); maskY <= Math.min(info.height - 1, y + radius); maskY += 1) {
        for (let maskX = Math.max(0, x - radius); maskX <= Math.min(info.width - 1, x + radius); maskX += 1) {
          edge[maskY * info.width + maskX] = 1;
        }
      }
    }
  }

  const output = Buffer.from(original);
  for (let index = 0; index < edge.length; index += 1) {
    if (!edge[index]) continue;
    const offset = index * info.channels;
    for (let channel = 0; channel < 3; channel += 1) {
      output[offset + channel] = Math.round(
        original[offset + channel] * (1 - strength) + blurred[offset + channel] * strength,
      );
    }
  }

  return sharp(output, { raw: info });
}

async function main() {
  if (!fs.existsSync(GOLDEN)) {
    throw new Error(`Golden frame is missing: ${path.relative(ROOT, GOLDEN)}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { width, height } = await sharp(GOLDEN).metadata();
  if (!width || !height) throw new Error('Could not read golden-frame dimensions.');

  // Noise: rendering differences that should not fail an otherwise faithful export.
  await write(
    'noise-translate-x-1px',
    sharp(GOLDEN)
      .extract({ left: 0, top: 0, width: width - 1, height })
      .extend({ left: 1, background: { r: 255, g: 255, b: 255, alpha: 1 } }),
  );
  // Use explicit Gaussian kernels because libvips treats sigma 0.5 as a no-op.
  // Both perturbations are restricted to a 2px high-contrast edge mask so
  // photographs and flat backgrounds remain untouched away from their edges.
  await write('noise-text-edge-aa-mild', await localizedEdgeBlur(0.5, 0.65));
  await write('noise-text-edge-aa-strong', await localizedEdgeBlur(1, 0.45));
  await write('noise-brightness-plus-2pct', sharp(GOLDEN).modulate({ brightness: 1.02 }));

  // Defect: layout/content/color changes that an accuracy harness must catch.
  const bandTop = 260;
  const bandHeight = 200;
  const bandShift = 24;
  const band = await sharp(GOLDEN)
    .extract({ left: 0, top: bandTop, width, height: bandHeight })
    .png()
    .toBuffer();
  await write(
    'defect-band-shift-y-24px',
    sharp(GOLDEN).composite([
      {
        input: {
          create: {
            width,
            height: bandShift,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          },
        },
        left: 0,
        top: bandTop,
      },
      { input: band, left: 0, top: bandTop + bandShift },
    ]),
  );

  await write(
    'defect-missing-button',
    sharp(GOLDEN).composite([
      {
        input: {
          create: {
            width: 420,
            height: 72,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          },
        },
        left: 860,
        top: 450,
      },
    ]),
  );

  await write('defect-hue-rotate-30deg', sharp(GOLDEN).modulate({ hue: 30 }));

  await write(
    'defect-extra-right-strip-100px',
    sharp(GOLDEN).extend({
      right: 100,
      background: { r: 224, g: 224, b: 224, alpha: 1 },
    }),
  );

  const textArea = { left: 720, top: 90, width: 680, height: 340 };
  const scaledTextArea = await sharp(GOLDEN)
    .extract(textArea)
    .resize({
      width: Math.round(textArea.width * 1.15),
      height: Math.round(textArea.height * 1.15),
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    })
    .extract({ left: 0, top: 0, width: textArea.width, height: textArea.height })
    .png()
    .toBuffer();
  await write(
    'defect-text-area-scale-115pct',
    sharp(GOLDEN).composite([{ input: scaledTextArea, left: textArea.left, top: textArea.top }]),
  );

  console.log(`\nGenerated 9 deterministic perturbations from ${path.relative(ROOT, GOLDEN)}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
