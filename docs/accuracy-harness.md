# Accuracy Harness — scored Figma-vs-live comparison

Engineer-facing reference for `compare:score` and `compare:calibrate`. The designer-facing
summary lives in [DESIGNER-WORKFLOW.md](../DESIGNER-WORKFLOW.md); command syntax in
[README.md](../README.md).

## Architecture

```
Figma ref PNGs + {section}-refs.json sidecar (src/{slug}/_ref/, from save-ref.sh)
  · save-ref.sh renders at scale=1 (ref px == CSS px == capture px, one
    coordinate space, no normalization) and writes the sidecar: per-breakpoint
    frame width + scale, read from each PNG's IHDR.
        │
headless capture (puppeteer-core + system Chrome/Edge, scripts/lib/capture.js)
  · capture width per breakpoint comes from the SIDECAR frame width, not a
    hardcoded breakpoint value — the standard template tablet frame is 820px
    (not the 768 md breakpoint), so hardcoding 768 dimension-mismatched every
    template ref. Missing sidecar → hard error (legacy 1.5× refs), never a
    silent MISMATCH.
  · section-scoped by source-resolved top-level <section> index (leaf partials only),
    or --selector / --full-page
  · fonts + images awaited (bounded), animations frozen, buffered writes so the
    dev server's live-reload cannot destroy the next breakpoint's page
        │
scoring (scripts/lib/score.js)
  · pixelmatch @ internal threshold 0.1 → mismatch ratio = THE score
  · WIDTH is the structural hard gate (widthMatch): a width mismatch means wrong
    viewport/scale/frame convention and always fails. HEIGHT is reported as a
    delta and folded into the score via union-canvas padding (excess content is
    never cropped away) — a legitimate in-progress height change shows up in the
    score, not as a conflated dimension hard-fail.
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
| 0 | PASS — width gate and every per-breakpoint threshold |
| 1 | FAIL, remediation may continue (or: no threshold in effect yet) |
| 2 | HARD STOP / refusal — stop remediating; human decision required (also: missing/stale ref sidecar — re-run save-ref.sh) |

Threshold precedence: `--threshold` flag → `{section}-calibration.json` → none
(width gate only, exit 1 in loop mode).

## Known limitation — section index vs rendered DOM

`resolveSectionIndex` (scripts/lib/compare-shared.js) computes the top-level
`<section>` index by counting sections in the page source and its included leaf
partials. The browser, by contrast, counts the *rendered* DOM. These agree for
the current templates, but if a campaign **layout** file (e.g. `base-landing.html`)
ever wraps `{{ content }}` in its own top-level `<section>`, the source count and
the DOM count desync and the harness captures the wrong section. Use `--selector`
to scope explicitly when a layout contributes its own sections.

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

Refs generated the way `save-ref.sh` now produces them — scale=1 with a
`{section}-refs.json` sidecar recording per-breakpoint **frame** widths
(desktop 1440, tablet **820**, mobile 375):

| Step | Desktop score | Result |
| ---- | ------------- | ------ |
| Baseline (all breakpoints, incl. tablet@820) | 0.000000 | PASS at every breakpoint (SSIM 1.0) |
| Injected wrong brand color (CTA yellow→blue) | 0.045512 (tablet 0.077953, mobile 0.064638) | FAIL, heatmap localizes the CTA |
| One remediation pass (revert) | 0.000000 | PASS — threshold crossed, 100% diff reduction |
| Refs with no sidecar (legacy 1.5× set) | — | HARD ERROR exit 2 "re-run save-ref.sh" (not a bare MISMATCH) |

The tablet row is the load-bearing one: before the sidecar it captured at the
768 md breakpoint and dimension-mismatched the 820 frame on every template
export; it now captures at the recorded 820 frame width and diffs 1:1.

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
