# Image-diff metric decision spike

## Golden frame

The golden frame is `src/shield/_ref/hero-4-desktop.png` (1440×799). It has a complete `hero-4` desktop/tablet/mobile reference set and is the richest complete desktop candidate: a large natural photograph, multiple font sizes and weights, small icons/checkmarks, a high-contrast CTA, and a testimonial card. This gives the metrics textured imagery, antialiased text edges, flat-color UI, and fine detail in one frame.

The local `src/shield/_ref/` files are read-only inputs and remain gitignored. Generated perturbation PNGs live in `scripts/spike/out/` and are also gitignored.

## Noise model

The former full-frame sigma-1.0 blur was removed from the tolerated NOISE class because browser font rasterization does not blur photos and backgrounds. Both replacement AA cases detect high-contrast edges with a deterministic luminance gradient, expand that mask by two pixels, and blend a Gaussian-softened value only inside the mask. The sigma-0.5 case is localized too: although mild full-frame blur can resemble resampling, localizing it makes the tolerated class specifically model glyph/vector coverage variation rather than camera/content softness.

## Dimension strategy

Dimension equality is reported independently for every comparison as `dimensionsMatch` plus signed width/height deltas. For pixel scoring, both images are top-left anchored and padded to the union canvas with opaque white; no candidate pixels are cropped. Thus excess candidate content contributes to image metrics, while even an all-white extra strip still fails the explicit dimension signal. Image decode and normalization time is excluded from per-metric runtime; each runtime measures only the metric call.

## Results

Pixelmatch values are mismatched-pixel ratios (lower is more similar). SSIM is mean structural similarity (higher is more similar). Dimension deltas are candidate minus golden. Runtimes are wall-clock milliseconds from one offline run and are comparative, not benchmarks. Raw precision is in `RESULTS.json`.

| Class | Perturbation | Dimensions match? | Pixelmatch 0.1 | ms | Pixelmatch 0.3 | ms | Mean SSIM | ms |
| --- | --- | :---: | ---: | ---: | ---: | ---: | ---: | ---: |
| CONTROL | Golden vs itself | Yes | 0.000000 | 2.94 | 0.000000 | 0.52 | 1.000000 | 82.90 |
| NOISE | 1px horizontal translate | Yes | 0.013167 | 12.30 | 0.006805 | 7.32 | 0.970495 | 66.00 |
| NOISE | Localized text/vector-edge AA (mild) | Yes | 0.001235 | 2.18 | 0.000000 | 1.99 | 0.999720 | 50.18 |
| NOISE | Localized text/vector-edge AA (strong) | Yes | 0.017858 | 4.16 | 0.000000 | 2.01 | 0.998492 | 58.76 |
| NOISE | Global brightness +2% | Yes | 0.000000 | 3.66 | 0.000000 | 3.67 | 0.996597 | 48.31 |
| DEFECT | 200px band shifted down 24px | Yes | 0.061479 | 10.19 | 0.036746 | 5.66 | 0.794460 | 51.89 |
| DEFECT | Button-sized region removed | Yes | 0.022865 | 2.55 | 0.022847 | 2.35 | 0.973823 | 46.40 |
| DEFECT | Whole image hue +30deg | Yes | 0.154170 | 24.29 | 0.000000 | 3.30 | 0.998322 | 51.27 |
| DEFECT | Extra 100px right-side canvas strip | No (+100×+0) | 0.064935 | 3.21 | 0.000000 | 1.69 | 0.985589 | 49.48 |
| DEFECT | Text area scaled to 115% | Yes | 0.029285 | 4.56 | 0.027474 | 4.03 | 0.839757 | 53.40 |

## Separability

For Pixelmatch, the NOISE boundary is the highest mismatch ratio and the DEFECT boundary is the lowest mismatch ratio. For SSIM, the NOISE boundary is the lowest similarity and the DEFECT boundary is the highest similarity. A positive gap means a single threshold cleanly separates all 4 NOISE cases from all 5 DEFECT cases. The dimension boolean is not numerically combined with these scores; the union-canvas pixels from the dimension-defect case are still part of the scalar corpus.

| Metric | Worst NOISE | Best DEFECT | Gap | Separates? | Candidate threshold |
| --- | ---: | ---: | ---: | :---: | --- |
| Pixelmatch 0.1 | text-edge-aa-strong: 0.017858 | missing-button: 0.022865 | 0.005006 | Yes | 0.020361 (fail at or above) |
| Pixelmatch 0.3 | translate-x-1px: 0.006805 | hue-rotate-30deg: 0.000000 | -0.006805 | No | none |
| SSIM | translate-x-1px: 0.970495 | hue-rotate-30deg: 0.998322 | -0.027827 | No | none |

## Recommendation

The corrected corpus supports **one standalone candidate gate**: **Pixelmatch 0.1 0.020361** (fail at or above). This recommendation is selected generically from every metric whose worst NOISE and best DEFECT boundaries have a positive gap; it does not privilege SSIM. Dimension equality must remain a separate first-class gate because even white excess canvas can be invisible to pixel metrics after padding. Thresholds remain provisional until Phase 2 validates them against real browser captures.
