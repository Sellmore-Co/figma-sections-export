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
    { "page_id": "landing", "path": "landing.html", "page_type": "landing" },
    { "page_id": "presell", "path": "presell.html", "page_type": "presell" }
  ]
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

Today `page_id` matches the canonical page name (`landing` / `presell`). The field exists separately so future multi-page funnels can map e.g. `page_id: "presell_a"`, `path: "presell-a.html"`.

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

A missing manifest is **not** an error during validate — the manifest is a handoff artifact and validate runs throughout the iteration loop.

## Versioning

When the schema needs to break, bump to `source-html-manifest/v1` and update the validator to accept both versions during a deprecation window. campaigns-os consumers should refuse unknown versions rather than guess.
