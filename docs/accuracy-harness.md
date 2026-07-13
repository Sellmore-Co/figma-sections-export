# Accuracy Harness — scored Figma-vs-live comparison

Engineer-facing reference for `compare:score` and `compare:calibrate`. The designer-facing
summary lives in [DESIGNER-WORKFLOW.md](../DESIGNER-WORKFLOW.md); command syntax in
[README.md](../README.md).

## Architecture

```
Figma ref PNGs (src/{slug}/_ref/{section}-{bp}.png, from save-ref.sh)
        │
headless capture (puppeteer-core + system Chrome/Edge, scripts/lib/capture.js)
  · section-scoped by source-resolved top-level <section> index (leaf partials only),
    or --selector / --full-page
  · fonts + images awaited (bounded), animations frozen, buffered writes so the
    dev server's live-reload cannot destroy the next breakpoint's page
        │
scoring (scripts/lib/score.js)
  · pixelmatch @ internal threshold 0.1 → mismatch ratio = THE score
  · dimension equality = independent hard gate (union-canvas padding; excess
    content is never cropped away)
  · SSIM = telemetry only; a passing breakpoint with SSIM < 0.95 is flagged
    ssimAnomaly (pixelmatch@0.1 is weak on subtle global color shifts)
  · 12×6 region grid → top mismatch regions + red/yellow heatmap PNG
        │
calibration (scripts/compare-calibrate.js)
  · ≥3 repeat captures of the live section, scored pairwise against the first
    → empirical noise floor per breakpoint
  · threshold = clamp(noiseFloor × multiplier, minimumFloor…0.25); refuses to
    write when the environment is unstable (noise floor > 0.05)
  · stores per-sample scores, capture scope, and ref SHA-256 hashes for audit
        │
loop ledger (scripts/lib/loop-ledger.js, --loop)
  · every scored run appends an entry; identity (section, scope, ref hashes,
    threshold config) is bound on the first iteration and cannot change mid-loop
  · HARD STOP when max iterations reached (≤25, recorded limits win) OR when no
    breakpoint improves ≥ min-delta / any breakpoint worsens ≥ min-delta
  · stop message is honest: "near the noise floor — report as noise" only when
    every failing score ≤ 5× its threshold; otherwise "stalled far above
    threshold — escalate to a human"
  · schema validation fails CLOSED (corrupt ledger/calibration → exit 2);
    --reset-loop always leaves a resets[] audit trace; mkdir lock, no auto-steal
```

## Exit codes

| Code | Meaning |
| ---- | ------- |
| 0 | PASS — dimension gate and every per-breakpoint threshold |
| 1 | FAIL, remediation may continue (or: no threshold in effect yet) |
| 2 | HARD STOP / refusal — stop remediating; human decision required |

Threshold precedence: `--threshold` flag → `{section}-calibration.json` → none
(dimension gate only, exit 1 in loop mode).

## Metric decision (Phase-1 spike, human-ratified path)

Benchmarked on a real ref frame against NOISE-class (localized text-edge AA, 1px
translate, +2% brightness) vs DEFECT-class (band shift, missing button, hue rotate,
extra canvas, scaled text) perturbations — see [scripts/spike/REPORT.md](../scripts/spike/REPORT.md):

- **Eliminated:** SSIM (rates a hue defect as more similar than a tolerated 1px
  translate) and pixelmatch@0.3 (scores the hue defect at zero).
- **Nominated:** pixelmatch@0.1 — the only metric that separates the classes —
  plus the dimension gate. Synthetic thresholds are parameter-dependent, so the
  production threshold comes from the real capture noise floor (compare:calibrate),
  never from the spike.

## Trust boundary

The harness fails closed on everything it reads, but it cannot stop a shell-capable
agent from rewriting the reference PNGs, the ledger, or the harness itself. Refs and
ledgers are **audit-trusted**: every score report and calibration carries ref SHA-256
hashes and capture scope so a reviewer can verify provenance. Enforcement is the PR
review gate, not the client.

## Proof (2026-07-12)

On a deterministic local fixture (`proof-fixture`, solid colors, system fonts):

| Step | Desktop score | Result |
| ---- | ------------- | ------ |
| Baseline | 0.000000 | PASS (SSIM 1.0) |
| Injected wrong brand color (CTA yellow→blue) | 0.045512 (tablet 0.077496, mobile 0.064638) | FAIL, heatmap localizes the CTA |
| One remediation pass (revert) | 0.000000 | PASS — threshold crossed, 100% diff reduction |

Negative control: refs re-captured at 2× device scale and downsampled (AA/font-render
noise only) scored 0.004408–0.008065 — the loop **hard-stopped on run 2**, classified
"at/near the noise floor; report as noise" instead of chasing it.

Real-world catch: `shield` `hero-4` scores 0.191372 — the brand display font was never
exported (no `@font-face`, no font classes), so the live render falls back to a Google
font. The loop stops with "stalled far above threshold — escalate to a human", which is
the correct classification for a genuine, locally-unfixable defect.

Calibration measured a noise floor of exactly 0.0 across repeat captures (same headless
Chrome, frozen animations), so the 0.002 minimum floor carries the default threshold.
Cross-renderer variance (Figma vs browser) is deliberately NOT part of the calibration
noise floor; it shows up in the score, which is the point of the gate.
