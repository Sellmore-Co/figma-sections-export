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
| CONTROL | Golden vs itself | Yes | 0.000000 | 3.41 | 0.000000 | 0.54 | 1.000000 | 94.24 |
| NOISE | 1px horizontal translate | Yes | 0.013167 | 13.25 | 0.006805 | 8.03 | 0.970495 | 68.28 |
| NOISE | Localized text/vector-edge AA (mild) | Yes | 0.001235 | 2.25 | 0.000000 | 2.30 | 0.999720 | 55.13 |
| NOISE | Localized text/vector-edge AA (strong) | Yes | 0.017858 | 4.75 | 0.000000 | 2.03 | 0.998492 | 55.93 |
| NOISE | Global brightness +2% | Yes | 0.000000 | 3.76 | 0.000000 | 3.83 | 0.996597 | 56.16 |
| DEFECT | 200px band shifted down 24px | Yes | 0.061479 | 11.11 | 0.036746 | 6.42 | 0.794460 | 62.17 |
| DEFECT | Button-sized region removed | Yes | 0.022865 | 2.70 | 0.022847 | 2.64 | 0.973823 | 59.77 |
| DEFECT | Whole image hue +30deg | Yes | 0.154170 | 24.75 | 0.000000 | 3.36 | 0.998322 | 51.41 |
| DEFECT | Extra 100px right-side canvas strip | No (+100×+0) | 0.064935 | 3.29 | 0.000000 | 1.72 | 0.985589 | 60.16 |
| DEFECT | Text area scaled to 115% | Yes | 0.029285 | 4.64 | 0.027474 | 4.06 | 0.839757 | 51.42 |

## Separability

For Pixelmatch, the NOISE boundary is the highest mismatch ratio and the DEFECT boundary is the lowest mismatch ratio. For SSIM, the NOISE boundary is the lowest similarity and the DEFECT boundary is the highest similarity. A positive gap means a single threshold cleanly separates all 4 NOISE cases from all 5 DEFECT cases. The dimension boolean is not numerically combined with these scores; the union-canvas pixels from the dimension-defect case are still part of the scalar corpus.

| Metric | Worst NOISE | Best DEFECT | Gap | Separates? | Candidate threshold |
| --- | ---: | ---: | ---: | :---: | --- |
| Pixelmatch 0.1 | text-edge-aa-strong: 0.017858 | missing-button: 0.022865 | 0.005006 | Yes | 0.020361 (fail at or above) |
| Pixelmatch 0.3 | translate-x-1px: 0.006805 | hue-rotate-30deg: 0.000000 | -0.006805 | No | none |
| SSIM | translate-x-1px: 0.970495 | hue-rotate-30deg: 0.998322 | -0.027827 | No | none |

## Sensitivity

The synthetic edge-AA noise model has a free `strength` parameter, and the separability verdict depends on it: at strength 0.45 the strong AA case scores 0.017858 on Pixelmatch 0.1, but at 0.55 it scores 0.024704 — above the missing-button defect's 0.022865 — which eliminates separability. The luminance-gradient mask also cannot distinguish glyph edges from CSS boxes, icons, or photographic detail. This is why the midpoint above is labeled a synthetic-corpus artifact: the nomination of Pixelmatch 0.1 is supported (it is the only metric that separates any reasonable parameterization while the other two fail structurally), but the numeric threshold is not. Calibrate the production threshold from the empirical noise floor of real captures, and set it between that floor and the smallest defect the harness must catch.

## Recommendation

This spike supports an ELIMINATE / NOMINATE conclusion, not a threshold. **Pixelmatch 0.3** and **SSIM** are **eliminated**: they fail to separate even this favorable synthetic corpus (SSIM rates the hue defect as more similar than the tolerated 1px translation; Pixelmatch 0.3 scores the hue defect at zero). **Pixelmatch 0.1** (synthetic-corpus midpoint 0.020361 — NOT a production threshold) is **nominated** as the sole candidate metric, selected generically from every metric whose worst NOISE and best DEFECT boundaries have a positive gap. The midpoint above is parameter-dependent (see Sensitivity below) and must not be shipped as a gate; the production threshold must be calibrated from the real noise floor — repeat captures of the golden frame's live render vs the Figma ref — in the harness's threshold-calibration phase. Dimension equality must remain a separate first-class gate because even white excess canvas can be invisible to pixel metrics after padding.
