const fs = require('fs');

const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_MIN_DELTA = 0.05;

function activeEntries(ledger) {
  const entries = Array.isArray(ledger?.entries) ? ledger.entries : [];
  const lastPass = entries.map((entry) => entry.pass).lastIndexOf(true);
  return entries.slice(lastPass + 1);
}

function effectiveLimits(ledger, current) {
  const recorded = ledger?.limits || {};
  return {
    maxIterations: Math.min(recorded.maxIterations ?? current.maxIterations, current.maxIterations),
    minDelta: Math.max(recorded.minDelta ?? current.minDelta, current.minDelta),
  };
}

function worstScore(entry) {
  return Math.max(...Object.values(entry.scores || {}));
}

function inspectLoop(ledger, currentLimits) {
  const entries = activeEntries(ledger);
  const limits = effectiveLimits(ledger, currentLimits);
  if (entries.length >= limits.maxIterations) {
    return {
      exitCode: 2,
      stopReason: `HARD STOP: max iterations (${limits.maxIterations}) reached — do not continue remediating; escalate to a human.`,
      limits,
    };
  }
  if (entries.length >= 2) {
    const previous = entries[entries.length - 2];
    const latest = entries[entries.length - 1];
    if (!previous.pass && !latest.pass) {
      const before = worstScore(previous);
      const after = worstScore(latest);
      const delta = before === 0 ? (after < before ? Infinity : 0) : (before - after) / before;
      if (delta < limits.minDelta) {
        return {
          exitCode: 2,
          stopReason: `HARD STOP: score not improving (delta ${(delta * 100).toFixed(2)}% < ${(limits.minDelta * 100).toFixed(2)}%) — remaining diff is at/near the noise floor; report as noise, not defect.`,
          delta,
          limits,
        };
      }
    }
  }
  return { exitCode: null, stopReason: null, limits };
}

function appendEntry(ledger, entry, currentLimits) {
  const priorEntries = Array.isArray(ledger?.entries) ? ledger.entries : [];
  const beginsFresh = priorEntries[priorEntries.length - 1]?.pass === true;
  const entries = beginsFresh ? [] : priorEntries;
  const limits = beginsFresh
    ? { ...currentLimits }
    : effectiveLimits(ledger, currentLimits);
  return {
    limits,
    entries: [...entries, { ...entry, iteration: entries.length + 1 }],
  };
}

function readLedger(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeLedger(file, ledger) {
  fs.writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
}

function resetLedger(file) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

module.exports = {
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_MIN_DELTA,
  activeEntries,
  appendEntry,
  effectiveLimits,
  inspectLoop,
  readLedger,
  resetLedger,
  writeLedger,
};
