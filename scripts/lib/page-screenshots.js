// Page-level source screenshots for the campaigns-os design-source gate.
//
// campaigns-os 1.20 refuses intake (DESIGN_SOURCE_PACKAGE_NOT_READY) unless
// every renderable page carries an available desktop AND mobile source
// screenshot in `pages[].screenshots[]`. The raw material already exists:
// `save-ref.sh` downloads one Figma render per section and breakpoint into
// `_ref/<section>-<viewport>.png`. This module stitches those renders, in the
// order `landing.html` includes the sections, into one PNG per viewport under
// `_ref/pages/<page>-<viewport>.png`, and describes each result as a
// `sourceScreenshot` record (campaigns-os `source-html-manifest.v0` schema).
//
// Why stitch instead of rendering a Figma page frame: designers delete the
// Demo page from every merchant duplicate of the Debranded Sections library,
// so a real merchant file has no page-level frame to render. The per-section
// renders are the only Figma-side picture of the page that always exists.
//
// A stitched render is a picture of the design, not a browser capture, so the
// record leaves `browser` and `device_profile` empty and says so in `notes`.
// Consumers read `notes` to keep their trust field honest.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PNG } = require('pngjs');
const { extractCampaignIncludes } = require('./compare-shared');

const VIEWPORTS = ['desktop', 'tablet', 'mobile'];
const REQUIRED_VIEWPORTS = ['desktop', 'mobile'];
const PAGES_DIR = 'pages';
const STITCH_SOURCE = 'stitched_figma_section_renders';
const DIRECT_SOURCE = 'figma_page_render';

// Section names in the order `landing.html` includes them. Only
// `_includes/landing/<section>.html` includes count; anything else on the page
// is not a section this exporter produced.
function pageSectionOrder(pagePath) {
  if (!fs.existsSync(pagePath)) return [];
  const source = fs.readFileSync(pagePath, 'utf8');
  return extractCampaignIncludes(source)
    .map((include) => include.match(/^landing\/(.+)\.html$/i))
    .filter(Boolean)
    .map((match) => match[1]);
}

function readPngHeader(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const header = Buffer.alloc(24);
    const read = fs.readSync(fd, header, 0, 24, 0);
    if (read < 24 || header.toString('latin1', 1, 4) !== 'PNG' || header.toString('latin1', 12, 16) !== 'IHDR') {
      return null;
    }
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } finally {
    fs.closeSync(fd);
  }
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function refPath(campaignDir, section, viewport) {
  return path.join(campaignDir, '_ref', `${section}-${viewport}.png`);
}

function pageRefPath(campaignDir, pageName, viewport) {
  return path.join(campaignDir, '_ref', PAGES_DIR, `${pageName}-${viewport}.png`);
}

// Stack PNGs top to bottom. All inputs must share one width; a stitched page
// with a jagged edge is not a picture of the design.
function stitchPngs(inputs, outFile) {
  const images = inputs.map((file) => PNG.sync.read(fs.readFileSync(file)));
  const width = images[0].width;
  const height = images.reduce((sum, image) => sum + image.height, 0);
  const out = new PNG({ width, height });
  let offset = 0;
  for (const image of images) {
    image.data.copy(out.data, offset);
    offset += image.data.length;
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, PNG.sync.write(out));
  return { width, height };
}

function unavailable(pageName, viewport, reason) {
  return {
    id: `source-${pageName}-${viewport}`,
    kind: 'unavailable_render',
    viewport,
    availability: 'unavailable',
    unavailable_reason: reason,
  };
}

function available(pageName, viewport, { relPath, absPath, width, height, capturedAt, notes }) {
  return {
    id: `source-${pageName}-${viewport}`,
    kind: 'source_screenshot',
    viewport,
    availability: 'available',
    path: relPath,
    sha256: sha256File(absPath),
    width,
    height,
    captured_at: capturedAt,
    notes,
  };
}

function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

function newestMtime(files) {
  return new Date(Math.max(...files.map((file) => fs.statSync(file).mtimeMs))).toISOString();
}

// Build the screenshot record for one page + viewport. Stitches when the page
// is assembled from section includes; otherwise uses a whole-page ref named
// after the page (presells are exported whole, so `_ref/presell-<viewport>.png`).
function buildPageScreenshot({ campaignDir, pageName, pagePath, viewport, sections }) {
  if (sections.length === 0) {
    const direct = refPath(campaignDir, pageName, viewport);
    if (!fs.existsSync(direct)) {
      return unavailable(pageName, viewport, `no ${viewport} render: ${pageName}.html has no landing section includes to stitch and _ref/${pageName}-${viewport}.png does not exist`);
    }
    const dims = readPngHeader(direct);
    if (!dims) return unavailable(pageName, viewport, `_ref/${pageName}-${viewport}.png is not a PNG`);
    return available(pageName, viewport, {
      relPath: toPosix(path.relative(campaignDir, direct)),
      absPath: direct,
      width: dims.width,
      height: dims.height,
      capturedAt: newestMtime([direct]),
      notes: `Figma render of the whole ${pageName} page (${DIRECT_SOURCE}); not a browser capture.`,
    });
  }

  const missing = sections.filter((section) => !fs.existsSync(refPath(campaignDir, section, viewport)));
  if (missing.length) {
    return unavailable(pageName, viewport, `no ${viewport} render for section(s) ${missing.join(', ')}: run save-ref.sh for them, then re-run handoff`);
  }

  const files = sections.map((section) => refPath(campaignDir, section, viewport));
  const widths = files.map((file) => readPngHeader(file)?.width ?? null);
  if (widths.some((width) => width === null)) {
    return unavailable(pageName, viewport, `a ${viewport} section ref is not a PNG`);
  }
  const distinct = [...new Set(widths)];
  if (distinct.length > 1) {
    const detail = sections.map((section, index) => `${section}=${widths[index]}px`).join(', ');
    return unavailable(pageName, viewport, `${viewport} section refs have different widths (${detail}); re-export them at one frame width before stitching`);
  }

  const outFile = pageRefPath(campaignDir, pageName, viewport);
  const dims = stitchPngs(files, outFile);
  return available(pageName, viewport, {
    relPath: toPosix(path.relative(campaignDir, outFile)),
    absPath: outFile,
    width: dims.width,
    height: dims.height,
    capturedAt: newestMtime(files),
    notes: `Stitched from Figma node renders of ${sections.length} section(s) in ${path.basename(pagePath)} order: ${sections.join(', ')} (${STITCH_SOURCE}); not a browser capture.`,
  });
}

// All viewport records for one manifest page entry.
function buildPageScreenshots({ campaignDir, page }) {
  const pagePath = path.join(campaignDir, page.path);
  const pageName = path.basename(page.path, '.html');
  const sections = pageSectionOrder(pagePath);
  const screenshots = VIEWPORTS.map((viewport) => buildPageScreenshot({
    campaignDir,
    pageName,
    pagePath,
    viewport,
    sections,
  }));
  return {
    screenshots,
    screenshot_source: sections.length ? STITCH_SOURCE : DIRECT_SOURCE,
    stitched_sections: sections,
  };
}

module.exports = {
  DIRECT_SOURCE,
  PAGES_DIR,
  REQUIRED_VIEWPORTS,
  STITCH_SOURCE,
  VIEWPORTS,
  buildPageScreenshots,
  pageSectionOrder,
  readPngHeader,
  sha256File,
  stitchPngs,
};
