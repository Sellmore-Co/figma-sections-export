# Image-diff metric decision spike

## Golden frame

The golden frame is `src/shield/_ref/hero-4-desktop.png` (1440×799). It has a complete `hero-4` desktop/tablet/mobile reference set and is the richest complete desktop candidate: a large natural photograph, multiple font sizes and weights, small icons/checkmarks, a high-contrast CTA, and a testimonial card. This gives the metrics textured imagery, antialiased text edges, flat-color UI, and fine detail in one frame.

The local `src/shield/_ref/` files are read-only inputs and remain gitignored. Generated perturbation PNGs live in `scripts/spike/out/` and are also gitignored.

## Dimension strategy

Before scoring, both images are normalized to the golden canvas. They are anchored at the top-left (matching page screenshots), excess pixels are cropped from the right/bottom, and missing pixels are padded on the right/bottom with opaque white. The generated spike variants already match the golden dimensions, but this makes the scorer safe for future unequal inputs. Image decode and normalization time is excluded from per-metric runtime; each runtime measures only the metric call.

## Results

Pixelmatch values are mismatched-pixel ratios (lower is more similar). SSIM is mean structural similarity (higher is more similar). Runtimes are wall-clock milliseconds from one offline run and are comparative, not benchmarks. Raw precision is in `RESULTS.json`.

| Class | Perturbation | Pixelmatch 0.1 | ms | Pixelmatch 0.3 | ms | Mean SSIM | ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| CONTROL | Golden vs itself | 0.000000 | 3.08 | 0.000000 | 0.83 | 1.000000 | 79.87 |
| NOISE | 1px horizontal translate | 0.013167 | 12.52 | 0.006805 | 7.58 | 0.970495 | 66.93 |
| NOISE | Gaussian blur sigma 0.5 | 0.007490 | 5.37 | 0.000000 | 4.29 | 0.998732 | 49.09 |
| NOISE | Gaussian blur sigma 1.0 | 0.042322 | 9.64 | 0.006768 | 5.50 | 0.991181 | 55.24 |
| NOISE | Global brightness +2% | 0.000000 | 3.78 | 0.000000 | 3.67 | 0.996597 | 47.81 |
| DEFECT | 200px band shifted down 24px | 0.061479 | 10.13 | 0.036746 | 5.64 | 0.794460 | 49.67 |
| DEFECT | Button-sized region removed | 0.022865 | 2.34 | 0.022847 | 2.35 | 0.973823 | 47.83 |
| DEFECT | Whole image hue +30deg | 0.154170 | 24.21 | 0.000000 | 3.30 | 0.998322 | 52.33 |
| DEFECT | Text area scaled to 115% | 0.029285 | 4.63 | 0.027474 | 4.01 | 0.839757 | 51.52 |

## Separability

For Pixelmatch, the NOISE boundary is the highest mismatch ratio and the DEFECT boundary is the lowest mismatch ratio. For SSIM, the NOISE boundary is the lowest similarity and the DEFECT boundary is the highest similarity. A positive gap means a single threshold cleanly separates all four cases in each class.

| Metric | Worst NOISE | Best DEFECT | Gap | Separates? | Candidate threshold |
| --- | ---: | ---: | ---: | :---: | --- |
| Pixelmatch 0.1 | blur-sigma-1.0: 0.042322 | missing-button: 0.022865 | -0.019457 | No | none |
| Pixelmatch 0.3 | translate-x-1px: 0.006805 | hue-rotate-30deg: 0.000000 | -0.006805 | No | none |
| SSIM | translate-x-1px: 0.970495 | hue-rotate-30deg: 0.998322 | -0.027827 | No | none |

## Recommendation

Ratify **neither metric as a standalone pass/fail gate** from this spike. Pixelmatch 0.1 confuses tolerated blur with the missing-button defect, Pixelmatch 0.3 misses the hue defect entirely, and luminance-oriented SSIM rates the hue defect as more similar than the tolerated 1px translation. If Phase 2 must proceed before another metric spike, carry **SSIM as structural telemetry plus Pixelmatch 0.1 as a diagnostic heatmap/localizer**, with no automated pass/fail threshold. A production gate needs either a validated compound rule with an explicitly color-sensitive term or a broader real-capture corpus that changes the class boundary; deriving a two-dimensional rule from this single frame would be overfitting.
