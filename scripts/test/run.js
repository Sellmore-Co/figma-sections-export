#!/usr/bin/env node
// Dependency-free test runner for the interactive-export tooling.
// Pure-function assertions plus one offline CLI integration run (--nodes-json
// + --dry-run), so it needs no Figma token or network.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { computeHotspot } = require('../lib/hotspots');
const tree = require('../lib/figma-tree');
const { extractAccordionItems } = require('../lib/accordion-extract');
const {
  visibilityClasses,
  renderHotspotSection,
  renderAccordionSection,
  varPrefix,
} = require('../lib/interactive-html');

const FIXTURES = path.join(__dirname, 'fixtures');
const hero = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'hero-nodes.json'), 'utf8'));
const faq = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'faq-nodes.json'), 'utf8'));

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error.message}`);
    process.exitCode = 1;
  }
}

console.log('hotspot geometry');
test('computeHotspot — desktop button', () => {
  const h = computeHotspot({ x: 120, y: 480, width: 300, height: 60 }, { x: 0, y: 0, width: 1440, height: 600 });
  assert.deepStrictEqual(h, { left: 8.333, top: 80, width: 20.833, height: 10 });
});
test('computeHotspot — offset frame origin is subtracted', () => {
  const h = computeHotspot({ x: 220, y: 180, width: 200, height: 50 }, { x: 100, y: 100, width: 1000, height: 500 });
  assert.deepStrictEqual(h, { left: 12, top: 16, width: 20, height: 10 });
});
test('computeHotspot — zero-size frame throws', () => {
  assert.throws(() => computeHotspot({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 0, height: 0 }));
});

console.log('button detection');
test('findButtonNodes finds Link → Button across breakpoints', () => {
  for (const bp of ['desktop', 'tablet', 'mobile']) {
    const buttons = tree.findButtonNodes(hero[bp]);
    assert.ok(buttons.length >= 1, `${bp}: expected a button`);
    assert.match(buttons[0].name, /button/i);
  }
});
test('isButtonName matches common CTA names, ignores body text', () => {
  assert.ok(tree.isButtonName('Link → Button'));
  assert.ok(tree.isButtonName('Link -> Button'));
  assert.ok(tree.isButtonName('CTA'));
  assert.ok(tree.isButtonName('Buy Button'));
  assert.ok(!tree.isButtonName('heading'));
  assert.ok(!tree.isButtonName('answer paragraph'));
});
test('extractHyperlink reads the button text hyperlink', () => {
  const button = tree.findButtonNodes(hero.desktop)[0];
  assert.strictEqual(tree.extractHyperlink(button), 'https://example.com/checkout');
});

console.log('responsive visibility');
test('visibilityClasses partition the viewport like <picture>', () => {
  assert.deepStrictEqual(visibilityClasses(0, 768), ['md:hidden']);
  assert.deepStrictEqual(visibilityClasses(768, 1024), ['hidden', 'md:block', 'lg:hidden']);
  assert.deepStrictEqual(visibilityClasses(1024, Infinity), ['hidden', 'lg:block']);
  assert.deepStrictEqual(visibilityClasses(0, Infinity), []);
  assert.deepStrictEqual(visibilityClasses(0, 1024), ['lg:hidden']);
});

console.log('hotspot section markup');
test('renderHotspotSection emits picture sources + per-breakpoint hotspots', () => {
  const breakpoints = ['desktop', 'tablet', 'mobile'].map((bp) => ({
    name: bp,
    assetExpr: `'images/hero-1/hero-1-${bp}.png' | campaign_asset`,
    hotspot: computeHotspot(
      tree.findButtonNodes(hero[bp])[0].absoluteBoundingBox,
      hero[bp].absoluteBoundingBox,
    ),
  }));
  const html = renderHotspotSection({ sectionId: 'hero-1', breakpoints });

  assert.match(html, /<picture/);
  assert.match(html, /media="\(min-width: 1024px\)"/);
  assert.match(html, /media="\(min-width: 768px\)"/);
  // desktop hotspot geometry + visibility
  assert.match(html, /left:8\.333%;top:80%;width:20\.833%;height:10%/);
  assert.match(html, /class="absolute block z-\[2\] hidden lg:block"/);
  // mobile hotspot hidden from md up
  assert.match(html, /class="absolute block z-\[2\] md:hidden"/);
  // not a whole-section link
  assert.ok(!/<a[^>]*>\s*<picture/.test(html), 'picture must not be wrapped in a link');
  assert.match(html, /aria-label="\{\{ hero_1_cta_label \}\}"/);
  assert.match(html, /href="\{\{ hero_1_cta_url \| campaign_link \}\}"/);
});
test('renderHotspotSection leaves a TODO when no button found', () => {
  const html = renderHotspotSection({
    sectionId: 'hero-9',
    breakpoints: [{ name: 'desktop', assetExpr: `'images/hero-9/hero-9-desktop.png' | campaign_asset`, hotspot: null }],
  });
  assert.match(html, /TODO: no CTA button/);
});

console.log('accordion extraction + markup');
test('extractAccordionItems pairs Q&A from grouped rows', () => {
  const { items, source } = extractAccordionItems(faq.desktop, []);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(source, 'text');
  assert.strictEqual(items[0].question, 'How soon will I see results?');
  assert.match(items[0].answer, /within the first two weeks/);
  assert.strictEqual(items[1].question, 'Is there a money-back guarantee?');
});
test('extractAccordionItems falls back to annotations for missing answers', () => {
  const flat = {
    id: '1:0',
    name: 'faq2-desktop',
    type: 'FRAME',
    children: [
      {
        id: '1:1',
        name: 'list',
        type: 'FRAME',
        children: [
          { id: '1:2', name: 'q', type: 'TEXT', characters: 'Question one?', style: { fontSize: 20 } },
          { id: '1:3', name: 'q', type: 'TEXT', characters: 'Question two?', style: { fontSize: 20 } },
        ],
      },
    ],
  };
  const annotations = [{ nodeId: '1:2', nodeName: 'q', label: 'Answer one lives in an annotation.', properties: [] }];
  const { items, source } = extractAccordionItems(flat, annotations);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].answer, 'Answer one lives in an annotation.');
  assert.ok(['annotations', 'mixed', 'questions-only'].includes(source));
});
test('renderAccordionSection emits <details> + namespaced frontmatter', () => {
  const { items } = extractAccordionItems(faq.desktop, []);
  const { html, frontmatter } = renderAccordionSection({ sectionId: 'faq-1', items, headingText: 'FAQ' });
  assert.match(html, /<details/);
  assert.match(html, /<summary/);
  assert.match(html, /\{\{ faq_1_q_1 \}\}/);
  assert.match(html, /\{\{ faq_1_a_1 \}\}/);
  assert.strictEqual(frontmatter.faq_1_q_1, 'How soon will I see results?');
  assert.strictEqual(frontmatter.faq_1_heading, 'FAQ');
});

console.log('varPrefix');
test('varPrefix normalizes section ids', () => {
  assert.strictEqual(varPrefix('hero-1'), 'hero_1');
  assert.strictEqual(varPrefix('problemsolution-2'), 'problemsolution_2');
});

console.log('CLI integration (offline)');
test('export-section.js --nodes-json --dry-run writes a hotspot partial', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fse-test-'));
  const outFile = path.join(tmpDir, 'hero-1.html');
  try {
    execFileSync('node', [
      path.join(__dirname, '..', 'export-section.js'),
      '--slug', '__test__',
      '--section', 'hero-1',
      '--desktop', '143:1000',
      '--tablet', '143:1100',
      '--mobile', '143:1200',
      '--nodes-json', path.join(FIXTURES, 'hero-nodes.json'),
      '--dry-run',
      '--force',
      '--out', outFile,
    ], { stdio: 'pipe' });
    const html = fs.readFileSync(outFile, 'utf8');
    assert.match(html, /<picture/);
    assert.match(html, /left:8\.333%/);
    assert.match(html, /data-hotspot-root/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
test('export-section.js infers accordion from faq section name', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fse-test-'));
  const outFile = path.join(tmpDir, 'faq-1.html');
  try {
    execFileSync('node', [
      path.join(__dirname, '..', 'export-section.js'),
      '--slug', '__test__',
      '--section', 'faq-1',
      '--desktop', '143:2000',
      '--nodes-json', path.join(FIXTURES, 'faq-nodes.json'),
      '--dry-run',
      '--force',
      '--out', outFile,
    ], { stdio: 'pipe' });
    const html = fs.readFileSync(outFile, 'utf8');
    assert.match(html, /<details/);
    assert.match(html, /\{\{ faq_1_q_1 \}\}/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed${process.exitCode ? ', with failures' : ''}`);
