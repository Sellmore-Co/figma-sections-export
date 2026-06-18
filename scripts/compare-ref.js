#!/usr/bin/env node
// compare-ref.js — Generate a visual compare page (Figma ref vs live iframe)
//
// Usage:
//   npm run compare <slug> [section] [port] [--serve] [--serve-port=N]
//   node scripts/compare-ref.js hero-1
//   node scripts/compare-ref.js hero-1 3001
//   node scripts/compare-ref.js my-campaign nav-2
//   node scripts/compare-ref.js my-campaign nav-2 3001
//   node scripts/compare-ref.js my-campaign nav-2 --serve
//
// If [section] is omitted, ref PNGs are chosen from *-desktop.png in _ref/
// (alphabetically first prefix if multiple — a warning is printed).
// If [section] is set, uses {section}-desktop.png / tablet / mobile explicitly.
// If the 2nd argument is numeric only, it is treated as [port] (backward compatible).
//
// --serve         Boot a tiny static http server for _ref/ and print/open the
//                 http URL. Use this for viewing: opening the page as file://
//                 leaves the Figma columns blank because some browsers block
//                 local file:// images on a page that also loads an http iframe.
// --serve-port=N  Port for that static server (default 4100; auto-increments if busy).
//
// Without --serve the page is only generated (the command exits), which is what
// the agent export flow expects — add --serve when a human wants to view it.
//
// Requires:
//   - Figma ref images in src/{slug}/_ref/ (run save-ref.sh first)
//   - Dev server running; live URL uses _data/campaigns.json entry_url when set
//
// Output:
//   src/{slug}/_ref/compare-{section}.html  ← open this in a browser (over http)
//   (falls back to compare.html only when no section can be determined)

const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');

const rawArgs = process.argv.slice(2);
const flags = rawArgs.filter((a) => a.startsWith('--'));
const positional = rawArgs.filter((a) => !a.startsWith('--'));
const [slug, arg2, arg3] = positional;

const serve = flags.includes('--serve');
const servePortFlag = flags.find((f) => f.startsWith('--serve-port='));
const servePort = servePortFlag ? parseInt(servePortFlag.split('=')[1], 10) || 4100 : 4100;

if (!slug) {
  console.error('Usage: npm run compare <slug> [section] [port]');
  console.error('Examples:');
  console.error('  npm run compare hero-1');
  console.error('  npm run compare hero-1 3001');
  console.error('  npm run compare my-campaign nav-2');
  console.error('  npm run compare my-campaign nav-2 3001');
  process.exit(1);
}

let explicitSection = null;
let port = 3000;

if (arg2 !== undefined) {
  if (/^\d+$/.test(arg2)) {
    port = parseInt(arg2, 10);
  } else {
    explicitSection = arg2;
    if (arg3 !== undefined) {
      if (!/^\d+$/.test(arg3)) {
        console.error(`Invalid port "${arg3}" — must be a number.`);
        process.exit(1);
      }
      port = parseInt(arg3, 10);
    }
  }
}

const srcDir = path.join(__dirname, '..', 'src', slug);
const refDir = path.join(srcDir, '_ref');

if (!fs.existsSync(srcDir)) {
  console.error(`Campaign not found: src/${slug}/`);
  process.exit(1);
}

const liveUrl = buildLiveUrl(port, slug);

fs.mkdirSync(refDir, { recursive: true });

const existingFiles = fs.readdirSync(refDir);
const prefixes = listDesktopPrefixes(existingFiles);

let sectionName;

if (explicitSection) {
  const desktopPath = path.join(refDir, `${explicitSection}-desktop.png`);
  if (!fs.existsSync(desktopPath)) {
    console.error(
      `No Figma ref for section "${explicitSection}": expected src/${slug}/_ref/${explicitSection}-desktop.png`
    );
    if (prefixes.length) {
      console.error(`Available ref prefixes: ${prefixes.join(', ')}`);
    } else {
      console.error('No *-desktop.png files in _ref/ — run save-ref.sh first.');
    }
    process.exit(1);
  }
  sectionName = explicitSection;
} else {
  if (prefixes.length > 1) {
    console.warn(
      `Warning: multiple *-desktop.png ref sets in _ref/ (${prefixes.join(', ')}). Using "${prefixes[0]}". ` +
        `Pass an explicit section: npm run compare ${slug} <section>`
    );
  }
  sectionName = prefixes[0] || null;
}

const breakpoints = [
  { name: 'desktop', width: 1440 },
  { name: 'tablet', width: 768 },
  { name: 'mobile', width: 375 },
];

const panels = breakpoints.map((bp) => ({
  ...bp,
  figmaSrc: sectionName ? `${sectionName}-${bp.name}.png` : null,
  figmaExists: sectionName ? fs.existsSync(path.join(refDir, `${sectionName}-${bp.name}.png`)) : false,
}));

// Per-section output so parallel exports don't clobber a single shared compare.html.
// Falls back to compare.html only when no section could be determined.
const htmlFile = sectionName ? `compare-${sectionName}.html` : 'compare.html';
const htmlPath = path.join(refDir, htmlFile);
fs.writeFileSync(htmlPath, generateHtml(slug, sectionName, liveUrl, panels));

console.log(`\n✓ Compare page ready → src/${slug}/_ref/${htmlFile}`);
console.log(`  live URL: ${liveUrl}`);
if (sectionName) {
  console.log(`  Figma refs: ${sectionName}-*.png`);
} else {
  console.log(`  No Figma refs found — run save-ref.sh to add them`);
}

if (serve) {
  startServer(refDir, servePort, htmlFile);
} else {
  console.log(`  open src/${slug}/_ref/${htmlFile}`);
  console.log(`  tip: add --serve to view over http (file:// leaves the Figma columns blank)`);
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

// Serve _ref/ over http so both columns (local Figma PNGs + live iframe) load
// over http. Opening the page as file:// leaves the Figma side blank in some browsers.
function startServer(rootDir, port, htmlFile, attempt = 0) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = urlPath === '/' ? htmlFile : urlPath.replace(/^\/+/, '');
    const filePath = path.join(rootDir, rel);

    // Confine to rootDir — never serve outside _ref/.
    if (!path.resolve(filePath).startsWith(path.resolve(rootDir))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < 10) {
      startServer(rootDir, port + 1, htmlFile, attempt + 1);
    } else {
      console.error(`  Could not start compare server: ${err.message}`);
      console.error(`  Falling back to file:// — open ${path.join(rootDir, htmlFile)} manually.`);
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}/${htmlFile}`;
    console.log(`\n  serving over http → ${url}`);
    console.log(`  (Ctrl+C to stop)`);
    exec(`open "${url}"`, () => {});
  });
}

function listDesktopPrefixes(files) {
  const out = files
    .filter((f) => f.endsWith('-desktop.png') && !f.startsWith('rendered-'))
    .map((f) => f.replace(/-desktop\.png$/, ''));
  return [...new Set(out)].sort();
}

function buildLiveUrl(port, slug) {
  const entryUrl = getCampaignEntryUrl(slug);
  return `http://localhost:${port}/${slug}/${normalizeEntryUrl(entryUrl)}`;
}

function getCampaignEntryUrl(slug) {
  const campaignsPath = path.join(__dirname, '..', '_data', 'campaigns.json');
  if (!fs.existsSync(campaignsPath)) return '';

  try {
    const campaigns = JSON.parse(fs.readFileSync(campaignsPath, 'utf8'));
    return campaigns?.[slug]?.entry_url || '';
  } catch {
    return '';
  }
}

function normalizeEntryUrl(entryUrl) {
  if (typeof entryUrl !== 'string') return '';
  const trimmed = entryUrl
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.html$/i, '');
  return trimmed ? `${trimmed}/` : '';
}

function generateHtml(slug, sectionName, liveUrl, panels) {
  const heading = sectionName ? `${slug} — ${sectionName}` : slug;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Compare — ${heading}</title>
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

    .compare-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 12px;
      align-items: start;
    }

    /* Match Figma export width per tab — ref + live are both capped at breakpoint px, centered */
    .bp-constrain {
      width: min(100%, var(--bp-w));
      max-width: var(--bp-w);
      margin-left: auto;
      margin-right: auto;
    }

    .col-label {
      font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
      padding: 0 0 8px;
    }
    .col-label span {
      background: #222; padding: 3px 8px; border-radius: 4px;
      border: 1px solid #333; color: #666;
    }
    .rendered-col .col-label span { border-color: #1a3a6a; color: #4d8af0; }

    /* Figma ref image — natural size of export, not stretched to full column */
    .figma-col .bp-constrain img {
      width: 100%;
      max-width: 100%;
      height: auto;
      display: block;
      border: 1px solid #2a2a2a;
      border-radius: 4px;
    }
    .no-ref {
      display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 6px;
      height: 200px; background: #181818; border: 1px dashed #2a2a2a; border-radius: 4px;
      color: #444; font-size: 12px;
    }
    .no-ref code { font-family: monospace; font-size: 11px; color: #555; }

    /* Iframe scaling — wrap matches breakpoint width (inside .bp-constrain) */
    .iframe-wrap {
      width: 100%;
      max-width: 100%;
      overflow: auto;
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
    <h1>${heading}</h1>
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
          <div class="bp-constrain" style="--bp-w: ${p.width}px">
          ${p.figmaExists
            ? `<img src="${p.figmaSrc}" alt="Figma ${p.name}">`
            : `<div class="no-ref">No Figma ref<code>run save-ref.sh to add</code></div>`}
          </div>
        </div>

        <div class="col rendered-col">
          <div class="col-label"><span>Live — ${p.name}</span></div>
          <div class="bp-constrain" style="--bp-w: ${p.width}px">
          <div class="iframe-wrap" data-native-width="${p.width}">
            <iframe src="${liveUrl}" scrolling="yes" title="Rendered ${p.name}"></iframe>
          </div>
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

    // Scale each iframe to fill its column width and keep a scrollable viewport
    function scaleIframes() {
      document.querySelectorAll('.iframe-wrap').forEach(wrap => {
        const nativeWidth = Number(wrap.dataset.nativeWidth);
        const containerWidth = wrap.offsetWidth;
        // Never upscale above 1:1; only scale down when column is narrower.
        const scale = Math.min(containerWidth / nativeWidth, 1);
        // Reserve a stable viewport height so users can scroll long composed pages
        const viewportHeight = Math.max(520, window.innerHeight - 170);
        const iframeHeight = Math.round(viewportHeight / scale);

        const iframe = wrap.querySelector('iframe');
        iframe.style.width  = nativeWidth + 'px';
        iframe.style.height = iframeHeight + 'px';
        iframe.style.transform = \`scale(\${scale})\`;

        // Wrapper stays viewport-sized; iframe content scrolls inside it.
        wrap.style.height = viewportHeight + 'px';
      });
    }

    scaleIframes();
    window.addEventListener('resize', scaleIframes);
  </script>
</body>
</html>`;
}
