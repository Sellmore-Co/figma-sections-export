#!/usr/bin/env node
// Preflight pasted Figma links before an export starts.

const input = process.argv.slice(2).join('\n') || readStdin();
const links = [...input.matchAll(/https:\/\/www\.figma\.com\/\S+/g)].map((match) => match[0]);
const hasCampaignSlug = /\b(?:campaign\s+slug|slug|campaign)\s*:\s*[a-z0-9][a-z0-9-]*/i.test(input) ||
  /\b(?:in|into|for campaign)\s+[a-z0-9][a-z0-9-]{2,}\b/i.test(input);
const hasExportType = /\b(?:landing\s+section|presell\s+page|presell|landing)\b/i.test(input);

if (links.length < 3) {
  console.log(JSON.stringify({
    status: 'needs_links',
    message: 'Paste desktop, tablet, and mobile Figma links.',
    linksFound: links.length,
  }, null, 2));
  process.exit(1);
}

if (!hasCampaignSlug || !hasExportType) {
  console.log(JSON.stringify({
    status: 'needs_intake',
    message: 'What campaign slug should I export into, and is this a landing section or a presell page?',
    linksFound: links.length,
    missing: {
      campaignSlug: !hasCampaignSlug,
      exportType: !hasExportType,
    },
  }, null, 2));
  process.exit(2);
}

console.log(JSON.stringify({
  status: 'ready',
  message: 'Campaign slug and export type are present. Infer the section/page name from the Figma frame name before exporting.',
  linksFound: links.length,
}, null, 2));

function readStdin() {
  try {
    return require('fs').readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}
