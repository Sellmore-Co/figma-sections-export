# Source HTML Manifest

The source-html manifest is the contract between `figma-sections-export` and the downstream `campaigns-os` Build Packet. It is emitted at developer handoff and tells a build agent exactly which page-kit pages a campaign export produced — so the Build Packet's `source_html.pages[]` block can be populated without re-scanning the filesystem or hand-authoring the packet.

This is **Slice 1** of the figma-sections-export → campaigns-os agentic pipeline. It is intentionally minimal: just enough to remove the manual packet-authoring step for landing/presell pages. Spec hydration, CTA repointing, and full orchestration are later slices.

## Location

```
src/<slug>/.campaigns-os/source-html-manifest.json
```

Sits inside the campaign export folder so the manifest travels with the export when it is copied or moved into a target page-kit repo. The `.campaigns-os/` directory is reserved for handoff artifacts consumed by campaigns-os.

## When it is written

`npm run handoff -- <slug>` writes the manifest as its final step, after validate + compare + compress. The standalone command `npm run manifest -- <slug>` writes it without the rest of the handoff motion (useful for testing or repairing a manifest after a manual edit).

The manifest is **not** written during normal section iteration. It is a final-handoff artifact, not a continuously-maintained file.

## Schema

`schema_version: "source-html-manifest/v0"`

```json
{
  "schema_version": "source-html-manifest/v0",
  "generated_at": "2026-05-23T06:45:04.170Z",
  "generator": "figma-sections-export@1.0.0",
  "campaign_slug": "novaburn-presale",
  "root": ".",
  "pages": [
    {
      "page_id": "landing", "path": "landing.html", "page_type": "landing", "page_url": "", "source_hash": "…",
      "screenshot_source": "stitched_figma_section_renders",
      "stitched_sections": ["hero-1", "benefits-2", "faq-1"],
      "screenshots": [
        { "id": "source-landing-desktop", "kind": "source_screenshot", "viewport": "desktop", "availability": "available",
          "path": "_ref/pages/landing-desktop.png", "sha256": "…", "width": 1440, "height": 5120,
          "captured_at": "2026-09-08T09:12:44.000Z",
          "notes": "Stitched from Figma node renders of 3 section(s) in landing.html order: hero-1, benefits-2, faq-1 (stitched_figma_section_renders); not a browser capture." },
        { "id": "source-landing-tablet", "kind": "unavailable_render", "viewport": "tablet", "availability": "unavailable",
          "unavailable_reason": "no tablet render for section(s) faq-1: run save-ref.sh for them, then re-run handoff" },
        { "id": "source-landing-mobile", "kind": "source_screenshot", "viewport": "mobile", "availability": "available",
          "path": "_ref/pages/landing-mobile.png", "sha256": "…", "width": 375, "height": 9800, "captured_at": "…", "notes": "…" }
      ]
    },
    { "page_id": "presell", "path": "presell.html", "page_type": "presell", "page_url": "presell", "source_hash": "…", "screenshots": [ "…" ] }
  ],
  "producer_provenance": { "source_type": "semantic_figma_export", "…": "…" },
  "files": [ { "path": "_includes/landing/hero-1.html", "role": "partial", "sha256": "…", "bytes": 2210 } ]
}
```

### Fields

| Field | Type | Description |
| ----- | ---- | ----------- |
| `schema_version` | string (const) | Always `source-html-manifest/v0` for this version. Consumers MUST verify this before reading other fields. |
| `generated_at` | ISO-8601 string | When the manifest was last written. |
| `generator` | string | `<tool>@<version>` of the tool that wrote the manifest. Lets downstream consumers diagnose version skew. |
| `campaign_slug` | string | The campaign slug used inside figma-sections-export. May differ from the target page-kit `campaign_directory` or `public_route_slug` — campaigns-os reconciles. |
| `root` | string | Self-reference, relative to the manifest's own location. Always `.` today. Reserved for future cases where the manifest points at sibling folders. |
| `pages` | array | Page-kit pages produced by this export. See below. |

### `pages[]` entries

| Field | Type | Description |
| ----- | ---- | ----------- |
| `page_id` | string | Stable identifier matching the Build Packet `source_html.pages[].page_id`. Currently `landing` or `presell`. |
| `path` | string | Filename relative to the manifest's `root`. Currently `landing.html` or `presell.html`. |
| `page_type` | string | One of `landing`, `presell`. Used by campaigns-os to pick the right passthrough layout. |
| `page_url` | string | Page-kit route for the page: `""` for `landing.html`, `presell` for `presell.html`. |
| `source_hash` | sha256 hex | Hash of the page file at handoff time. |
| `screenshot_source` | string | How `screenshots[]` was produced: `stitched_figma_section_renders` (landing pages assembled from section includes) or `figma_page_render` (a page exported whole, such as a presell). |
| `stitched_sections` | string[] | The sections stitched, in `campaign_include` order. Empty for `figma_page_render`. |
| `screenshots` | array | Source screenshot proof for the campaigns-os design-source gate. See below. |

### `page_id` must be the CampaignSpec page id

`page_id` defaults to the filename (`landing`, `presell`). campaigns-os attaches `screenshots[]` to a page **only when this value equals the CampaignSpec page id**. When the spec uses generated ids (`page_most7ygt_415`), the page still maps through the `page_type` + ordinal fallback, but its screenshots are silently discarded and the mapping's confidence pins at `medium`, so the 1.20 gate blocks a page that has proof.

Pass the spec id at handoff, one per page:

```bash
npm run handoff -- <slug> --page-id landing=page_most7ygt_415 --page-id presell=page_most7ygt_414
npm run manifest -- <slug> --page-id landing=page_most7ygt_415
```

Both commands print a `WARNING:` line for every page that falls back to the default id.

### `pages[].screenshots[]`

campaigns-os 1.20 added a second intake gate: every renderable primary-design page needs an **available desktop and mobile** source screenshot, or `prepare-build` stops at `DESIGN_SOURCE_PACKAGE_NOT_READY` and nothing downstream runs. There is no waiver channel in v0.

The exporter fills this from material it already has. `save-ref.sh` downloads one Figma render per section and breakpoint into `_ref/<section>-<viewport>.png`. At handoff, the manifest writer stitches those renders top to bottom, in the order `landing.html` includes the sections, into `_ref/pages/<page>-<viewport>.png`, and records one entry per viewport (`desktop`, `tablet`, `mobile`). The stitch is deterministic (pure PNG concatenation, no browser), so the same refs always yield the same bytes and hash.

Why stitch instead of rendering a Figma page frame: designers delete the Demo page from every merchant duplicate of the Debranded Sections library, so a real merchant file has no page-level frame to render. The per-section renders are the only Figma-side picture of the page that always exists.

A page with no landing section includes (a presell, exported whole) uses `_ref/<page>-<viewport>.png` directly, e.g. `_ref/presell-desktop.png`.

Each entry follows the campaigns-os `sourceScreenshot` record (`schemas/source-html-manifest.v0.schema.json` in campaigns-os):

| Field | Available entry | Unavailable entry |
| ----- | --------------- | ----------------- |
| `id` | `source-<page>-<viewport>` | same |
| `kind` | `source_screenshot` | `unavailable_render` |
| `viewport` | `desktop` / `tablet` / `mobile` | same |
| `availability` | `available` | `unavailable` |
| `path` | relative to the campaign folder, e.g. `_ref/pages/landing-desktop.png` | — |
| `sha256`, `width`, `height` | of the PNG on disk | — |
| `captured_at` | newest mtime of the section renders that went into it | — |
| `notes` | which sections were stitched, and that it is **not a browser capture** | — |
| `unavailable_reason` | — | which section renders are missing, or why the stitch was refused |

A missing viewport is written as an `unavailable_render` entry, never omitted, so the consumer can tell "not captured" from "not linked". Tablet is optional in the gate; desktop and mobile are required.

campaigns-os records the `path` and never opens or copies the file: the Design Source Package points back at the source root, and the polish gate only checks the string is non-empty. A handoff shipped without `_ref/pages/` is therefore a dangling path nothing notices today. Keep `_ref/` with the export until a consumer starts reading the file.

`browser` and `device_profile` are deliberately left empty. campaigns-os describes a source screenshot as a browser render of a standalone HTML document; a stitched Figma render serves the same purpose (a picture of the design the build must preserve) but is not that, and `notes` says so, so the consumer's trust field stays honest.

The stitch is refused, with the reason recorded, when the section refs for a viewport have different widths. A page with a jagged edge is not a picture of the design; re-export the odd section at the same frame width.

## How campaigns-os consumes it

`campaigns-os prepare-build` (Slice 1 consumer, not yet wired) reads the manifest when:

- the Build Packet's `source_html.root` points at a figma-sections-export campaign folder, AND
- `<root>/.campaigns-os/source-html-manifest.json` exists.

It uses the manifest to populate `source_html.pages[]` automatically. Manual `source_html.pages[]` entries in the packet take precedence over the manifest — the manifest is a default, not an override.

If the manifest is absent, behavior is unchanged from today: campaigns-os falls back to the operator-authored `source_html.pages[]` block, and doctor returns `collect-inputs` if no pages are declared.

## Validation

`npm run validate -- <slug>` checks the manifest when present:

- `schema_version` must match the current version.
- Every `pages[].path` must exist on disk.
- Every `landing.html` / `presell.html` on disk should be listed in `pages[]` (warning if not — partial campaigns are valid, but unintended drift should surface).
- Duplicate `page_id` entries are an error.
- When `producer_provenance` is present for Campaigns OS semantic handoff, `source_type` must be `semantic_figma_export`, `screenshot_fallback_used` must be `false`, and `section_exports[]` must not contain explicit `hotspot` image-slice exports. Hotspots are an escape hatch for image-only strips, not semantic source material.
- When `producer_provenance` is present, every page must carry `screenshots[]` with an **available** `desktop` and `mobile` entry whose file exists, whose sha256 matches, and whose recorded width and height match the PNG. A missing or unavailable entry is an error that quotes the recorded `unavailable_reason`, so a local PASS predicts a campaigns-os intake pass. A desktop width other than 1440px, or a mobile width other than 375px or 390px, is a warning, not an error: the gate does not check width, and the refs on disk are not all 1x. `save-ref.sh` rendered at `scale=1.5` until commit 2c56453 (July 2026), so every ref set saved before then is 2160 / 563 px wide and a strict rule would fail all of them. Mixed 1x and 1.5x refs on one page are still refused at stitch time with the widths named.

A missing manifest is **not** an error during validate — the manifest is a handoff artifact and validate runs throughout the iteration loop.

## `mixed_figma_export`

`producer_provenance.source_type` is `mixed_figma_export` whenever the export log holds a `hotspot` entry, and campaigns-os accepts only `semantic_figma_export`. That is the gate working as designed: a hotspot is an image slice with baked text, not semantic source material. The remedy is to re-export the hotspot section through the semantic path (the default `get_design_context` flow, or `npm run extract` with `--type accordion` for FAQ-style sections), remove its `hotspot` entry from `.campaigns-os/source-export-log.json`, and re-run handoff.

Do not edit `source_type` in the manifest by hand: handoff rewrites the whole file from the export log and the files on disk, and `npm run validate` checks the recorded values against that log, so a hand edit is either overwritten or flagged.

## Versioning

When the schema needs to break, bump to `source-html-manifest/v1` and update the validator to accept both versions during a deprecation window. campaigns-os consumers should refuse unknown versions rather than guess.
