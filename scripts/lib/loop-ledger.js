const fs = require('fs');

const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_MIN_DELTA = 0.05;
const MAX_ITERATIONS = 25;
const MIN_LOOP_DELTA = 0.005;
const STALE_LOCK_MS = 10 * 60 * 1000;

class CorruptStateError extends Error {}

function finiteRatio(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validLimits(limits) {
  return limits && Number.isInteger(limits.maxIterations)
    && limits.maxIterations >= 1 && limits.maxIterations <= MAX_ITERATIONS
    && finiteRatio(limits.minDelta) && limits.minDelta >= MIN_LOOP_DELTA;
}

function validScope(scope) {
  if (!scope || typeof scope.mode !== 'string') return false;
  if (scope.mode === 'selector') return typeof scope.selector === 'string' && scope.selector.length > 0;
  if (scope.mode === 'section-index') return Number.isInteger(scope.sectionIndex) && scope.sectionIndex >= 0;
  return scope.mode === 'full-page' || scope.mode === 'full-page-fallback';
}

function validHashes(hashes) {
  return hashes && ['desktop', 'tablet', 'mobile'].every((name) => /^[a-f0-9]{64}$/.test(hashes[name] || ''));
}

function validThresholdConfig(config) {
  if (config && config.source === null && config.thresholds === null) return true;
  return config && (config.source === 'flag' || config.source === 'calibration')
    && config.thresholds && ['desktop', 'tablet', 'mobile'].every((name) => finiteRatio(config.thresholds[name]) && config.thresholds[name] <= 0.25);
}

function validateLedger(ledger) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) throw new CorruptStateError();
  if (!validLimits(ledger.limits) || !Array.isArray(ledger.entries)) throw new CorruptStateError();
  if (typeof ledger.section !== 'string' || !ledger.section || !validScope(ledger.captureScope)
    || !validHashes(ledger.refHashes) || !validThresholdConfig(ledger.thresholdConfig)) throw new CorruptStateError();
  ledger.entries.forEach((entry, index) => {
    if (!entry || entry.iteration !== index + 1 || typeof entry.timestamp !== 'string'
      || !Number.isFinite(Date.parse(entry.timestamp)) || !entry.scores || Array.isArray(entry.scores)
      || !['desktop', 'tablet', 'mobile'].every((name) => finiteRatio(entry.scores[name]))
      || Object.keys(entry.scores).length !== 3
      || ![true, false, null].includes(entry.pass)) throw new CorruptStateError();
    if (entry.ssimAnomalies !== undefined && (!Array.isArray(entry.ssimAnomalies)
      || !entry.ssimAnomalies.every((name) => ['desktop', 'tablet', 'mobile'].includes(name)))) throw new CorruptStateError();
    if (entry.failingBreakpoints !== undefined && (!Array.isArray(entry.failingBreakpoints)
      || !entry.failingBreakpoints.every((name) => ['desktop', 'tablet', 'mobile'].includes(name)))) throw new CorruptStateError();
  });
  if (ledger.resets !== undefined && (!Array.isArray(ledger.resets) || !ledger.resets.every((reset) => reset
    && typeof reset.at === 'string' && Number.isFinite(Date.parse(reset.at))
    && typeof reset.previousStopReason === 'string' && Number.isInteger(reset.previousIterations) && reset.previousIterations >= 0))) throw new CorruptStateError();
  if (ledger.stopReason !== undefined && typeof ledger.stopReason !== 'string') throw new CorruptStateError();
  return ledger;
}

function effectiveLimits(ledger, current) {
  const recorded = ledger?.limits || {};
  return {
    maxIterations: Math.min(recorded.maxIterations ?? current.maxIterations, current.maxIterations),
    minDelta: Math.max(recorded.minDelta ?? current.minDelta, current.minDelta),
  };
}

function inspectLoop(ledger, currentLimits, thresholds) {
  const entries = ledger?.entries || [];
  const limits = effectiveLimits(ledger, currentLimits);
  if (entries[entries.length - 1]?.pass === true) return { exitCode: null, stopReason: null, limits };
  if (entries.length >= limits.maxIterations) return {
    exitCode: 2,
    stopReason: `HARD STOP: max iterations (${limits.maxIterations}) reached — do not continue remediating; escalate to a human.`,
    limits,
  };
  if (entries.length >= 2) {
    const previous = entries[entries.length - 2];
    const latest = entries[entries.length - 1];
    if (previous.pass !== true && latest.pass !== true) {
      const names = Object.keys(latest.scores);
      const improved = names.some((name) => previous.scores[name] - latest.scores[name] >= limits.minDelta);
      const worsened = names.some((name) => latest.scores[name] - previous.scores[name] >= limits.minDelta);
      if (!improved || worsened) {
        const failing = latest.failingBreakpoints || names.filter((name) => !thresholds || latest.scores[name] > thresholds[name]);
        const nearFloor = thresholds && failing.length > 0
          && failing.every((name) => latest.scores[name] <= 5 * thresholds[name]);
        const detail = nearFloor
          ? 'remaining diff is at/near the noise floor; report as noise'
          : 'stalled far above threshold — this looks like a real defect the remediation is not fixing; escalate to a human';
        return { exitCode: 2, stopReason: `HARD STOP: score not improving safely — ${detail}.`, limits };
      }
    }
  }
  return { exitCode: null, stopReason: null, limits };
}

function appendEntry(ledger, entry, currentLimits, identity) {
  const base = ledger || initializeLedger(currentLimits, identity);
  return { ...base, limits: effectiveLimits(base, currentLimits), entries: [...base.entries, { ...entry, iteration: base.entries.length + 1 }] };
}

function initializeLedger(currentLimits, identity) {
  return {
    limits: { ...currentLimits }, entries: [], resets: identity.resets || [],
    section: identity.section, captureScope: identity.captureScope,
    refHashes: identity.refHashes, thresholdConfig: identity.thresholdConfig,
  };
}

function assertLoopIdentity(ledger, identity) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(ledger.thresholdConfig, identity.thresholdConfig)) throw new Error('threshold changed mid-loop — use --reset-loop to start a new loop');
  if (ledger.section !== identity.section || !same(ledger.captureScope, identity.captureScope)) throw new Error('section or capture scope changed mid-loop — use --reset-loop to start a new loop');
  if (!same(ledger.refHashes, identity.refHashes)) throw new Error('Figma reference hashes changed mid-loop — use --reset-loop to start a new loop');
}

function readLedger(file) {
  if (!fs.existsSync(file)) return null;
  try { return validateLedger(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (error) { throw new CorruptStateError(); }
}

function writeLedger(file, ledger) {
  validateLedger(ledger);
  fs.writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
}

function resetLedger(file, previous, now = new Date().toISOString()) {
  const resets = Array.isArray(previous?.resets) ? [...previous.resets] : [];
  if (previous?.stopReason) resets.push({ at: now, previousStopReason: previous.stopReason, previousIterations: previous.entries.length });
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return resets;
}

function acquireLock(file, now = Date.now(), warn = console.warn) {
  try { fs.writeFileSync(file, `${process.pid}\n`, { flag: 'wx' }); return; } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const age = now - fs.statSync(file).mtimeMs;
  if (age <= STALE_LOCK_MS) throw new Error('another compare:score run holds the lock');
  warn('WARNING: stealing stale compare:score lock older than 10 minutes.');
  fs.unlinkSync(file);
  fs.writeFileSync(file, `${process.pid}\n`, { flag: 'wx' });
}

function releaseLock(file) { try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; } }

module.exports = {
  CorruptStateError, DEFAULT_MAX_ITERATIONS, DEFAULT_MIN_DELTA, MAX_ITERATIONS, MIN_LOOP_DELTA,
  acquireLock, appendEntry, assertLoopIdentity, effectiveLimits, initializeLedger, inspectLoop, readLedger, releaseLock, resetLedger,
  validateLedger, writeLedger,
};
