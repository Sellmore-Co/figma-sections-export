# Figma Dev Mode annotations over REST

Authored copy (for example FAQ answers, alt text, or CTA destinations) can be
attached to nodes as **Dev Mode annotations**. This note records what the REST
API actually returns and how the toolkit uses it.

## TL;DR

- `node.annotations` is part of the REST node schema. It is returned inline by
  `GET /v1/files/:key/nodes?ids=…` **only when** the queried nodes carry Dev
  Mode annotations and the file is on a plan where Dev Mode annotations exist
  (Organization / Enterprise).
- The correct personal-access-token scope is **`file_content:read`** ("read the
  contents of files"). There is **no separate annotation scope** — if a
  file-content read-only token returns an empty `annotations`, the cause is the
  data/plan, not the scope.
- **Comments are a different feature.** `GET /v1/files/:key/comments` returns
  conversation pins and needs `file_comments:read`. Comments are *not* a
  substitute for Dev Mode annotations.
- Treat annotations as **best-effort enrichment**, not a hard dependency. When
  they are absent the export falls back to visible text layers, and authored
  copy can always be supplied directly in page frontmatter.

## Confirming per file + token

```bash
node scripts/figma-annotations.js "<figma-url-with-node-id>"
# or
npm run annotations -- "<figma-url-with-node-id>"
```

The probe queries both `node.annotations` and `/v1/comments` for the current
`FIGMA_ACCESS_TOKEN` and prints whatever comes back, plus a plain-English
finding. Add `--json` for machine-readable output.

## How the export uses annotations

`export-section.js` collects annotations across all fetched breakpoints
(`figma-tree.collectAnnotations`). For **accordion** exports, when a question
row has no visible answer text layer, the extractor uses an annotation on a
node in that row as the answer (`accordion-extract.js`, `source: annotations`).
When nothing is reachable, the `*_a_*` frontmatter values are left empty and a
warning tells you to fill them in.

## Why empty results are expected sometimes

The reported case — a `File content: read-only` token returning empty for both
`node.annotations` and `/v1/comments` — is consistent with: the nodes carrying
no annotations, the file not being on a Dev-Mode-enabled plan, or the
annotations living on different nodes than the section frame queried. None of
these are fixed by changing the token scope. Run the probe to distinguish them.
