#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { captureBreakpoints } = require('./lib/capture');
const {
  BREAKPOINTS, PROJECT_ROOT, buildLiveUrl, parseComparisonPositionals,
  resolveReferenceSection, resolveSectionCapture,
} = require('./lib/compare-shared');
const { scorePair } = require('./lib/score');
const { DEFAULT_MAX_ITERATIONS, DEFAULT_MIN_DELTA } = require('./lib/loop-ledger');

function usage(stream = console.error) {
  stream('Usage: npm run compare:calibrate <slug> [section] [port] [--samples <n>] [--multiplier <n>] [--minimum-floor <ratio>]');
}

function parseArgs(raw) {
  const positional = [];
  const values = { samples: 3, multiplier: 3, minimumFloor: 0.002 };
  const flags = { '--samples': 'samples', '--multiplier': 'multiplier', '--minimum-floor': 'minimumFloor' };
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === '--help' || raw[i] === '-h') return { help: true };
    const equal = raw[i].match(/^(--[^=]+)=(.*)$/);
    const flag = equal ? equal[1] : raw[i];
    if (flags[flag]) {
      const value = equal ? equal[2] : raw[++i];
      if (value === undefined) return { error: `Missing value for ${flag}.` };
      values[flags[flag]] = Number(value);
    } else if (raw[i].startsWith('--')) return { error: `Unknown option: ${raw[i]}` };
    else positional.push(raw[i]);
  }
  if (!Number.isInteger(values.samples) || values.samples < 2) return { error: '--samples must be an integer of at least 2.' };
  if (!Number.isFinite(values.multiplier) || values.multiplier < 0) return { error: '--multiplier must be a non-negative number.' };
  if (!Number.isFinite(values.minimumFloor) || values.minimumFloor < 0 || values.minimumFloor > 1) return { error: '--minimum-floor must be a ratio from 0 to 1.' };
  return { ...parseComparisonPositionals(positional), ...values };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage(console.log);
  if (args.error || !args.slug) {
    if (args.error) console.error(args.error);
    usage(); process.exitCode = 1; return;
  }
  if (args.invalidPort !== null) throw new Error(`Invalid port "${args.invalidPort}" — must be a number.`);
  const srcDir = path.join(PROJECT_ROOT, 'src', args.slug);
  const refDir = path.join(srcDir, '_ref');
  if (!fs.existsSync(srcDir)) throw new Error(`Campaign not found: src/${args.slug}/`);
  if (!fs.existsSync(refDir)) throw new Error(`Reference directory not found: src/${args.slug}/_ref/`);
  const resolution = resolveReferenceSection({ refDir, explicitSection: args.explicitSection, slug: args.slug, command: 'npm run compare:calibrate' });
  if (resolution.errors.length) throw new Error(resolution.errors.join('\n'));
  if (!resolution.sectionName) throw new Error('No *-desktop.png files in _ref/ — run save-ref.sh first.');
  const section = resolution.sectionName;
  const scope = resolveSectionCapture({ slug: args.slug, section });
  if (scope.warning) console.warn(scope.warning);
  const liveUrl = buildLiveUrl(args.port, args.slug, scope.entryUrl);
  const captureDir = path.join(refDir, 'capture');
  const captures = [];
  for (let sample = 1; sample <= args.samples; sample += 1) {
    captures.push(await captureBreakpoints({
      liveUrl, breakpoints: BREAKPOINTS, sectionIndex: scope.sectionIndex, sectionName: section,
      outputPathFor: (bp) => path.join(captureDir, `${section}-${bp.name}-calibration-${sample}.png`),
    }));
  }
  const calibration = {};
  for (const bp of BREAKPOINTS) {
    const scores = [];
    for (let sample = 1; sample < captures.length; sample += 1) {
      scores.push((await scorePair(captures[0][bp.name], captures[sample][bp.name])).score);
    }
    const noiseFloor = Math.max(0, ...scores);
    calibration[bp.name] = { noiseFloor, threshold: Math.max(noiseFloor * args.multiplier, args.minimumFloor), samples: args.samples };
  }
  calibration.loopDefaults = { maxIterations: DEFAULT_MAX_ITERATIONS, minDelta: DEFAULT_MIN_DELTA };
  calibration.calibratedAt = new Date().toISOString();
  const output = path.join(captureDir, `${section}-calibration.json`);
  fs.writeFileSync(output, `${JSON.stringify(calibration, null, 2)}\n`);
  console.log('\nBreakpoint  Noise floor  Threshold   Samples');
  console.log('----------  -----------  ----------  -------');
  for (const bp of BREAKPOINTS) console.log(`${bp.name.padEnd(10)}  ${calibration[bp.name].noiseFloor.toFixed(6).padStart(11)}  ${calibration[bp.name].threshold.toFixed(6).padStart(10)}  ${String(args.samples).padStart(7)}`);
  console.log(`\nCalibration: ${path.relative(PROJECT_ROOT, output)}`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });
module.exports = { main, parseArgs };
