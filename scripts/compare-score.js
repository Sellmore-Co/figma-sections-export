#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { captureBreakpoints } = require('./lib/capture');
const {
  BREAKPOINTS,
  PROJECT_ROOT,
  buildLiveUrl,
  parseComparisonPositionals,
  readRefSidecar,
  resolveReferenceSection,
  resolveSectionCapture,
  resolveSectionPage,
} = require('./lib/compare-shared');
const { CorruptCalibrationError, PIXELMATCH_THRESHOLD, evaluateThreshold, flagSsimAnomalies, readDimensions, resolveThresholds, scorePair, validateCalibration } = require('./lib/score');
const { CorruptStateError, DEFAULT_MAX_ITERATIONS, DEFAULT_MIN_DELTA, MAX_ITERATIONS, MIN_LOOP_DELTA, acquireLock, appendEntry, assertLoopIdentity, initializeLedger, inspectLoop, readLedger, releaseLock, resetLedger, writeLedger } = require('./lib/loop-ledger');

function printUsage(stream = console.error) {
  stream('Usage: npm run compare:score <slug> [section] [port] [--threshold <ratio>] [--selector <css> | --full-page]');
  stream('       [--loop] [--max-iterations <n>] [--min-delta <ratio>] [--reset-loop]');
  stream('Exit codes: 0 pass, 1 fail but remediation may continue, 2 hard stop.');
  stream('By default, a known landing section is captured by its source-resolved top-level <section> index.');
  stream('  --selector <css>  Capture the first element matching an explicit CSS selector.');
  stream('  --full-page       Capture the full configured entry page (disables section scoping).');
  stream('Known limitation: pixelmatch@0.1 can miss color-only differences; any passing breakpoint with SSIM < 0.95 is flagged for manual review.');
  stream('Figma refs and the loop ledger are audit-trusted artifacts; PR review is the enforcement gate for changes to them.');
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

  if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0 || threshold > 0.25)) {
    return { error: 'Threshold must be a finite mismatch ratio from 0 to 0.25.' };
  }
  if (selector && fullPage) {
    return { error: '--selector and --full-page cannot be used together.' };
  }
  // Loop limits only mean anything with --loop; accepting them elsewhere let
  // "--reset-loop --min-delta 0" destroy a stopped ledger before validation
  // rejected the value. Validate everything before any side effect can occur.
  if ((maxIterations !== null || minDelta !== null) && !loop) {
    return { error: '--max-iterations and --min-delta require --loop.' };
  }
  if (maxIterations !== null && (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > MAX_ITERATIONS)) return { error: '--max-iterations must be an integer from 1 to 25.' };
  if (minDelta !== null && (!Number.isFinite(minDelta) || minDelta < MIN_LOOP_DELTA || minDelta > 1)) return { error: '--min-delta must be a ratio from 0.005 to 1; the stagnation stop cannot be disabled.' };

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

function printSummary(results, thresholds, pass, reportPath, breakpoints = BREAKPOINTS) {
  console.log('\nBreakpoint  Score       Width       Delta (w,h)    SSIM');
  console.log('----------  ----------  ----------  -------------  ----------');
  for (const breakpoint of breakpoints) {
    const result = results[breakpoint.name];
    console.log(
      `${breakpoint.name.padEnd(10)}  ${result.score.toFixed(6).padStart(10)}  `
        + `${(result.widthMatch ? 'match' : 'MISMATCH').padEnd(10)}  `
        + `${`${signed(result.dimensionDelta.width)},${signed(result.dimensionDelta.height)}`.padEnd(13)}  `
        + result.ssim.toFixed(6),
    );
  }
  let gate;
  if (pass === false) {
    gate = thresholds === null
      ? 'FAIL (width gate)'
      : 'FAIL at per-breakpoint threshold';
  } else if (pass === null) {
    gate = 'width gate passed; pixel score not evaluated (no threshold supplied)';
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
  const refSidecar = readRefSidecar(refDir, section);
  if (!refSidecar) {
    const error = new Error(`refs for '${section}' were saved without metadata (older save-ref.sh) — re-run save-ref.sh to regenerate refs at scale=1 with a sidecar.`);
    error.exitCode = 2;
    throw error;
  }
  const breakpoints = BREAKPOINTS
    .filter((breakpoint) => refSidecar.breakpoints?.[breakpoint.name])
    .map((breakpoint) => ({ ...breakpoint, width: refSidecar.breakpoints[breakpoint.name].width }));
  const missingRefs = breakpoints
    .map((breakpoint) => path.join(refDir, `${section}-${breakpoint.name}.png`))
    .filter((file) => !fs.existsSync(file));
  if (missingRefs.length) {
    throw new Error(`Missing Figma refs:\n${missingRefs.map((file) => `  ${relativePath(file)}`).join('\n')}`);
  }
  for (const breakpoint of breakpoints) {
    const refPath = path.join(refDir, `${section}-${breakpoint.name}.png`);
    const dimensions = await readDimensions(refPath);
    if (dimensions.width !== breakpoint.width) {
      const error = new Error(`ref ${section}-${breakpoint.name}.png width ${dimensions.width} does not match recorded frame width ${breakpoint.width} — refs are stale, re-run save-ref.sh.`);
      error.exitCode = 2;
      throw error;
    }
  }

  const captureDir = path.join(refDir, 'capture');
  fs.mkdirSync(captureDir, { recursive: true });
  const ledgerPath = path.join(captureDir, `${section}-loop.json`);
  const reportPath = path.join(captureDir, `${section}-score.json`);
  const lockPath = `${ledgerPath}.lock`;
  acquireLock(lockPath);
  try {
  const calibrationPath = path.join(captureDir, `${section}-calibration.json`);
  let calibration = null;
  if (fs.existsSync(calibrationPath)) {
    try { calibration = validateCalibration(JSON.parse(fs.readFileSync(calibrationPath, 'utf8'))); }
    catch (error) { throw new CorruptCalibrationError(); }
  }
  const thresholdResolution = resolveThresholds(
    args.threshold,
    calibration,
    breakpoints.map((breakpoint) => breakpoint.name),
  );
  const configuredLimits = {
    maxIterations: args.maxIterations ?? calibration?.loopDefaults?.maxIterations ?? DEFAULT_MAX_ITERATIONS,
    minDelta: args.minDelta ?? calibration?.loopDefaults?.minDelta ?? DEFAULT_MIN_DELTA,
  };
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
  const captureScope = args.fullPage
    ? { mode: 'full-page' }
    : args.selector
      ? { mode: 'selector', selector: args.selector }
      : { mode: sectionIndex === null ? 'full-page-fallback' : 'section-index', ...(sectionIndex === null ? {} : { sectionIndex }) };
  const refHashes = Object.fromEntries(breakpoints.map((bp) => [bp.name, crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(refDir, `${section}-${bp.name}.png`))).digest('hex')]));
  const thresholdConfig = { thresholds: thresholdResolution.thresholds, source: thresholdResolution.source };
  let ledger = null;
  let resets = [];
  if (args.loop || args.resetLoop) {
    try { ledger = readLedger(ledgerPath); } catch (error) {
      if (!args.resetLoop) throw error;
      console.warn('WARNING: corrupt loop ledger reset; prior audit details could not be preserved.');
    }
  }
  if (args.resetLoop) {
    if (ledger?.stopReason) console.warn('WARNING: resetting a loop that had a HARD STOP; reset recorded in audit history.');
    resets = resetLedger(ledgerPath, ledger);
    ledger = resets.length ? initializeLedger(configuredLimits, { section, captureScope, refHashes, thresholdConfig, resets }) : null;
    if (ledger) writeLedger(ledgerPath, ledger);
  }
  if (args.loop && ledger) {
    assertLoopIdentity(ledger, { section, captureScope, refHashes, thresholdConfig });
    if (ledger.stopReason) { console.error(ledger.stopReason); process.exitCode = 2; return; }
  }
  const capturePaths = await captureBreakpoints({
    liveUrl,
    breakpoints,
    outputPathFor: (breakpoint) => path.join(captureDir, `${section}-${breakpoint.name}-live.png`),
    selector: args.selector,
    sectionIndex,
    sectionName: section,
    fullPage: args.fullPage,
  });

  const breakpointResults = {};
  for (const breakpoint of breakpoints) {
    const refPath = path.join(refDir, `${section}-${breakpoint.name}.png`);
    const capturePath = capturePaths[breakpoint.name];
    const heatmapPath = path.join(captureDir, `${section}-${breakpoint.name}-heatmap.png`);
    const result = await scorePair(refPath, capturePath, { heatmapPath });
    breakpointResults[breakpoint.name] = {
      score: result.score,
      widthMatch: result.widthMatch,
      heightDelta: result.heightDelta,
      dimensionDelta: result.dimensionDelta,
      ssim: result.ssim,
      topRegions: result.topRegions,
      heatmapPath: relativePath(heatmapPath),
      capturePath: relativePath(capturePath),
      refPath: relativePath(refPath),
    };
  }

  const pass = evaluateThreshold(breakpointResults, thresholdResolution.thresholds);
  const anomalies = flagSsimAnomalies(breakpointResults, thresholdResolution.thresholds);
  if (anomalies.length) console.warn(`WARNING: score passed but SSIM is anomalously low — verify colors manually (${anomalies.join(', ')})`);
  const report = {
    slug: args.slug,
    section,
    liveUrl,
    captureScope,
    refHashes,
    pixelmatchThreshold: PIXELMATCH_THRESHOLD,
    threshold: thresholdResolution.thresholds,
    thresholdSource: thresholdResolution.source,
    pass,
    breakpoints: breakpointResults,
  };
  if (args.loop) {
    const ledgerPass = thresholdResolution.thresholds === null ? null : pass;
    ledger = appendEntry(ledger, {
      timestamp: new Date().toISOString(),
      scores: Object.fromEntries(breakpoints.map((breakpoint) => [breakpoint.name, breakpointResults[breakpoint.name].score])),
      pass: ledgerPass,
      ssimAnomalies: anomalies,
      failingBreakpoints: thresholdResolution.thresholds === null ? [] : breakpoints
        .filter((bp) => !breakpointResults[bp.name].widthMatch
          || breakpointResults[bp.name].score > thresholdResolution.thresholds[bp.name])
        .map((bp) => bp.name),
    }, configuredLimits, { section, captureScope, refHashes, thresholdConfig, resets });
    writeLedger(ledgerPath, ledger);
    // Hard stops are inspected on EVERY loop run, including null-threshold
    // ones — max-iterations/stagnation apply regardless of the pixel gate.
    const inspection = inspectLoop(ledger, configuredLimits, thresholdResolution.thresholds);
    if (inspection.stopReason) {
      ledger.stopReason = inspection.stopReason;
      writeLedger(ledgerPath, ledger);
      report.stopReason = inspection.stopReason;
      fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      console.error(inspection.stopReason);
      process.exitCode = 2;
      return;
    }
    if (thresholdResolution.thresholds === null) {
      fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      console.error('no threshold in effect — run compare:calibrate first');
      process.exitCode = 1;
      return;
    }
  }
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  printSummary(breakpointResults, thresholdResolution.thresholds, pass, reportPath, breakpoints);
  if (pass === false) process.exitCode = 1;
  } finally {
    releaseLock(lockPath);
  }
}

if (require.main === module) {
  main().catch((error) => {
    if (error instanceof CorruptStateError || error instanceof CorruptCalibrationError) {
      console.error('ledger/calibration corrupt — refusing to continue; use --reset-loop / re-run compare:calibrate');
      process.exit(2);
    }
    console.error(error.message);
    process.exit(error.exitCode || (/another compare:score|mid-loop|hashes changed|scope changed/.test(error.message) ? 2 : 1));
  });
}

module.exports = { main, parseArgs, printSummary, printUsage };
