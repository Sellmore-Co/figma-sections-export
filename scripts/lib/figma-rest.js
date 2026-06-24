// figma-rest.js — token-based Figma REST client.
//
// This is the reliability fallback for the Figma MCP plugin, which can
// disconnect mid-run. Everything here talks to the public REST API directly
// using a personal access token, so an export can complete without MCP.
//
// Endpoints wrapped:
//   GET /v1/files/:key/nodes?ids=...   node documents (structure + geometry)
//   GET /v1/images/:key?ids=...        rendered PNG/SVG/JPG URLs
//   GET /v1/comments                   file comments (used by the annotation probe)
//
// No external dependencies — uses the built-in https module so the toolkit
// stays install-light, matching the other scripts in this repo.

const fs = require('fs');
const path = require('path');
const https = require('https');

const FIGMA_HOST = 'api.figma.com';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1500;

// --- env + URL parsing ------------------------------------------------------

// Load .env into process.env without clobbering already-set vars.
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

// Pull the file key out of a Figma design/file URL.
function extractFileKey(value) {
  if (!value) return '';
  const match = String(value).match(/figma\.com\/(?:design|file)\/([^/?#]+)/i);
  return match ? match[1] : '';
}

// Pull the node id out of a Figma URL and normalise 143-10518 -> 143:10518.
function extractNodeId(value) {
  if (!value) return '';
  const match = String(value).match(/[?&]node-id=([^&#]+)/i);
  if (match) return decodeURIComponent(match[1]).replace(/-/g, ':');
  return '';
}

// Accept either a full Figma URL or a bare node id; always return id form.
function normalizeNodeId(value) {
  return extractNodeId(value) || String(value || '').replace(/-/g, ':');
}

// --- low-level request ------------------------------------------------------

function requireToken(token) {
  const resolved = token || process.env.FIGMA_ACCESS_TOKEN;
  if (!resolved) {
    throw new Error('FIGMA_ACCESS_TOKEN not set. Copy .env.example to .env and add your token.');
  }
  return resolved;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// GET a Figma API path, parse JSON, and retry on 429 / transient 5xx.
async function apiGetJson(pathname, token) {
  const resolvedToken = requireToken(token);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const result = await rawGet(pathname, resolvedToken);

    if (result.statusCode === 429 || (result.statusCode >= 500 && result.statusCode < 600)) {
      if (attempt < MAX_RETRIES) {
        const wait = RETRY_BASE_MS * (attempt + 1);
        process.stderr.write(`[figma-rest] ${result.statusCode} from ${pathname} — retrying in ${wait}ms\n`);
        await sleep(wait);
        continue;
      }
    }

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`Figma API ${result.statusCode} for ${pathname}: ${result.body.slice(0, 300)}`);
    }

    try {
      return JSON.parse(result.body);
    } catch (error) {
      throw new Error(`Invalid Figma API response for ${pathname}: ${error.message}`);
    }
  }

  throw new Error(`Figma API request to ${pathname} failed after ${MAX_RETRIES} retries`);
}

function rawGet(pathname, token) {
  const options = {
    hostname: FIGMA_HOST,
    path: pathname,
    headers: { 'X-Figma-Token': token },
  };

  return new Promise((resolve, reject) => {
    https.get(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    }).on('error', reject);
  });
}

// --- endpoint wrappers ------------------------------------------------------

// GET /v1/files/:key/nodes — returns a map of nodeId -> { document, ... }.
// Pass geometry: 'paths' to include vector geometry (not needed for hotspots).
async function getNodes(fileKey, ids, { token, depth, geometry } = {}) {
  if (!fileKey) throw new Error('getNodes: fileKey is required');
  const idList = (Array.isArray(ids) ? ids : [ids]).map(normalizeNodeId).filter(Boolean);
  if (!idList.length) throw new Error('getNodes: at least one node id is required');

  const params = new URLSearchParams();
  params.set('ids', idList.join(','));
  if (depth) params.set('depth', String(depth));
  if (geometry) params.set('geometry', geometry);

  const json = await apiGetJson(
    `/v1/files/${encodeURIComponent(fileKey)}/nodes?${params.toString()}`,
    token,
  );
  return json.nodes || {};
}

// Convenience: fetch a single node's document (with absoluteBoundingBox).
async function getNodeDocument(fileKey, id, opts = {}) {
  const nodes = await getNodes(fileKey, id, opts);
  const wanted = normalizeNodeId(id);
  const entry = nodes[wanted] || nodes[id] || Object.values(nodes)[0];
  return entry ? entry.document : null;
}

// GET /v1/images/:key — returns a map of nodeId -> rendered asset URL.
async function getImageUrls(fileKey, ids, { token, format = 'png', scale = 2 } = {}) {
  if (!fileKey) throw new Error('getImageUrls: fileKey is required');
  const idList = (Array.isArray(ids) ? ids : [ids]).map(normalizeNodeId).filter(Boolean);
  if (!idList.length) throw new Error('getImageUrls: at least one node id is required');

  const params = new URLSearchParams();
  params.set('ids', idList.join(','));
  params.set('format', format);
  params.set('scale', String(scale));

  const json = await apiGetJson(
    `/v1/images/${encodeURIComponent(fileKey)}?${params.toString()}`,
    token,
  );
  if (json.err) throw new Error(`Figma image render error: ${json.err}`);
  return json.images || {};
}

// GET /v1/files/:key/comments — used by the annotation probe.
async function getComments(fileKey, { token } = {}) {
  if (!fileKey) throw new Error('getComments: fileKey is required');
  const json = await apiGetJson(`/v1/files/${encodeURIComponent(fileKey)}/comments`, token);
  return json.comments || [];
}

// Download a rendered asset URL to disk. Returns the detected file signature
// ('png' | 'jpg' | 'svg' | 'unknown') so callers can fix extensions.
function download(url, outPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const followGet = (target, redirectsLeft) => {
      https.get(target, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects downloading ${target}`));
            return;
          }
          res.resume();
          followGet(res.headers.location, redirectsLeft - 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed (${res.statusCode}) for ${target}`));
          return;
        }
        const file = fs.createWriteStream(outPath);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(detectSignature(outPath))));
        file.on('error', reject);
      }).on('error', reject);
    };
    followGet(url, 5);
  });
}

function detectSignature(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(8);
  fs.readSync(fd, buf, 0, 8, 0);
  fs.closeSync(fd);
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  const head = buf.toString('utf8').trim().toLowerCase();
  if (head.startsWith('<svg') || head.startsWith('<?xml')) return 'svg';
  return 'unknown';
}

module.exports = {
  loadEnv,
  extractFileKey,
  extractNodeId,
  normalizeNodeId,
  apiGetJson,
  getNodes,
  getNodeDocument,
  getImageUrls,
  getComments,
  download,
};
