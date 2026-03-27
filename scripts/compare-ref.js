#!/usr/bin/env node
// compare-ref.js — Generate a visual compare page (Figma ref vs live iframe)
//
// Usage:
//   npm run compare <slug> [port]
//   node scripts/compare-ref.js hero-1
//   node scripts/compare-ref.js hero-1 3001
//
// Requires:
//   - Figma ref images in src/{slug}/_ref/ (run save-ref.sh first)
//   - Dev server running at http://localhost:{port}/{slug}/
//
// Output:
//   src/{slug}/_ref/compare.html  ← open this in a browser

const fs = require('fs');
const path = require('path');

const [, , slug, portArg] = process.argv;
const port = portArg || 3000;

if (!slug) {
  console.error('Usage: npm run compare <slug> [port]');
  console.error('Example: npm run compare hero-1');
  process.exit(1);
}

const srcDir = path.join(__dirname, '..', 'src', slug);
const refDir = path.join(srcDir, '_ref');
const liveUrl = `http://localhost:${port}/${slug}/`;

if (!fs.existsSync(srcDir)) {
  console.error(`Campaign not found: src/${slug}/`);
  process.exit(1);
}

fs.mkdirSync(refDir, { recursive: true });

const existingFiles = fs.readdirSync(refDir);
const sectionName = detectSectionName(existingFiles);

const breakpoints = [
  { name: 'desktop', width: 1440 },
  { name: 'tablet',  width: 768 },
  { name: 'mobile',  width: 375 },
];

const panels = breakpoints.map(bp => ({
  ...bp,
  figmaSrc: sectionName ? `${sectionName}-${bp.name}.png` : null,
  figmaExists: sectionName ? fs.existsSync(path.join(refDir, `${sectionName}-${bp.name}.png`)) : false,
}));

const htmlPath = path.join(refDir, 'compare.html');
fs.writeFileSync(htmlPath, generateHtml(slug, liveUrl, panels));

console.log(`\n✓ Compare page ready → src/${slug}/_ref/compare.html`);
console.log(`  open src/${slug}/_ref/compare.html`);
if (sectionName) {
  console.log(`  Figma refs: ${sectionName}-*.png`);
} else {
  console.log(`  No Figma refs found — run save-ref.sh to add them`);
}

function detectSectionName(files) {
  const match = files.find(f => f.endsWith('-desktop.png') && !f.startsWith('rendered-'));
  return match ? match.replace(/-desktop\.png$/, '') : null;
}

function generateHtml(slug, liveUrl, panels) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Compare — ${slug}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #111; color: #eee; }

    header {
      position: sticky; top: 0; z-index: 100;
      background: #1a1a1a; border-bottom: 1px solid #2a2a2a;
      padding: 10px 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
    }
    h1 { font-size: 13px; font-weight: 600; color: #fff; font-family: monospace; white-space: nowrap; }

    .controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; flex: 1; }

    .btn-group { display: flex; gap: 2px; }
    button {
      background: #242424; border: 1px solid #3a3a3a; color: #999;
      padding: 5px 11px; font-size: 12px; cursor: pointer; border-radius: 4px;
      transition: background 0.1s, color 0.1s;
    }
    button:hover { background: #2e2e2e; color: #ddd; }
    button.active { background: #1a56db; border-color: #1a56db; color: #fff; }

    .live-url { font-size: 11px; color: #555; font-family: monospace; margin-left: auto; }
    .live-url a { color: #4d8af0; text-decoration: none; }
    .live-url a:hover { text-decoration: underline; }

    .shortcuts { font-size: 11px; color: #444; }
    .shortcuts kbd {
      background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 3px;
      padding: 1px 5px; font-size: 10px; font-family: monospace; color: #666;
    }

    main { padding: 16px; }

    .panel { display: none; }
    .panel.active { display: block; }

    .compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

    .col-label {
      font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
      padding: 0 0 8px;
    }
    .col-label span {
      background: #222; padding: 3px 8px; border-radius: 4px;
      border: 1px solid #333; color: #666;
    }
    .rendered-col .col-label span { border-color: #1a3a6a; color: #4d8af0; }

    /* Figma ref image */
    .figma-col img { width: 100%; height: auto; display: block; border: 1px solid #2a2a2a; border-radius: 4px; }
    .no-ref {
      display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 6px;
      height: 200px; background: #181818; border: 1px dashed #2a2a2a; border-radius: 4px;
      color: #444; font-size: 12px;
    }
    .no-ref code { font-family: monospace; font-size: 11px; color: #555; }

    /* Iframe scaling */
    .iframe-wrap {
      width: 100%;
      overflow: hidden;
      border: 1px solid #2a2a2a;
      border-radius: 4px;
      background: #fff;
    }
    .iframe-wrap iframe {
      display: block;
      border: none;
      transform-origin: top left;
    }
  </style>
</head>
<body>
  <header>
    <h1>${slug}</h1>
    <div class="controls">
      <div class="btn-group" id="bp-tabs">
        ${panels.map((p, i) => `<button data-bp="${p.name}"${i === 0 ? ' class="active"' : ''}>${p.name.charAt(0).toUpperCase() + p.name.slice(1)} <span style="opacity:0.5">${p.width}px</span></button>`).join('\n        ')}
      </div>
      <div class="shortcuts">
        <kbd>D</kbd> <kbd>T</kbd> <kbd>M</kbd> breakpoint
      </div>
    </div>
    <div class="live-url">live: <a href="${liveUrl}" target="_blank">${liveUrl}</a></div>
  </header>

  <main>
    ${panels.map((p, i) => `<div class="panel${i === 0 ? ' active' : ''}" data-bp="${p.name}">
      <div class="compare-grid">

        <div class="col figma-col">
          <div class="col-label"><span>Figma — ${p.name}</span></div>
          ${p.figmaExists
            ? `<img src="${p.figmaSrc}" alt="Figma ${p.name}">`
            : `<div class="no-ref">No Figma ref<code>run save-ref.sh to add</code></div>`}
        </div>

        <div class="col rendered-col">
          <div class="col-label"><span>Live — ${p.name}</span></div>
          <div class="iframe-wrap" data-native-width="${p.width}">
            <iframe src="${liveUrl}" scrolling="no" title="Rendered ${p.name}"></iframe>
          </div>
        </div>

      </div>
    </div>`).join('\n    ')}
  </main>

  <script>
    // Tab switching
    const bpButtons = document.querySelectorAll('[data-bp]');
    const panels    = document.querySelectorAll('.panel');

    function switchBp(bp) {
      bpButtons.forEach(b => b.classList.toggle('active', b.dataset.bp === bp));
      panels.forEach(p => p.classList.toggle('active', p.dataset.bp === bp));
      scaleIframes();
    }

    bpButtons.forEach(b => b.addEventListener('click', () => switchBp(b.dataset.bp)));

    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key.toLowerCase() === 'd') switchBp('desktop');
      if (e.key.toLowerCase() === 't') switchBp('tablet');
      if (e.key.toLowerCase() === 'm') switchBp('mobile');
    });

    // Scale each iframe to fill its column at the correct breakpoint width
    function scaleIframes() {
      document.querySelectorAll('.iframe-wrap').forEach(wrap => {
        const nativeWidth = Number(wrap.dataset.nativeWidth);
        const containerWidth = wrap.offsetWidth;
        const scale = containerWidth / nativeWidth;
        const iframeHeight = Math.round(window.screen.height / scale); // tall enough to show full section

        const iframe = wrap.querySelector('iframe');
        iframe.style.width  = nativeWidth + 'px';
        iframe.style.height = iframeHeight + 'px';
        iframe.style.transform = \`scale(\${scale})\`;

        // Shrink the wrapper to the scaled height so the grid row fits
        wrap.style.height = Math.round(iframeHeight * scale) + 'px';
      });
    }

    scaleIframes();
    window.addEventListener('resize', scaleIframes);
  </script>
</body>
</html>`;
}
