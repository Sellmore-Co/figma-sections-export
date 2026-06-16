#!/usr/bin/env node
// figma-annotations.js — confirm, for a given token + file, whether Dev Mode
// annotations (node.annotations) and file comments (/v1/comments) are
// reachable over REST, and print whatever content comes back.
//
// Background (issue #27 ask 3): authored copy (e.g. FAQ answers) can live in
// Figma Dev Mode annotations. A "File content: read-only" token reportedly
// returned empty for both node.annotations and /v1/comments. This probe lets
// you verify per file + token which channel actually carries content, so the
// export can pull it instead of guessing. See docs/figma-annotations.md.
//
// Usage:
//   node scripts/figma-annotations.js <figma-url-or-node-id> [file-key]
//   node scripts/figma-annotations.js <figma-url-or-node-id> --json

const rest = require('./lib/figma-rest');
const tree = require('./lib/figma-tree');

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

async function main() {
  rest.loadEnv();

  const args = process.argv.slice(2);
  if (!args.length || args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(args.length ? 0 : 1);
  }

  const jsonOut = args.includes('--json');
  const positional = args.filter((a) => !a.startsWith('--'));
  const input = positional[0];
  const explicitKey = positional[1];

  const fileKey = rest.extractFileKey(input) || explicitKey || process.env.FIGMA_FILE_KEY;
  const nodeId = rest.normalizeNodeId(input);

  if (!process.env.FIGMA_ACCESS_TOKEN) throw new Error('FIGMA_ACCESS_TOKEN not set. Add it to .env.');
  if (!fileKey) throw new Error('No Figma file key. Pass a full Figma URL, a file-key argument, or set FIGMA_FILE_KEY.');

  const report = { fileKey, nodeId, annotations: [], comments: 0, annotationsReachable: false, commentsReachable: false };

  // 1) node.annotations via /v1/files/:key/nodes
  try {
    const doc = await rest.getNodeDocument(fileKey, nodeId);
    if (!doc) throw new Error(`node ${nodeId} not found in file`);
    report.annotations = tree.collectAnnotations(doc);
    report.annotationsReachable = report.annotations.length > 0;
  } catch (error) {
    report.annotationsError = error.message;
  }

  // 2) file comments via /v1/comments (a different feature from annotations)
  try {
    const comments = await rest.getComments(fileKey);
    report.comments = comments.length;
    report.commentsReachable = comments.length > 0;
    report.commentSample = comments.slice(0, 3).map((c) => (c.message || '').slice(0, 120));
  } catch (error) {
    report.commentsError = error.message;
  }

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printReport(report);
}

function printReport(report) {
  console.log(`Figma annotation probe — file ${report.fileKey}, node ${report.nodeId}\n`);

  console.log('node.annotations (Dev Mode):');
  if (report.annotationsError) {
    console.log(`  error: ${report.annotationsError}`);
  } else if (report.annotations.length) {
    console.log(`  found ${report.annotations.length} annotation(s):`);
    for (const a of report.annotations) {
      const props = (a.properties || []).map((p) => p.value || p.type).filter(Boolean).join(', ');
      console.log(`    • [${a.nodeName || a.nodeId}] ${a.label || '(no label)'}${props ? ` — ${props}` : ''}`);
    }
  } else {
    console.log('  none returned (see docs/figma-annotations.md for likely causes)');
  }

  console.log('\n/v1/comments:');
  if (report.commentsError) {
    console.log(`  error: ${report.commentsError}`);
  } else if (report.comments) {
    console.log(`  found ${report.comments} comment(s); sample:`);
    for (const m of report.commentSample) console.log(`    • ${m}`);
  } else {
    console.log('  none returned');
  }

  console.log('\nFinding:');
  if (report.annotationsReachable) {
    console.log('  Dev Mode annotations ARE reachable with this token — export can pull them.');
  } else {
    console.log('  Dev Mode annotations NOT returned for this token + file.');
    console.log('  Likely: the queried nodes carry no annotations, the file is not on a');
    console.log('  Dev-Mode-enabled (Organization/Enterprise) plan, or annotations sit on');
    console.log('  other nodes. The "file_content:read" scope is correct — there is no');
    console.log('  separate annotation scope. Comments (file_comments:read) are a different');
    console.log('  feature and are not a substitute. Fall back to visible text layers.');
  }
}

function printHelp() {
  console.log(`Usage:
  node scripts/figma-annotations.js <figma-url-or-node-id> [file-key] [--json]

Confirms whether Dev Mode annotations (node.annotations) and file comments
(/v1/comments) are reachable for the current FIGMA_ACCESS_TOKEN, and prints
the content. See docs/figma-annotations.md.`);
}
