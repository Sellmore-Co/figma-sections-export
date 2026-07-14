#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const OUTPUT_DIR = __dirname;

function makeBase(width = 64, height = 64) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      png.data[offset] = 224 + ((x * 3 + y) % 24);
      png.data[offset + 1] = 228 + ((x + y * 2) % 20);
      png.data[offset + 2] = 232 + ((x * 2 + y * 3) % 16);
      png.data[offset + 3] = 255;
    }
  }
  return png;
}

function clonePng(source, width = source.width, height = source.height) {
  const png = new PNG({ width, height });
  png.data.fill(255);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = (y * source.width + x) * 4;
      const targetOffset = (y * width + x) * 4;
      source.data.copy(png.data, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return png;
}

function write(name, png) {
  fs.writeFileSync(path.join(OUTPUT_DIR, name), PNG.sync.write(png));
}

const reference = makeBase();
const defect = clonePng(reference);

// Fill grid cell row 8, column 4 for a deterministic localization assertion.
for (let y = 42; y < 48; y += 1) {
  for (let x = 42; x < 53; x += 1) {
    const offset = (y * defect.width + x) * 4;
    defect.data[offset] = 0;
    defect.data[offset + 1] = 0;
    defect.data[offset + 2] = 0;
  }
}

write('score-reference.png', reference);
write('score-identical.png', clonePng(reference));
write('score-defect.png', defect);
write('score-dimension-mismatch.png', clonePng(reference, 68, 64));
const heightMismatch = clonePng(reference, 64, 68);
for (let y = 64; y < heightMismatch.height; y += 1) {
  for (let x = 0; x < heightMismatch.width; x += 1) {
    const offset = (y * heightMismatch.width + x) * 4;
    heightMismatch.data[offset] = 0;
    heightMismatch.data[offset + 1] = 0;
    heightMismatch.data[offset + 2] = 0;
  }
}
write('score-height-mismatch.png', heightMismatch);
