#!/usr/bin/env node
// Infer an export section name from a Figma frame URL or node id.

const fs = require('fs');
const path = require('path');
const https = require('https');

loadEnv();

const [, , input, explicitFileKey] = process.argv;

if (!input || input === '--help' || input === '-h') {
  printHelp();
  process.exit(input ? 0 : 1);
}

const fileKey = extractFileKey(input) || explicitFileKey || process.env.FIGMA_FILE_KEY;
const nodeId = extractNodeId(input) || input;

if (!process.env.FIGMA_ACCESS_TOKEN) {
  console.error('Error: FIGMA_ACCESS_TOKEN not set. Add it to .env.');
  process.exit(1);
}

if (!fileKey) {
  console.error('Error: no Figma file key found. Pass a full Figma URL, a second file-key argument, or set FIGMA_FILE_KEY.');
  process.exit(1);
}

fetchNode(fileKey, nodeId)
  .then((node) => {
    const frameName = node?.document?.name;
    if (!frameName) {
      console.error(`Error: no frame name returned for ${nodeId}`);
      process.exit(1);
    }

    const sectionName = normalizeFrameName(frameName);
    const exportType = inferExportType(sectionName, frameName);

    console.log(JSON.stringify({
      frameName,
      sectionName,
      exportType,
      nodeId,
      fileKey,
    }, null, 2));
  })
  .catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });

function fetchNode(key, id) {
  const encoded = encodeURIComponent(id.replace(/-/g, ':'));
  const options = {
    hostname: 'api.figma.com',
    path: `/v1/files/${encodeURIComponent(key)}/nodes?ids=${encoded}`,
    headers: {
      'X-Figma-Token': process.env.FIGMA_ACCESS_TOKEN,
    },
  };

  return new Promise((resolve, reject) => {
    https.get(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Figma API returned ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }

        let data;
        try {
          data = JSON.parse(body);
        } catch (error) {
          reject(new Error(`Invalid Figma API response: ${error.message}`));
          return;
        }

        const node = data.nodes?.[id] || data.nodes?.[id.replace(/-/g, ':')];
        resolve(node);
      });
    }).on('error', reject);
  });
}

function normalizeFrameName(name) {
  const withoutBreakpoint = name
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[-_ ]?(desktop|tablet|mobile)$/i, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/_+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const lower = withoutBreakpoint.toLowerCase();
  const compactMatch = lower.match(/^([a-z]+)(\d+)$/);
  if (compactMatch) {
    const category = compactMatch[1] === 'sticky' ? 'bottomcta' : compactMatch[1];
    return `${category}-${compactMatch[2]}`;
  }

  const separatedMatch = lower.match(/^([a-z-]+)-(\d+)$/);
  if (separatedMatch) {
    const category = separatedMatch[1] === 'sticky' ? 'bottomcta' : separatedMatch[1];
    return `${category}-${separatedMatch[2]}`;
  }

  return lower;
}

function inferExportType(sectionName, frameName) {
  return /presell|advertorial/i.test(`${sectionName} ${frameName}`) ? 'presell-page' : 'landing-section';
}

function extractFileKey(value) {
  const match = value.match(/figma\.com\/(?:design|file)\/([^/?#]+)/i);
  return match ? match[1] : '';
}

function extractNodeId(value) {
  const match = value.match(/[?&]node-id=([^&#]+)/i);
  return match ? decodeURIComponent(match[1]).replace(/-/g, ':') : '';
}

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
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

function printHelp() {
  console.log(`Usage:
  node scripts/infer-section-name.js <figma-url-or-node-id> [file-key]

Prints JSON with:
  - frameName from Figma
  - normalized sectionName, e.g. problemsolution2-desktop -> problemsolution-2
  - inferred exportType: landing-section or presell-page

Examples:
  node scripts/infer-section-name.js "https://www.figma.com/design/FILE/Name?node-id=471-9922"
  node scripts/infer-section-name.js 471:9922 FILE`);
}
