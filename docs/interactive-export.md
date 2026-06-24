# Interactive section export (REST)

Landing sections used to export as a flat responsive image wrapped in a
whole-section link. That made the whole section clickable, turned FAQ blocks
into static pictures, and dropped any copy authored in Figma. `export-section.js`
replaces that with two interactive, faithful output shapes — and reaches Figma
over the **REST API**, so an export no longer depends on the MCP plugin staying
connected mid-run.

## What it produces

| Section type | Output |
| ------------ | ------ |
| `hotspot` (default) | Responsive `<picture>` + a transparent `<a>` positioned over **only the CTA button**, one hotspot per breakpoint. |
| `accordion` (FAQ) | A native `<details>`/`<summary>` accordion built from the Q&A content — no JavaScript. |

Type is inferred from the section name (`faq*` / `accordion*` → accordion);
override with `--type hotspot|accordion`.

## Usage

```bash
node scripts/export-section.js --slug <slug> --section <name> \
     --desktop <url|id> [--tablet <url|id>] [--mobile <url|id>] [options]

# or via npm
npm run extract -- --slug <slug> --section hero-1 \
     --desktop "https://www.figma.com/design/KEY/Name?node-id=143-10518" \
     --tablet  "...node-id=143-10610" \
     --mobile  "...node-id=143-12936"
```

Requires `FIGMA_ACCESS_TOKEN` in `.env`. The file key is read from any pasted
Figma URL, `--file-key`, or `FIGMA_FILE_KEY`.

### Key options

- `--type auto|hotspot|accordion` — force the output shape.
- `--scale N` — render scale for the image slices (default `2`).
- `--button-name "Link → Button"` — override CTA button layer matching.
- `--href "<liquid>"` — CTA href expression (default `<prefix>_cta_url | campaign_link`).
- `--nodes-json PATH` — run **offline** from a saved `/v1/files/:key/nodes`
  response or a `{ desktop: <doc>, tablet: <doc>, … }` map. Useful when the MCP
  plugin already fetched the tree, or for testing without a token.
- `--dry-run` — compute hotspots and markup without rendering/downloading images.
- `--force` — overwrite an existing partial.
- `--print` — also print the generated partial to stdout.

## Button hotspots

For each breakpoint frame the tool finds the CTA button node (a layer named like
`Link → Button`, `Button`, `CTA`, or `btn`), reads its `absoluteBoundingBox`,
and converts it to percentages relative to the section frame box:

```
left%   = (btn.x - frame.x) / frame.w
top%    = (btn.y - frame.y) / frame.h
width%  =  btn.w           / frame.w
height% =  btn.h           / frame.h
```

Each hotspot is a transparent `<a>` absolutely positioned inside the
`data-hotspot-root` wrapper. Per-breakpoint visibility uses Tailwind `md:`
(768px) and `lg:` (1024px) — the same breakpoints the `<picture>` sources use —
so the right hotspot lines up with the right image slice. If no button node is
found, the picture still exports and a TODO comment marks where to add the link.

Override matching with `--button-name` when the layer is named unusually.

## Accordions

FAQ/accordion sections export as native `<details>` rows. The extractor finds
the accordion list (the container whose children are repeated text rows), takes
the first text node in each row as the question and the rest as the answer, and
falls back to a Dev Mode annotation for the answer when there is no visible
answer layer (see [figma-annotations.md](figma-annotations.md)). Questions and
answers are emitted as namespaced Liquid variables (`faq_1_q_1`, `faq_1_a_1`, …)
and the copy is printed as a frontmatter block to paste into `landing.html`.

## REST extraction fallback

Everything here uses `scripts/lib/figma-rest.js`, a dependency-free token-based
client for:

- `GET /v1/files/:key/nodes` — structure + geometry (`absoluteBoundingBox`)
- `GET /v1/images/:key` — rendered PNG/SVG/JPG slices
- `GET /v1/files/:key/comments` — used by the annotation probe

It retries on `429`/`5xx` and follows redirects on downloads. Because it does
not depend on MCP, an export can complete even if the MCP plugin disconnects.
The existing `save-ref.sh` / `export-node.sh` shells still cover reference
screenshots and single-asset renders; this client adds the structured node read
and the hotspot/accordion pipeline on top.

## Output contract

- Partial: `src/<slug>/_includes/landing/<section>.html`
- Image slices: `src/<slug>/assets/images/<section>/<section>-<breakpoint>.png`
- Asset and link references use the kit filters `campaign_asset` / `campaign_link`.
- Copy lives in `landing.html` frontmatter (printed by the command), namespaced
  by section.
