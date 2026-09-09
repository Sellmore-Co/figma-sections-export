// Page-level source screenshot tests: stitching per-section Figma renders into
// the desktop + mobile proof campaigns-os 1.20 intake requires, the manifest
// records that describe them, and validate-export's gate check.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { PNG } = require('pngjs');

const { buildManifest } = require('../write-handoff-manifest');
const { pageSectionOrder, PAGES_DIR } = require('../lib/page-screenshots');

const VALIDATE = path.join(__dirname, '..', 'validate-export.js');
const GENERATOR_ROOT = path.join(__dirname, '..', '..');

function solidPng(file, width, height, rgb) {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i += 1) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// A minimal semantic export: two landing sections, one asset, refs for both
// sections on desktop but only one on mobile.
function makeCampaign() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fse-shots-'));
  write(path.join(dir, 'landing.html'), [
    '---',
    'title: Fixture',
    '---',
    "{% campaign_include 'landing/hero-1.html' %}",
    '{% campaign_include "landing/benefits-2.html" %}',
    '',
  ].join('\n'));
  write(path.join(dir, '_includes', 'landing', 'hero-1.html'), '<section class="max-w-[1440px] mx-auto">{{ hero_1_heading }}</section>\n');
  write(path.join(dir, '_includes', 'landing', 'benefits-2.html'), '<section class="max-w-[1440px] mx-auto">{{ benefits_2_heading }}</section>\n');
  write(path.join(dir, 'assets', 'images', 'hero-1', 'hero.png'), 'not really a png');
  solidPng(path.join(dir, '_ref', 'hero-1-desktop.png'), 1440, 10, [255, 0, 0]);
  solidPng(path.join(dir, '_ref', 'benefits-2-desktop.png'), 1440, 20, [0, 255, 0]);
  solidPng(path.join(dir, '_ref', 'hero-1-mobile.png'), 375, 8, [0, 0, 255]);
  return dir;
}

function writeManifestFile(dir, manifest) {
  write(path.join(dir, '.campaigns-os', 'source-html-manifest.json'), JSON.stringify(manifest, null, 2));
}

function runValidate(dir) {
  try {
    const stdout = execFileSync('node', [VALIDATE, dir, '--quiet'], { stdio: 'pipe', encoding: 'utf8' });
    return { ok: true, stdout };
  } catch (error) {
    return { ok: false, stdout: error.stdout };
  }
}

function shot(page, viewport) {
  return page.screenshots.find((entry) => entry.viewport === viewport);
}

module.exports = function registerPageScreenshotTests({ assert, fixtures, test }) {
  console.log('page screenshots');

  test('pageSectionOrder follows campaign_include order and ignores non-landing includes', () => {
    const fake = path.join(fixtures, 'section-capture', 'src', 'fake');
    assert.deepStrictEqual(pageSectionOrder(path.join(fake, 'landing.html')), ['alpha', 'spacer', 'beta', 'gamma']);
    assert.deepStrictEqual(pageSectionOrder(path.join(fake, 'landing-nested.html')), ['alpha', 'gamma']);
    assert.deepStrictEqual(pageSectionOrder(path.join(fake, 'presell.html')), []);
    assert.deepStrictEqual(pageSectionOrder(path.join(fake, 'missing.html')), []);
  });

  test('buildManifest stitches section refs in page order, records the gap, and warns on default page_id', () => {
    const dir = makeCampaign();
    try {
      const warnings = [];
      const manifest = buildManifest({ campaignDir: dir, slug: 'shots', generatorRoot: GENERATOR_ROOT, warnings });
      const [page] = manifest.pages;
      assert.strictEqual(page.page_id, 'landing');
      assert.strictEqual(page.screenshot_source, 'stitched_figma_section_renders');
      assert.deepStrictEqual(page.stitched_sections, ['hero-1', 'benefits-2']);
      assert.ok(warnings.some((w) => /default page_id "landing"/.test(w) && /--page-id landing=/.test(w)), 'expected page_id warning');

      const desktop = shot(page, 'desktop');
      assert.strictEqual(desktop.kind, 'source_screenshot');
      assert.strictEqual(desktop.availability, 'available');
      assert.strictEqual(desktop.path, `_ref/${PAGES_DIR}/landing-desktop.png`);
      assert.strictEqual(desktop.width, 1440);
      assert.strictEqual(desktop.height, 30);
      const file = path.join(dir, desktop.path);
      assert.strictEqual(desktop.sha256, sha256(file));
      assert.match(desktop.notes, /hero-1, benefits-2/);
      assert.match(desktop.notes, /not a browser capture/);
      assert.strictEqual(desktop.browser, undefined);
      assert.strictEqual(desktop.device_profile, undefined);
      assert.match(desktop.captured_at, /^\d{4}-\d{2}-\d{2}T/);

      // Pixel order: red hero rows on top, green benefits rows below.
      const stitched = PNG.sync.read(fs.readFileSync(file));
      assert.deepStrictEqual([...stitched.data.slice(0, 3)], [255, 0, 0]);
      assert.deepStrictEqual([...stitched.data.slice(1440 * 4 * 10, 1440 * 4 * 10 + 3)], [0, 255, 0]);

      const mobile = shot(page, 'mobile');
      assert.strictEqual(mobile.kind, 'unavailable_render');
      assert.strictEqual(mobile.availability, 'unavailable');
      assert.match(mobile.unavailable_reason, /benefits-2/);
      assert.strictEqual(mobile.path, undefined);
      assert.strictEqual(shot(page, 'tablet').kind, 'unavailable_render');

      // Deterministic: a second build yields the same bytes.
      const again = buildManifest({ campaignDir: dir, slug: 'shots', generatorRoot: GENERATOR_ROOT });
      assert.strictEqual(shot(again.pages[0], 'desktop').sha256, desktop.sha256);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--page-id override sets page_id and silences the default-id warning', () => {
    const dir = makeCampaign();
    try {
      const warnings = [];
      const manifest = buildManifest({
        campaignDir: dir,
        slug: 'shots',
        generatorRoot: GENERATOR_ROOT,
        pageIdOverrides: new Map([['landing', 'page_most7ygt_415']]),
        warnings,
      });
      assert.strictEqual(manifest.pages[0].page_id, 'page_most7ygt_415');
      assert.ok(!warnings.some((w) => /default page_id/.test(w)), `unexpected warning: ${warnings.join(' | ')}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('section refs of different widths are refused, not stitched', () => {
    const dir = makeCampaign();
    try {
      solidPng(path.join(dir, '_ref', 'benefits-2-desktop.png'), 1280, 20, [0, 255, 0]);
      const manifest = buildManifest({ campaignDir: dir, slug: 'shots', generatorRoot: GENERATOR_ROOT });
      const desktop = shot(manifest.pages[0], 'desktop');
      assert.strictEqual(desktop.availability, 'unavailable');
      assert.match(desktop.unavailable_reason, /different widths/);
      assert.match(desktop.unavailable_reason, /benefits-2=1280px/);
      assert.ok(!fs.existsSync(path.join(dir, '_ref', PAGES_DIR, 'landing-desktop.png')));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a page without section includes uses a whole-page ref named after the page', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fse-presell-'));
    try {
      write(path.join(dir, 'presell.html'), '---\npage_layout: base-presell.html\nnext_url: /landing\n---\n<article class="max-w-[800px]">Presell</article>\n');
      solidPng(path.join(dir, '_ref', 'presell-desktop.png'), 1440, 12, [1, 2, 3]);
      const manifest = buildManifest({ campaignDir: dir, slug: 'presell', generatorRoot: GENERATOR_ROOT });
      const [page] = manifest.pages;
      assert.strictEqual(page.page_id, 'presell');
      assert.strictEqual(page.screenshot_source, 'figma_page_render');
      const desktop = shot(page, 'desktop');
      assert.strictEqual(desktop.availability, 'available');
      assert.strictEqual(desktop.path, '_ref/presell-desktop.png');
      assert.strictEqual(desktop.height, 12);
      assert.match(shot(page, 'mobile').unavailable_reason, /_ref\/presell-mobile\.png does not exist/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('validate-export fails without mobile proof, passes once every section has a mobile ref, and catches tampering', () => {
    const dir = makeCampaign();
    try {
      writeManifestFile(dir, buildManifest({ campaignDir: dir, slug: 'shots', generatorRoot: GENERATOR_ROOT }));
      let result = runValidate(dir);
      assert.ok(!result.ok, 'expected validate-export to fail without a mobile screenshot');
      assert.match(result.stdout, /mobile screenshot is not available: no mobile render for section\(s\) benefits-2/);

      solidPng(path.join(dir, '_ref', 'benefits-2-mobile.png'), 375, 5, [9, 9, 9]);
      writeManifestFile(dir, buildManifest({ campaignDir: dir, slug: 'shots', generatorRoot: GENERATOR_ROOT }));
      result = runValidate(dir);
      assert.ok(result.ok, `expected validate-export to pass, got:\n${result.stdout}`);
      assert.match(result.stdout, /PASS/);

      // Regenerate a stitched page after the manifest was written: hash drifts.
      solidPng(path.join(dir, '_ref', PAGES_DIR, 'landing-mobile.png'), 375, 13, [0, 0, 0]);
      result = runValidate(dir);
      assert.ok(!result.ok, 'expected validate-export to fail on a tampered screenshot');
      assert.match(result.stdout, /landing-mobile\.png" hash mismatch/);
      assert.match(result.stdout, /records 375x13 but the file is 375x13|hash mismatch/);

      // A manifest without screenshots[] at all is the pre-#42 shape: fail loudly.
      const manifest = buildManifest({ campaignDir: dir, slug: 'shots', generatorRoot: GENERATOR_ROOT, screenshots: false });
      writeManifestFile(dir, manifest);
      result = runValidate(dir);
      assert.ok(!result.ok);
      assert.match(result.stdout, /has no screenshots\[\]/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a viewport that becomes unavailable removes its stale stitched PNG', () => {
    const dir = makeCampaign();
    try {
      const stale = path.join(dir, '_ref', PAGES_DIR, 'landing-desktop.png');
      buildManifest({ campaignDir: dir, slug: 'shots', generatorRoot: GENERATOR_ROOT });
      assert.ok(fs.existsSync(stale));
      fs.rmSync(path.join(dir, '_ref', 'benefits-2-desktop.png'));
      const manifest = buildManifest({ campaignDir: dir, slug: 'shots', generatorRoot: GENERATOR_ROOT });
      assert.strictEqual(shot(manifest.pages[0], 'desktop').availability, 'unavailable');
      assert.ok(!fs.existsSync(stale), 'stale stitched PNG should be removed');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('handoff exits non-zero when a required screenshot is missing', () => {
    // handoff.js resolves src/<slug> under the repo root, so the fixture must live there.
    const slug = `fse-shots-handoff-${process.pid}`;
    const dir = path.join(GENERATOR_ROOT, 'src', slug);
    const src = makeCampaign();
    try {
      fs.cpSync(src, dir, { recursive: true });
      let error = null;
      try {
        execFileSync('node', [path.join(__dirname, '..', 'handoff.js'), slug, '--no-compress'], { stdio: 'pipe', encoding: 'utf8' });
      } catch (caught) {
        error = caught;
      }
      assert.ok(error, 'expected handoff.js to fail without a mobile screenshot');
      assert.match(error.stderr, /\[handoff\] ERROR: landing mobile: no mobile render for section\(s\) benefits-2/);
      assert.ok(!/Ready for developer handoff/.test(error.stdout));

      solidPng(path.join(dir, '_ref', 'benefits-2-mobile.png'), 375, 5, [9, 9, 9]);
      const stdout = execFileSync('node', [path.join(__dirname, '..', 'handoff.js'), slug, '--no-compress'], { stdio: 'pipe', encoding: 'utf8' });
      assert.match(stdout, /Ready for developer handoff/);
    } finally {
      fs.rmSync(src, { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('validate-export warns, not fails, on a non-canonical frame width', () => {
    const dir = makeCampaign();
    try {
      for (const section of ['hero-1', 'benefits-2']) {
        solidPng(path.join(dir, '_ref', `${section}-desktop.png`), 1280, 10, [1, 1, 1]);
        solidPng(path.join(dir, '_ref', `${section}-mobile.png`), 390, 10, [1, 1, 1]);
      }
      writeManifestFile(dir, buildManifest({ campaignDir: dir, slug: 'shots', generatorRoot: GENERATOR_ROOT }));
      const stdout = execFileSync('node', [VALIDATE, dir], { stdio: 'pipe', encoding: 'utf8' });
      assert.match(stdout, /desktop screenshot is 1280px wide; the canonical desktop frame width is 1440px/);
      assert.ok(!/mobile screenshot is 390px/.test(stdout), '390 is a canonical mobile width');
      assert.match(stdout, /PASS/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
};
