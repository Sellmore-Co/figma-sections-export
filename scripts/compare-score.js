#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { captureBreakpoints } = require('./lib/capture');
const {
  BREAKPOINTS,
  PROJECT_ROOT,
  buildLiveUrl,
  parseComparisonPositionals,
  resolveReferenceSection,
  resolveSectionCapture,
  resolveSectionPage,
} = require('./lib/compare-shared');
const { PIXELMATCH_THRESHOLD, evaluateThreshold, resolveThresholds, scorePair } = require('./lib/score');
const { DEFAULT_MAX_ITERATIONS, DEFAULT_MIN_DELTA, appendEntry, inspectLoop, readLedger, resetLedger, writeLedger } = require('./lib/loop-ledger');

function printUsage(stream = console.error) {
  stream('Usage: npm run compare:score <slug> [section] [port] [--threshold <ratio>] [--selector <css> | --full-page]');
  stream('       [--loop] [--max-iterations <n>] [--min-delta <ratio>] [--reset-loop]');
  stream('Exit codes: 0 pass, 1 fail but remediation may continue, 2 hard stop.');
  stream('By default, a known landing section is captured by its source-resolved top-level <section> index.');
  stream('  --selector <css>  Capture the first element matching an explicit CSS selector.');
  stream('  --full-page       Capture the full configured entry page (disables section scoping).');
  stream('Examples:');
  stream('  npm run compare:score hero-1');
  stream('  npm run compare:score hero-1 3001');
  stream('  npm run compare:score my-campaign nav-2');
  stream('  npm run compare:score my-campaign nav-2 3001 --threshold 0.02');
  stream('  npm run compare:score my-campaign hero-1 --selector "[data-hero]"');
  stream('  npm run compare:score my-campaign hero-1 --full-page');
}

function parseArgs(rawArgs) {
  const positional = [];
  let threshold = null;
  let selector = null;
  let fullPage = false;
  let loop = false;
  let resetLoop = false;
  let maxIterations = null;
  let minDelta = null;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const argument = rawArgs[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--threshold') {
      const value = rawArgs[index + 1];
      if (value === undefined) return { error: 'Missing value for --threshold.' };
      threshold = Number(value);
      index += 1;
    } else if (argument.startsWith('--threshold=')) {
      threshold = Number(argument.slice('--threshold='.length));
    } else if (argument === '--selector') {
      const value = rawArgs[index + 1];
      if (value === undefined || value.startsWith('--')) return { error: 'Missing value for --selector.' };
      selector = value;
      index += 1;
    } else if (argument.startsWith('--selector=')) {
      selector = argument.slice('--selector='.length);
      if (!selector) return { error: 'Missing value for --selector.' };
    } else if (argument === '--full-page') {
      fullPage = true;
    } else if (argument === '--loop') {
      loop = true;
    } else if (argument === '--reset-loop') {
      resetLoop = true;
    } else if (argument === '--max-iterations' || argument.startsWith('--max-iterations=')) {
      maxIterations = Number(argument.includes('=') ? argument.slice(argument.indexOf('=') + 1) : rawArgs[++index]);
    } else if (argument === '--min-delta' || argument.startsWith('--min-delta=')) {
      minDelta = Number(argument.includes('=') ? argument.slice(argument.indexOf('=') + 1) : rawArgs[++index]);
    } else if (argument.startsWith('--')) {
      return { error: `Unknown option: ${argument}` };
    } else {
      positional.push(argument);
    }
  }

  if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)) {
    return { error: 'Threshold must be a finite mismatch ratio from 0 to 1.' };
  }
  if (selector && fullPage) {
    return { error: '--selector and --full-page cannot be used together.' };
  }
  if (maxIterations !== null && (!Number.isInteger(maxIterations) || maxIterations < 1)) return { error: '--max-iterations must be a positive integer.' };
  if (minDelta !== null && (!Number.isFinite(minDelta) || minDelta < 0 || minDelta > 1)) return { error: '--min-delta must be a ratio from 0 to 1.' };

  return {
    ...parseComparisonPositionals(positional),
    threshold,
    selector,
    fullPage,
    loop,
    resetLoop,
    maxIterations,
    minDelta,
    help: false,
  };
}

function relativePath(file) {
  return path.relative(PROJECT_ROOT, file).split(path.sep).join('/');
}

function signed(value) {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function printSummary(results, thresholds, pass, reportPath) {
  console.log('\nBreakpoint  Score       Dimensions  Delta (w,h)    SSIM');
  console.log('----------  ----------  ----------  -------------  ----------');
  for (const breakpoint of BREAKPOINTS) {
    const result = results[breakpoint.name];
    console.log(
      `${breakpoint.name.padEnd(10)}  ${result.score.toFixed(6).padStart(10)}  `
        + `${(result.dimensionsMatch ? 'match' : 'MISMATCH').padEnd(10)}  `
        + `${`${signed(result.dimensionDelta.width)},${signed(result.dimensionDelta.height)}`.padEnd(13)}  `
        + result.ssim.toFixed(6),
    );
  }
  let gate;
  if (pass === false) {
    gate = thresholds === null
      ? 'FAIL (dimension gate)'
      : 'FAIL at per-breakpoint threshold';
  } else if (pass === null) {
    gate = 'dimension gate passed; pixel score not evaluated (no threshold supplied)';
  } else {
    gate = 'PASS at per-breakpoint threshold';
  }
  console.log(`\nOverall: ${gate}`);
  console.log(`Report: ${relativePath(reportPath)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage(console.log);
    return;
  }
  if (args.error) {
    console.error(args.error);
    printUsage();
    process.exitCode = 1;
    return;
  }
  if (!args.slug) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  if (args.invalidPort !== null) {
    console.error(`Invalid port "${args.invalidPort}" — must be a number.`);
    process.exitCode = 1;
    return;
  }

  const srcDir = path.join(PROJECT_ROOT, 'src', args.slug);
  const refDir = path.join(srcDir, '_ref');
  if (!fs.existsSync(srcDir)) throw new Error(`Campaign not found: src/${args.slug}/`);
  fs.mkdirSync(refDir, { recursive: true });

  const resolution = resolveReferenceSection({
    refDir,
    explicitSection: args.explicitSection,
    slug: args.slug,
    command: 'npm run compare:score',
  });
  if (resolution.errors.length) throw new Error(resolution.errors.join('\n'));
  if (resolution.warning) console.warn(resolution.warning);
  if (!resolution.sectionName) {
    throw new Error('No *-desktop.png files in _ref/ — run save-ref.sh first.');
  }

  const section = resolution.sectionName;
  const missingRefs = BREAKPOINTS
    .map((breakpoint) => path.join(refDir, `${section}-${breakpoint.name}.png`))
    .filter((file) => !fs.existsSync(file));
  if (missingRefs.length) {
    throw new Error(`Missing Figma refs:\n${missingRefs.map((file) => `  ${relativePath(file)}`).join('\n')}`);
  }

  const captureDir = path.join(refDir, 'capture');
  fs.mkdirSync(captureDir, { recursive: true });
  const calibrationPath = path.join(captureDir, `${section}-calibration.json`);
  const calibration = fs.existsSync(calibrationPath)
    ? JSON.parse(fs.readFileSync(calibrationPath, 'utf8'))
    : null;
  const thresholdResolution = resolveThresholds(
    args.threshold,
    calibration,
    BREAKPOINTS.map((breakpoint) => breakpoint.name),
  );
  const ledgerPath = path.join(captureDir, `${section}-loop.json`);
  const reportPath = path.join(captureDir, `${section}-score.json`);
  if (args.resetLoop) resetLedger(ledgerPath);
  const configuredLimits = {
    maxIterations: args.maxIterations ?? calibration?.loopDefaults?.maxIterations ?? DEFAULT_MAX_ITERATIONS,
    minDelta: args.minDelta ?? calibration?.loopDefaults?.minDelta ?? DEFAULT_MIN_DELTA,
  };
  if (args.loop) {
    const ledger = readLedger(ledgerPath);
    const inspection = inspectLoop(ledger, configuredLimits);
    if (inspection.stopReason) {
      writeLedger(ledgerPath, { ...ledger, stopReason: inspection.stopReason });
      if (fs.existsSync(reportPath)) {
        const priorReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        fs.writeFileSync(reportPath, `${JSON.stringify({ ...priorReport, stopReason: inspection.stopReason }, null, 2)}\n`);
      }
      console.error(inspection.stopReason);
      process.exitCode = inspection.exitCode;
      return;
    }
  }
  let liveUrl;
  let sectionIndex = null;
  if (args.fullPage) {
    liveUrl = buildLiveUrl(args.port, args.slug);
  } else if (args.selector) {
    const sectionPage = resolveSectionPage({ slug: args.slug, section });
    liveUrl = buildLiveUrl(args.port, args.slug, sectionPage.entryUrl);
  } else {
    const sectionCapture = resolveSectionCapture({ slug: args.slug, section });
    liveUrl = buildLiveUrl(args.port, args.slug, sectionCapture.entryUrl);
    sectionIndex = sectionCapture.sectionIndex;
    if (sectionCapture.warning) console.warn(sectionCapture.warning);
  }
  const capturePaths = await captureBreakpoints({
    liveUrl,
    breakpoints: BREAKPOINTS,
    outputPathFor: (breakpoint) => path.join(captureDir, `${section}-${breakpoint.name}-live.png`),
    selector: args.selector,
    sectionIndex,
    sectionName: section,
    fullPage: args.fullPage,
  });

  const breakpointResults = {};
  for (const breakpoint of BREAKPOINTS) {
    const refPath = path.join(refDir, `${section}-${breakpoint.name}.png`);
    const capturePath = capturePaths[breakpoint.name];
    const heatmapPath = path.join(captureDir, `${section}-${breakpoint.name}-heatmap.png`);
    const result = await scorePair(refPath, capturePath, { heatmapPath });
    breakpointResults[breakpoint.name] = {
      score: result.score,
      dimensionsMatch: result.dimensionsMatch,
      dimensionDelta: result.dimensionDelta,
      ssim: result.ssim,
      topRegions: result.topRegions,
      heatmapPath: relativePath(heatmapPath),
      capturePath: relativePath(capturePath),
      refPath: relativePath(refPath),
    };
  }

  const pass = evaluateThreshold(breakpointResults, thresholdResolution.thresholds);
  const report = {
    slug: args.slug,
    section,
    liveUrl,
    captureScope: args.fullPage
      ? { mode: 'full-page' }
      : args.selector
        ? { mode: 'selector', selector: args.selector }
        : { mode: sectionIndex === null ? 'full-page-fallback' : 'section-index', sectionIndex },
    pixelmatchThreshold: PIXELMATCH_THRESHOLD,
    threshold: thresholdResolution.thresholds,
    thresholdSource: thresholdResolution.source,
    pass,
    breakpoints: breakpointResults,
  };
  if (args.loop) {
    const ledger = appendEntry(readLedger(ledgerPath), {
      timestamp: new Date().toISOString(),
      scores: Object.fromEntries(BREAKPOINTS.map((breakpoint) => [breakpoint.name, breakpointResults[breakpoint.name].score])),
      pass: pass !== false,
    }, configuredLimits);
    writeLedger(ledgerPath, ledger);
  }
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  printSummary(breakpointResults, thresholdResolution.thresholds, pass, reportPath);
  if (pass === false) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { main, parseArgs, printSummary, printUsage };
