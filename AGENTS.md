# Figma Design Framework — Export Tool

This repo builds an export script that reads a Figma file via the REST API and generates production-ready HTML/Liquid partials for the `next-campaign-page-kit` framework.

**Figma file:** [https://www.figma.com/design/ia7650Y3lLte4WVYARNvSX/Debranded-Sections](https://www.figma.com/design/ia7650Y3lLte4WVYARNvSX/Debranded-Sections)

**Reference implementation:** [campaign-cart-starter-templates `src/landing`](https://github.com/NextCommerceCo/campaign-cart-starter-templates/tree/main/src/landing) — canonical external example of exported section partials, asset structure, JS conventions, and page composition.

**Before generating HTML for an export:** in the external reference, [campaign-cart-starter-templates `src/landing`](https://github.com/NextCommerceCo/campaign-cart-starter-templates/tree/main/src/landing), open **`_includes/`** ([browse on GitHub](https://github.com/NextCommerceCo/campaign-cart-starter-templates/tree/main/src/landing/_includes)) and skim at least one partial that matches the section type you are exporting (e.g. hero → `hero-*.html`, FAQ → `faq-*.html`). Copy **patterns**, not marketing copy: outer `section` vs inner wrapper, `max-w-*` + `mx-auto`, horizontal padding, how images are constrained and positioned (`object-*`, flex vs absolute columns), card/list structure, and how **radius, borders, and shadows** are written (see **Visual fidelity**). *This path is in the reference repo — not necessarily the same as your local preview campaign folder.* If an older partial disagrees with the rest of this document on tokens or naming, **this document (`AGENTS.md`) wins**.

## Hard Intake Gate

If the user pastes three Figma links but does not provide both a campaign slug and an export type, **do not fetch Figma yet**. Ask this exact short question first:

```text
What campaign slug should I export into, and is this a landing section or a presell page?
```

Once the user answers, infer the section/page name from the Figma frame name. For example, `problemsolution2-desktop` exports as `problemsolution-2`. Ask for a section/page name only if Figma metadata is unavailable or the frame name does not follow `{category}{number}-{breakpoint}`.

## Compression Gate

Do **not** run `npm run compress`, `npm run compress:preview`, `npx campaign-compress`, or `campaign-compress` during initial extraction or visual polish. Compression is final-handoff only. When compression is requested, use this repo's scoped command:

```bash
npm run compress -- <slug>
```

It only scans `src/<slug>/assets/images/`; it must not touch `_ref/` screenshots or other campaign folders.

---

## Getting Started

### Prerequisites

- **Node.js** 18+ — [nodejs.org](https://nodejs.org)
- **Codex** CLI — [Codex.ai/code](https://Codex.ai/code)
- **Figma MCP plugin** enabled in Codex (see below)

---

### 1. Clone this repo and install

```bash
git clone <this-repo>
cd figma-templates-export
npm install
```

`npm install` pulls `next-campaign-page-kit` from npm and makes the `campaign-dev`, `campaign-build` etc. commands available.

---

### 2. Enable the Figma MCP plugin in Codex

The Figma MCP server gives Codex direct read access to your Figma files — no manual copy-paste of node data needed.

**In Codex, open settings:**

```bash
Codex mcp add
```

Select **Figma** from the plugin list, or add it manually to your Codex MCP config (`~/.Codex/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "figma-mcp"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "your-figma-personal-access-token"
      }
    }
  }
}
```

Get your Figma personal access token: Figma → Account Settings → Personal Access Tokens → Generate. Scopes needed: Files → **Read the contents of and render images from files** + Files → **Read metadata of files**.

Restart Codex after adding the plugin. You'll know it's working when Codex can call `get_design_context` and return screenshots directly from a Figma URL.

**Connection fallback (if local MCP is unstable):**

If the local Figma MCP plugin has intermittent connection or auth issues, add Figma's remote MCP endpoint as a backup transport:

```bash
Codex mcp add --transport http figma-remote-mcp https://mcp.figma.com/mcp
```

**Default recommendation:** keep the local Figma MCP plugin as primary, and use `figma-remote-mcp` as a fallback when local transport is flaky in a session.

After adding the fallback:
- Restart Codex/Cursor session
- Re-run a simple Figma read call (`get_design_context`) on a known node
- Complete auth flow if prompted

---

### 3. Get the Figma links for a responsive section

Every exported section has 3 variant frames in Figma: desktop, tablet, and mobile.

**In Figma:** click a frame on the canvas, then press **Cmd+L** (Mac) or **Ctrl+L** (Windows), or right-click → **Copy link to selection**. This copies a URL with the node ID already embedded:

```
https://www.figma.com/design/ia7650Y3lLte4WVYARNvSX/Debranded-Sections?node-id=143-10518
```

Repeat for the tablet and mobile variant frames. You'll have 3 URLs total.

---

### 4. Run your first export

Paste all 3 Figma links into Codex in a single message:

```
Export this section:
https://www.figma.com/design/{fileKey}/...?node-id=143-10518
https://www.figma.com/design/{fileKey}/...?node-id=143-10610
https://www.figma.com/design/{fileKey}/...?node-id=143-12936
```

Codex will fetch all 3 breakpoints in parallel, then generate the Liquid partial following the process defined in `## Section Export Process` below.

---

### 5. Preview the output

```bash
npm run dev
```

Select your campaign from the list → opens the configured `entry_url`, usually `http://localhost:3000/{campaign-slug}/landing/` or `/presell/`, with live reload.

---

### Available commands

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start the dev server with live reload |
| `npm run build` | Production build |
| `npm run compare <slug> [ref-prefix] [port]` | Open side-by-side Figma vs live compare page |
| `npm run validate -- <slug>` | Validate local export output against the public starter-template patterns |
| `npm run handoff -- <slug> [ref-prefix]` | Run final developer handoff checks: validate, compare when refs are available, compress final images, and write the campaigns-os source-html manifest |
| `npm run manifest -- <slug>` | Write the campaigns-os source-html manifest standalone (see [docs/source-html-manifest.md](docs/source-html-manifest.md)) |
| `npm run new <slug> <section>` | Scaffold a landing section preview |
| `npm run new <slug> presell "Display Name" presell-page` | Scaffold a standalone presell page |
| `npm run compress <slug>` | Optimise all images in `src/<slug>/assets/images/` — run after downloading Figma assets and before final handoff |
| `npm run extract -- --slug <slug> --section <name> --desktop <url> [--tablet <url>] [--mobile <url>]` | REST-based interactive export: responsive `<picture>` + per-breakpoint CTA hotspots, or a native `<details>` accordion for FAQ sections (see [docs/interactive-export.md](docs/interactive-export.md)) |
| `npm run annotations -- <figma-url>` | Probe whether Dev Mode annotations / comments are reachable for the current token (see [docs/figma-annotations.md](docs/figma-annotations.md)) |

**`npm run compress`** runs lossless/lossy compression on JPG, PNG, and WebP assets in-place. Run it once per section after all images are downloaded. Do not run it repeatedly on already-compressed files.

**`npm run extract`** is the token-based REST extraction path — a fallback for the Figma MCP plugin, which can disconnect mid-run. It emits interactive output instead of a flat image wrapped in a whole-section link: a responsive `<picture>` with a transparent `<a>` positioned over **only the CTA button** per breakpoint (geometry read from each frame's `absoluteBoundingBox`), or a native `<details>` accordion built from FAQ Q&A. Copy is printed as a frontmatter block to paste into `landing.html`. See [docs/interactive-export.md](docs/interactive-export.md); for authored copy in Dev Mode annotations see [docs/figma-annotations.md](docs/figma-annotations.md).

**Shared landing behavior:** new landing campaigns copy `assets/js/landing.js` from `templates/landing/assets/js/landing.js`. Update that template when the reference behavior changes; do not generate one-off per-section accordion or Swiper scripts. The included `data-countdown` helper is a landing-only fallback; promo/checkout timers should follow the campaign-cart/web-component timer pattern from the checkout templates.

**Figma asset command inputs:** `scripts/export-node.sh` and `scripts/save-ref.sh` accept full Figma selection URLs and parse file keys/node IDs. Prefer pasted Figma URLs for designers and teammates working across files; use `FIGMA_FILE_KEY` only as a fallback for raw node IDs.

### Designer intake rule

If a designer pastes exactly three Figma links with no slug or export type, infer the section/page name from the Figma frame name first. Use the desktop frame when possible. Frame names follow `{category}{number}-{breakpoint}` and export as `{category}-{number}`; for example `problemsolution2-desktop` becomes `problemsolution-2`.

If you need a scriptable check, run:

```bash
npm run intake -- "<designer message>"
npm run infer -- "<Figma selection link>"
```

Ask only for details that cannot be inferred:

```text
Campaign slug:
Type: landing section or presell page?
```

Ask for `Section/page name` only if Figma metadata is unavailable or the frame name does not follow the standard pattern.

Once those are known, complete the export and QA loop in one pass: save reference screenshots, generate the compare page, run validation, and report whether the section/page is ready. Run `npm run handoff -- <slug> [ref-prefix]` only for final developer handoff because it compresses images.

### Post-export prompt

After each successful **landing section** export, do not run handoff automatically. Report the inferred section name, compare page path, and validation status, then ask:

```text
Is this page now complete, or are there more sections to export?
```

If the designer says the page is complete, ask:

```text
Should I prepare the developer handoff now?
```

Only run `npm run handoff -- <slug> [ref-prefix]` after that confirmation.

After a successful **presell page** export, offer final handoff immediately because presells are standalone pages:

```text
Should I prepare the developer handoff now?
```

---

## Intended Workflow

This tool has two export modes:

- **Landing section export:** Figma sections become Liquid partials (`_includes/landing/*.html`) assembled into `landing.html`. The unit of export is one section.
- **Presell page export:** Figma presells become standalone advertorial pages (`presell.html`) using `base-presell.html`, `images/presell/`, and the presell article/offer structure from `campaign-cart-starter-templates`.

For landing pages, exporting section by section produces better results than attempting a full page in one pass. For presells, export the whole advertorial page and preserve the reference presell flow.

**Production page workflow:**

1. Dev has a Figma landing page or presell page built from the unbranded templates
2. Identifies the sections on the page (e.g. hero, features, FAQ, footer)
3. Exports each section one at a time as `_includes/landing/{section}.html`
4. `landing.html` assembles them via `campaign_include` tags — the handoff can be copied into a developer's active campaign with minimal path changes

What matters is consistent scoping:

- Includes: `_includes/landing/{section-name}.html`
- Images: `images/{section-name}/{filename}`
- JS: all in `assets/js/landing.js`
- Entry page: `_data/campaigns.json` uses `entry_url: "landing.html"` or `entry_url: "presell.html"`; do not create preview-only `index.html` redirect files.

**Presell workflow:** export to `presell.html`, use `page_layout: base-presell.html`, keep article fields in frontmatter (`article_title`, `reason_1_heading`, `cta_heading`, etc.), store assets in `images/presell/`, and link onward with `next_url` + `campaign_link`. Reference example: `campaign-cart-starter-templates/src/demeter/presell.html`.

**Note for Codex:** The current `src/` directory contains one slug per section — this is local testing only, not the intended workflow. Ignore this structure when guiding developers. Always direct developers toward the page-level workflow above.

---

## Core Principle

Every Figma frame, style, and naming convention maps 1:1 to a framework concept. The designer's work IS the developer spec. No interpretation needed.

---

## Target Framework: next-campaign-page-kit

- LiquidJS-based static site generator for e-commerce campaign funnels (presale, checkout, upsell, receipt)
- Three custom template helpers: `campaign_asset`, `campaign_link`, `campaign_include`
- Assets copied as-is (no build step by default) — CSS can be Tailwind CDN, custom, or both
- Sections live in `_includes/` as HTML partials
- Pages use YAML frontmatter for metadata, styles, scripts
- Campaign data from `campaigns.json` → accessible via `{{ campaign.* }}`
- Current public kit source: [NextCommerceCo/campaign-page-kit](https://github.com/NextCommerceCo/campaign-page-kit). Keep exports compatible with current kit behavior, including key-based `_data/campaigns.json`, `entry_url` for campaign entry pages, `next_url` for forward funnel links, and `campaign-init --ai-context codex` for upstream AI context in fresh projects.

---

## Output Mapping


| Figma Concept             | Framework Output               | Location                                    |
| ------------------------- | ------------------------------ | ------------------------------------------- |
| Section Frame             | Liquid partial                 | `_includes/{name}.html`                     |
| Component Property (text) | Liquid variable                | `{{ variable_name }}`                       |
| Color Variable            | CSS custom property            | `var(--brand-primary)`                      |
| Typography Variable       | Responsive Tailwind classes    | `text-[18px] md:text-[20px] lg:text-[28px]` |
| Auto Layout               | Flex/Grid CSS                  | `flex flex-col gap-4`                       |
| Image Fill                | Asset + filter                 | `{{ 'images/x.jpg'                          |
| Page Frame                | Page HTML + frontmatter        | `presale.html`                              |


---

## Naming Conventions (the contract)


| Figma Element      | Convention             | Example                    | Maps To                                |
| ------------------ | ---------------------- | -------------------------- | -------------------------------------- |
| Section frame      | `{category}{number}`   | `hero1`                    | `_includes/hero-1.html`                |
| Text layer content | inferred from context  | `"How Next Commerce Works"` | `{{ section_heading }}`               |
| Contained image    | `img:{filename}`       | `img:hero-product`         | `<img>` + `object-contain`             |
| Background image   | `bg:{filename}`        | `bg:hero-bg`               | CSS `background-image`                 |
| Composed image     | `img-group:{filename}` | `img-group:hero-composite` | `<img>` (group exported as single PNG) |
| Color style        | `brand/{name}`         | `brand/primary`            | `--brand-primary`                      |


---

## Section Frame Requirements


| Requirement                              | Required?   |
| ---------------------------------------- | ----------- |
| Name follows `{category}{number}-{breakpoint}` (e.g. `hero1-desktop`) | Required    |
| Top-level frame (not nested)             | Required    |
| Uses Auto Layout                         | Required    |
| Width: Fill container or fixed 1440px    | Required    |
| `breakpoint` variant (desktop + mobile)  | Recommended |
| Component properties for dynamic content | Required    |

---

## Text Layers → Liquid Variables

Text layers in the Figma file use default naming (layer content or generic IDs). Codex reads the text content directly and infers `snake_case` Liquid variable names from context — e.g. a heading that reads "How Next Commerce Works" becomes `{{ section_heading }}`.

**Copy must be final before export.** Placeholder text ("Lorem ipsum", "Headline goes here") produces meaningless variable names that must be manually fixed after export.

Extract as much Figma content as possible into page frontmatter. Landing partials should contain structure, layout classes, loops/blocks when needed, and Liquid variable references; they should not hardcode visible marketing copy, CTA copy, review text, article headings, alt text, or repeated card content unless the text is genuinely decorative or structural. Namespace section variables by partial name (`hero_1_headline`, `faq_1_question_1`, `reviews_2_quote_3`) and define the values in `landing.html` / `presell.html` frontmatter so developers can edit campaign copy without digging through partial markup.

For repeated Figma content, prefer explicit numbered variables in frontmatter over dynamic variable construction:

```yaml
benefits_1_item_1_heading: "Fast setup"
benefits_1_item_1_body: "Launch the page without rebuilding checkout."
benefits_1_item_2_heading: "Clean handoff"
benefits_1_item_2_body: "Assets and copy are scoped by section."
```

Then reference them directly in the partial:

```liquid
{{ benefits_1_item_1_heading }}
{{ benefits_1_item_1_body }}
```

---

## The Three Essential Filters

`**campaign_asset**` — resolves relative paths to campaign directory:

```liquid
{{ 'images/hero-1/hero-photo.png' | campaign_asset }}  → /campaign-slug/images/hero-1/hero-photo.png
{{ 'css/tokens.css' | campaign_asset }}                → /campaign-slug/css/tokens.css
```

**Images are namespaced by section slug**: `images/{section-slug}/{filename}`. Never place images in a flat `images/` root. Shared assets used across sections go in `images/_shared/`.

`**campaign_link`** — generates clean internal URLs:

```liquid
{{ 'checkout.html' | campaign_link }}  → /campaign-slug/checkout/
{{ '#pricing' | campaign_link }}       → #pricing (anchors pass through)
```

`**campaign_include**` — renders a partial from `_includes/`:

```liquid
{% campaign_include 'hero-banner.html' %}
```

**Sections do not receive inline arguments.** All content variables are defined in the page's YAML frontmatter and read directly by the partial. Namespace variables by section to avoid collisions: `hero_1_headline`, `benefits_1_heading`, etc.

---

## Auto Layout → CSS Mapping


| Figma Auto Layout Property | Tailwind Output     |
| -------------------------- | ------------------- |
| Direction: Horizontal      | `flex flex-row`     |
| Direction: Vertical        | `flex flex-col`     |
| Wrap: Yes                  | `flex-wrap`         |
| Gap: 16px                  | `gap-4`             |
| Padding: 24px all          | `p-6`               |
| Padding: 16px h / 24px v   | `px-4 py-6`         |
| Align items: Center        | `items-center`      |
| Justify: Space between     | `justify-between`   |
| Child: Fill container      | `flex-1`            |
| Max width constraint       | `max-w-7xl mx-auto` |


### Spacing Scale (Tailwind only — multiples of 4px)

```
4px=1, 8px=2, 12px=3, 16px=4, 20px=5, 24px=6, 32px=8,
40px=10, 48px=12, 64px=16, 80px=20, 96px=24
```

### Container Pattern

```html
<section class="section-hero bg-surface-alt py-16 md:py-24">
  <div class="max-w-[1440px] mx-auto w-full px-[15px] md:px-[26px] lg:px-[60px] xl:px-[120px]">
    <!-- content -->
  </div>
</section>
```

Use this 4-step padding scale when the design calls for large desktop side padding (~120px). `lg:px-[120px]` fires at 1024px and leaves only 784px for content — too narrow for wide text or two-column layouts. The bridging `lg:px-[60px]` covers 1024–1279px; `xl:px-[120px]` kicks in at 1280px where there is enough room.

**`--container/spacing-sides-standard`** is a Figma spacing variable used on some section frames for outer horizontal padding (fallback `120px`). Treat it identically to a hard-coded `120px` value — apply the 4-step scale on export: `px-[15px] md:px-[26px] lg:px-[60px] xl:px-[120px]`.

### Mandatory inner max-width

- `<section>` may be full-bleed for backgrounds.
- **All** main content (text, grids, cards, columns) must sit inside a child with **`max-w-[1440px]`** or **`max-w-7xl`** (pick one per project and stay consistent), **`mx-auto`**, and usually **`w-full`**.
- **Anti-pattern:** direct children of `<section>` that are only `flex` / `grid` / `px-*` with **no** `max-w-*` — the layout reads full viewport width on large screens.
- **Exception:** intentional full-bleed strips (e.g. one full-width image band). Typography and UI blocks should still use a max-width wrapper unless the design explicitly breaks that rule.

### Visual fidelity (radius, borders, shadows)

**Source of truth:** Prefer the **same section family** in [campaign-cart-starter-templates](https://github.com/NextCommerceCo/campaign-cart-starter-templates) under **`src/landing/_includes/`** over generic Tailwind guesses. Shipped partials encode how subtle UI is done — e.g. primary CTAs often use **`rounded-[6px]`** with **`bg-[var(--brand-primary)]`**, FAQ-style rows often use **`border-t` / `border-b`** with **`border-[rgba(0,0,0,0.16)]`**, and image columns that clip content use **`overflow-hidden`** on the wrapper plus `object-*` / sizing as in the reference. Use **`rounded-[Npx]`** when Figma specifies a radius and the reference uses arbitrary values — do not default to `rounded-md` / `rounded-lg` unless both Figma and the reference agree.

`get_design_context` often omits strokes, corner radius, or shadows. After comparing breakpoints, check the Figma screenshot for cards, buttons, and dividers — then align classes with **both** Figma and the closest reference partial.

| Figma / MCP signal | What to do |
| ------------------ | ---------- |
| Corner radius on button, card, image | Match reference style; often `rounded-[Npx]` on the element that carries the fill; for clipped images use wrapper `overflow-hidden` + `rounded-*` |
| Hairline dividers, accordion rows | `border-t` / `border-b`; rgba or `var(--border-default)` as in the same-category reference partial |
| Shadow / elevation | Only if Figma and/or the reference partial use it (`shadow-sm` … `shadow-lg` or arbitrary) |
| Opacity | `opacity-*` or rgba borders as in reference |

**Rules:** Apply **`rounded-*`** on the same element that owns background/border in Figma when possible. Prefer **tokens** where the reference does; use **rgba hairlines** where that pattern appears in the reference. If Figma shows rounded UI and the first HTML pass is square, fix it before handoff.

---

## Responsive Variants

Every section has a `breakpoint` variant:


| Variant   | CSS Breakpoint      | Figma Frame Width |
| --------- | ------------------- | ----------------- |
| `mobile`  | Default (no prefix) | 375px             |
| `tablet`  | `md:` (768px+)      | 768px             |
| `desktop` | `lg:` (1024px+)     | 1440px            |


Script compares mobile/desktop variants and generates responsive classes:

- Mobile vertical + desktop horizontal → `flex flex-col lg:flex-row`
- Mobile 1-col + desktop 3-col → `grid grid-cols-1 lg:grid-cols-3`
- Hidden mobile, visible desktop → `hidden lg:block`

---

## Design Tokens

### Colors (Figma Color Variables → CSS custom properties)


| Figma Style Name     | CSS Custom Property |
| -------------------- | ------------------- |
| `brand/primary`      | `--brand-primary`   |
| `brand/secondary`    | `--brand-secondary` |
| `brand/accent`       | `--brand-accent`    |
| `surface/background` | `--surface-bg`      |
| `surface/card`       | `--surface-card`    |
| `surface/alt`        | `--surface-alt`     |
| `text/primary`       | `--text-primary`    |
| `text/secondary`     | `--text-secondary`  |
| `text/inverse`       | `--text-inverse`    |
| `border/default`     | `--border-default`  |
| `state/success`      | `--success`         |
| `state/warning`      | `--warning`         |
| `state/error`        | `--error`           |


### Typography (Figma Variables — not Text Styles)

Figma Text Styles are **not used** in this file. Font sizes come from **Figma Variables** (`--font/size-`*). The variable name is consistent across breakpoints, but the fallback px value in each node reveals the responsive size for that breakpoint.

**How `get_design_context` surfaces this:**

```
text-[length:var(--font/size-heading2,40px)]   ← desktop node fallback
text-[length:var(--font/size-heading2,32px)]   ← tablet node fallback
text-[length:var(--font/size-heading2,28px)]   ← mobile node fallback
```

**Read the three fallback values → generate responsive Tailwind classes:**


| Figma Variable         | Mobile | Tablet | Desktop | Tailwind output                             |
| ---------------------- | ------ | ------ | ------- | ------------------------------------------- |
| `--font/size-heading1` | 32px   | 36px   | 44px    | `text-[32px] md:text-[36px] lg:text-[44px]` |
| `--font/size-heading2` | 28px   | 32px   | 40px    | `text-[28px] md:text-[32px] lg:text-[40px]` |
| `--font/size-heading3` | 24px   | 26px   | 28px    | `text-[24px] md:text-[26px] lg:text-[28px]` |
| `--font/size-p-large`  | 20px   | 20px   | 24px    | `text-[20px] lg:text-[24px]`                |
| `--font/size-p-big`    | 18px   | 20px   | 20px    | `text-[18px] md:text-[20px]`                |
| `--font/size-p-medium` | 16px   | 18px   | 18px    | `text-[16px] md:text-[18px]`                |
| `--font/size-p-small`  | 14px   | 14px   | 16px    | `text-[14px] lg:text-[16px]`                |
| `--font/size-p-tiny`   | 12px   | 12px   | 14px    | `text-[12px] lg:text-[14px]`                |


Font weight and family are inlined per element — there is no shared text style. Read them directly from the MCP output (e.g. `font-bold`, `font-semibold`, `font-['Plus_Jakarta_Sans:Bold',sans-serif]`).

**Rules:**

- If a font size is the same across all three breakpoints, emit a single class with no prefix.
- Only add `md:` / `lg:` prefixes where the fallback value actually changes.
- Read fallback values from **section content nodes**, not from shared components (e.g. the CTA component always outputs desktop fallbacks regardless of breakpoint).

---

## Image Export Rules

- Photos/raster → `.jpg` (quality 80) or `.webp`
- Product images with transparency → `.png`
- Icons and illustrations → `.svg`
- Decorative backgrounds → CSS `background-image`
- Content images → `<img>` tag with `alt` from layer description

Image layers must use `img:` prefix: `img:hero-bg` → `images/hero-bg.jpg`

Dynamic images exposed as text property piped through `campaign_asset`:

```liquid
<img src="{{ background_image | campaign_asset }}" alt="{{ background_image_alt }}">
```

### Three Image Patterns — Designer Must Choose One

Every section image falls into one of two patterns. The designer declares which pattern by using the correct layer naming prefix. There is no ambiguity — if the prefix isn't set correctly, the export will be wrong.

---

#### Pattern 1 — `bg:` Background Image

The image is a **decorative fill** that covers a section or column. Content sits on top of it. It bleeds to the edges and is not a discrete visual element.

**Figma:** name the layer `bg:{filename}` (e.g. `bg:hero-bg`). Place the image as a fill on the section or column frame. Figma's offset/bleed positioning is fine here.

**Code output:** CSS `background-image` on the containing element.

```html
<section style="background-image: url('{{ bg_image | campaign_asset }}');
                background-size: cover; background-position: center top;">
  <div class="max-w-[1440px] mx-auto px-4 py-24">
    <!-- content overlaid on background -->
  </div>
</section>
```

**Asset export:** use `export-node.sh` on the section/column node to get the canvas-rendered version at the correct crop.

---

#### Pattern 2 — `img:` Contained Image

The image is a **discrete visual element** — a product, person, illustration — that sits alongside content in a column. It has defined bounds and a transparent background.

**Figma:** name the layer `img:{filename}` (e.g. `img:hero-product`). The image **must be fully contained within its frame** — no bleed, no offset, transparent PNG. The full subject (dog, product, person) must be visible within the frame boundary.

**Icons (sub-pattern of `img:`):** Wrap the icon layer in a fixed-dimension frame in Figma (e.g. 60×60) before naming it `img:icon-name`. A framed export produces an SVG with explicit `width="60" height="60"` and a predictable `viewBox`, rather than Figma's default `width="100%" height="100%"`. Internal padding baked into the frame is preserved in the export. This is the preferred approach for icons — it eliminates distortion without any post-export fixes.

**Code output:** `<img>` tag with `object-contain`.

```html
<img src="{{ hero_image | campaign_asset }}"
     alt="{{ hero_image_alt }}"
     class="w-full h-auto md:absolute md:inset-0 md:h-full md:w-full md:object-contain md:object-right-bottom">
```

**Asset export:** use `export-node.sh` on the image layer node to get the canvas-rendered PNG (not the raw fill asset URL from `get_design_context`, which gives the original un-cropped source file).

```bash
./scripts/export-node.sh {node-id} src/{campaign}/assets/images/{filename}.png 2
```

---

#### Pattern 3 — `img-group:` Composed/Layered Hero (single exported image)

Use this when the final visual is made from multiple layers (e.g. phone + badge + product + overlays) and must be exported as one canvas-rendered image.

**Figma:** name the parent composition node `img-group:{filename}` (e.g. `img-group:bottomcta-hero`). This must be the top-level group/frame that contains all visual child layers. Do not point export at individual child image layers.

**Code output:** `<img>` tag with a single asset path.

```html
<img src="{{ hero_image | campaign_asset }}" alt="{{ hero_image_alt }}">
```

**Asset export:** export the parent composition node ID (not child IDs):

```bash
./scripts/export-node.sh {img-group-node-id} src/{campaign}/assets/images/{filename}.png 2
```

**Rule:** if an image looks padded/offset/partial in code, the wrong node was exported. Re-export using the `img-group:` parent node.

---

#### Why not use the raw asset URL from `get_design_context`?

The MCP returns the **original uploaded source file** — not what Figma renders on canvas. A designer can upload a 1500px wide image, crop it in the frame with offset positioning, and the raw asset URL still gives you the 1500px original. Always use `export-node.sh` to get the canvas-rendered version.


| Source                                          | What you get                                      |
| ----------------------------------------------- | ------------------------------------------------- |
| `imgRectangle730` URL from `get_design_context` | Original uploaded file — wrong size, un-cropped   |
| `export-node.sh {node-id}`                      | Canvas-rendered PNG — correctly cropped and sized |


---

## CSS Strategy (Hybrid — Recommended)

Use Tailwind utilities for layout (flex, grid, spacing, responsive) and custom CSS for section-specific styling.

```html
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          'brand-primary': 'var(--brand-primary)',
          'brand-secondary': 'var(--brand-secondary)',
          'brand-accent': 'var(--brand-accent)',
        }
      }
    }
  }
</script>
```

---

## JavaScript Conventions

All interactivity is powered by a **single unified file**: `assets/js/landing.js`. Do not create per-section JS files. New interactive patterns must be added to `landing.js` using data attributes as the hook contract.

**Canonical implementation** (attribute contracts and comments): [campaign-cart-starter-templates `landing.js`](https://github.com/NextCommerceCo/campaign-cart-starter-templates/blob/main/src/landing/assets/js/landing.js).

**Carousel/slider sections use Swiper** (loaded via `base.html`). The script finds **`[data-swiper]`** on the `.swiper` element and reads **`data-slides`**, **`data-gap`**, **`data-loop`**, etc. from the nearest **`[data-swiper-root]`** ancestor (or legacy wrappers). Put breakpoint attributes on the root; include prev/next hooks if the design has arrows.

When converting static Figma slider state into dynamic Swiper markup, preserve the **visual shell** around the functional Swiper hooks. Swiper needs a `.swiper-pagination` element, but Figma may show a separate component wrapper such as a white `rounded-[30px]` tablist/pill around the dots. Keep that wrapper in the HTML and place `.swiper-pagination` inside it; do not reduce the whole component to only the functional pagination element.

For nav arrows, carry over transforms from the MCP output and screenshot. If the left-arrow wrapper or icon is `-rotate-178`, `rotate-180`, `rotate-90`, etc., put the equivalent Tailwind rotation on the button or image that visually owns the arrow direction. Do not assume the same SVG can be used unrotated for both prev and next.

For mobile alignment, resolve conflicts by comparing the rendered screenshot, not by blindly copying the deepest node's auto-layout class. If a nested star row says `items-start` / `self-start` but the visible card aligns the row centered through a parent `items-center`, prefer the parent-level visual alignment. Nested internal alignment should not override how the component appears in the screenshot.

```html
<div data-swiper-root
     data-slides="1" data-slides-md="2" data-slides-lg="3"
     data-gap="16" data-gap-md="24" data-gap-lg="32"
     data-loop="true" data-loop-md="true" data-loop-lg="false">
  <div class="swiper" data-swiper>
    <div class="swiper-wrapper">...</div>
  </div>
  <div data-swiper-controls>
    <button type="button" data-swiper-prev aria-label="Previous">...</button>
    <button type="button" data-swiper-next aria-label="Next">...</button>
  </div>
</div>
```

Use `data-*` attributes as JS hooks — never class names:

```html
<div data-accordion data-allow-multiple="false">
  <div data-accordion-item data-open="false">
    <button data-accordion-toggle>{{ question }}</button>
    <div data-accordion-panel>{{ answer }}</div>
    <span data-accordion-icon></span>
  </div>
</div>
```

Optional: FAQ-style rows in reference partials may include **`[data-faq-vbar]`** for vertical-bar visibility toggling (see `landing.js`).

**Expandable show/hide sections** use the shared `data-expandable` contract from `landing.js`:

```html
<div data-expandable>
  <div data-expandable-panel>...</div>
  <button type="button" data-expandable-toggle>
    <span data-expandable-label
          data-label-open="{{ ingredients_1_toggle_label }}"
          data-label-close="{{ ingredients_1_toggle_label_close }}">
      {{ ingredients_1_toggle_label }}
    </span>
    <span data-expandable-chevron></span>
  </button>
</div>
```

**Video modal triggers** use the shared modal contract. Use this when the thumbnail should open an overlay player:

```html
<button type="button"
        data-modal-trigger
        data-modal-type="video"
        data-modal-src="{{ hero_6_video_url }}">
  ...
</button>
```

**Inline video thumbnails** use the shared inline-video contract. Use this when the video should replace the thumbnail in-place:

```html
<div data-video-inline data-video-src="{{ ugc_1_slide_1_video_url }}">
  <img src="{{ ugc_1_slide_1_photo | campaign_asset }}" alt="{{ ugc_1_slide_1_alt }}">
  <button type="button">...</button>
</div>
```

**Landing-only countdown fallback:**

```html
<div data-countdown data-duration-minutes="15" data-storage-key="{{ section_id }}-timer">
  ...
</div>
```

Do not use `countdown:<sectionname>` as a default Figma wrapper for promo banners. Promo/checkout countdowns should use the checkout template's campaign-cart/web-component timer convention instead, such as Campaign Cart SDK timer attributes (`data-next-timer`, `data-duration`, etc.) when that is the target integration.

---

## Reference behaviour (interactivity & responsive)

Shipped behaviour for composed landing pages lives in **[campaign-cart-starter-templates](https://github.com/NextCommerceCo/campaign-cart-starter-templates)**:

- **[`src/landing/assets/js/landing.js`](https://github.com/NextCommerceCo/campaign-cart-starter-templates/blob/main/src/landing/assets/js/landing.js)** — accordion, Swiper, expandable, modal, inline video, ambient video, and any landing-only timer fallback contracts in file comments.
- **`src/landing/_includes/`** — how each section wires markup, responsive classes, and any CSS-only patterns (e.g. icon marquees).

When the Figma section matches a **category** below, **before finalizing HTML** open the **same or closest** reference partial (e.g. `testimonials-1.html`, `faq-1.html`, `icons-1.html`, `cta-1.html`) and **mirror structure and `data-*` hooks**, not only layout and visuals.

| Recognize (Figma / catalog) | Behaviour | Reference to copy |
| --------------------------- | --------- | ----------------- |
| Testimonials, Reviews, UGC, Before & After; Ingredients carousels | **Swiper** — `data-swiper-root`, `data-swiper`, `data-slides*`, `data-gap*`, `data-loop*`, prev/next, optional pagination. Slider nav assets appear under two naming conventions in Figma — both are equivalent and map to the same exported files: arrows are either `img:slider-nav-arrowleft.svg` / `img:slider-nav-arrowright.svg` (most sections) or `img:navigation-arrowleft.svg` / `img:navigation-arrowright.svg` (some UGC sections); dots are either `img:slidernav-dot-current.svg` / `img:slidernav-dot.svg` or `img:navigation-dot-current.svg` / `img:navigation-dot.svg`. Reuse the same asset file regardless of which name appears in Figma. | e.g. `testimonials-1.html`, `reviews-1.html`; contracts in `landing.js` |
| FAQ; accordions in Benefits / Ingredients / problem-solution | **Accordion** — `data-accordion`, `data-accordion-item`, `data-accordion-toggle`, `data-accordion-panel`, `data-accordion-icon`. In Figma the toggle element may be named `span.faq-opener` — treat it as the accordion toggle regardless of layer name. FAQ dividers appear as `img:divider-horizontal-fullw-grey.svg` in Figma; convert to `border-b border-[rgba(0,0,0,0.16)]` CSS on export (do not use the image asset). | e.g. `faq-1.html`; matching benefits/ingredients partials |
| Icons strips with infinite / mobile ticker | Often **CSS marquee** (`@keyframes`, duplicated row), not `landing.js` | e.g. `icons-1.html` |
| **CTA** / **bottom CTA** with fixed bar on small viewports | **Sticky / mobile CTA** — responsive visibility (`md:hidden` / `lg:block`), fixed or sticky wrapper; some reference partials use **section-specific** `data-*` and inline script — **match that partial** until unified in `landing.js` | e.g. `cta-1.html`, `bottomcta-1.html` |
| Ingredients or content grids with "show more / show less" | **Expandable show/hide** — use `data-expandable`, `data-expandable-panel`, `data-expandable-toggle`, optional `data-expandable-label`, and optional `data-expandable-chevron`. Infer this from the visible controls and reference partial; current Figma naming conventions do not require behaviour wrapper names. | e.g. `ingredients-1.html`, contracts in `landing.js` |
| Hero / UGC / testimonial video thumbnail that opens an overlay | **Modal video** — use `data-modal-trigger`, `data-modal-type="video"`, and `data-modal-src="{{ section_video_url }}"`; put the URL in page frontmatter. | e.g. `hero-6.html`; contracts in `landing.js` |
| UGC / testimonial video thumbnail that plays in-place | **Inline video** — use `data-video-inline` and `data-video-src="{{ section_video_url }}"`; keep thumbnail image and video URL in page frontmatter. | e.g. `testimonials-3.html`, `ugc-1.html`, `ugc-3.html`, `ugc-6.html`; contracts in `landing.js` |
| Landing-only urgency / offer timers | **Countdown fallback** — use `data-countdown`, `data-duration-minutes`, `data-storage-key`, `data-countdown-hrs` / `min` / `sec` only when the reference landing partial does. Promo/checkout banners should use the checkout template campaign-cart/web-component timer convention instead. | Matching reference partial or checkout template |

Some reference partials still use **inline script** for sticky CTA patterns; prefer matching the **published** reference over inventing new selectors.

---

## Page Frontmatter Fields


| Field                 | Required | Description                                |
| --------------------- | -------- | ------------------------------------------ |
| `title`               | Yes      | Page `<title>`                             |
| `page_type`           | Yes      | `product`, `checkout`, `upsell`, `receipt` |
| `page_layout`         | No       | Layout file (default: `base.html`)         |
| `styles`              | No       | CSS files array                            |
| `scripts`             | No       | JS files array                             |
| `next_success_url`    | No       | Redirect after checkout                    |
| `next_upsell_accept`  | No       | Redirect on upsell accept                  |
| `next_upsell_decline` | No       | Redirect on upsell decline                 |
| `footer`              | No       | Include footer boolean                     |


---

## Standard Section Catalog

Frame names use `{category}{number}-{breakpoint}` (e.g. `hero1-desktop`). Export partial is `{category}-{number}.html` (e.g. `hero-1.html`). Numbers correspond to design variants — use the same number as the Figma frame being exported.

| Section          | Figma Base Name      | Export Partial          | Category     | Interactivity |
| ---------------- | -------------------- | ----------------------- | ------------ | ------------- |
| Hero             | `hero{n}`            | `hero-{n}.html`         | hero         | —             |
| Benefits         | `benefits{n}`        | `benefits-{n}.html`     | content      | Accordion (var.) |
| Features         | `features{n}`        | `features-{n}.html`     | content      | —             |
| Before & After   | `beforeafter{n}`     | `beforeafter-{n}.html`  | content      | Swiper        |
| Testimonials     | `testimonials{n}`    | `testimonials-{n}.html` | social-proof | Swiper        |
| Reviews          | `reviews{n}`         | `reviews-{n}.html`      | social-proof | Swiper        |
| UGC              | `ugc{n}`             | `ugc-{n}.html`          | social-proof | Swiper        |
| How-To           | `howto{n}`           | `howto-{n}.html`        | content      | —             |
| Ingredients      | `ingredients{n}`     | `ingredients-{n}.html`  | content      | Swiper / Accordion |
| Problem/Solution | `problemsolution{n}` | `problemsolution-{n}.html` | content   | —             |
| Compare          | `compare{n}`         | `compare-{n}.html`      | content      | —             |
| Results          | `results{n}`         | `results-{n}.html`      | social-proof | —             |
| Icons            | `icons{n}`           | `icons-{n}.html`        | social-proof | CSS marquee   |
| Guarantee        | `guarantee{n}`       | `guarantee-{n}.html`    | trust        | —             |
| Science          | `science{n}`         | `science-{n}.html`      | content      | —             |
| Bottom CTA       | `bottomcta{n}` or `sticky{n}` | `bottomcta-{n}.html` | cta     | Sticky CTA (var.) |
| FAQ              | `faq{n}`             | `faq-{n}.html`          | faq          | Accordion     |
| Media            | `media{n}`           | `media-{n}.html`        | content      | Swiper / video |
| Nav              | `nav{n}`             | `nav-{n}.html`          | nav          | —             |
| Footer           | `footer{n}`          | `footer-{n}.html`       | footer       | —             |

`var.` = depends on design variant; always confirm against **`src/landing/_includes/`** in the reference repo. See **Reference behaviour (interactivity & responsive)**.


---

## Figma API Fields the Export Script Reads


| API Field                           | Purpose                                         |
| ----------------------------------- | ----------------------------------------------- |
| `node.name`                         | Frame name → output filename                    |
| `node.characters`                   | Text content → Liquid variable value            |
| `node.description`                  | JSON metadata → export config                   |
| `node.children`                     | Child nodes → HTML structure                    |
| `node.layoutMode`                   | `HORIZONTAL`/`VERTICAL` → `flex-row`/`flex-col` |
| `node.itemSpacing`                  | Gap → `gap-{n}`                                 |
| `node.paddingLeft/Right/Top/Bottom` | Padding → `p-{n}`                               |
| `node.primaryAxisAlignItems`        | Justify content                                 |
| `node.counterAxisAlignItems`        | Align items                                     |
| `node.fills`                        | Background colors/images                        |
| `node.styles`                       | References to color/text styles                 |


---

## Export Manifest Output

```json
{
  "exported_at": "2026-03-13T12:00:00Z",
  "figma_file": "ia7650Y3lLte4WVYARNvSX",
  "sections": [
    {
      "id": "hero-banner",
      "category": "hero",
      "file": "_includes/hero-banner.html",
      "properties": [
        { "name": "headline", "type": "text" },
        { "name": "cta_url", "type": "link", "filter": "campaign_link" },
        { "name": "background_image", "type": "image", "filter": "campaign_asset" }
      ],
      "styles": ["css/sections.css"],
      "scripts": [],
      "images": ["images/hero-bg.jpg"]
    }
  ]
}
```

---

## Section Export Process (Established Pattern)

This is the validated step-by-step process from the hero-1 section export.

### Step 1 — Fetch all 3 breakpoint nodes in parallel — **do not write any HTML until this is done**

Every section has desktop, tablet, and mobile variants. Fetch all three simultaneously with `get_design_context` **before writing a single line of HTML**. Starting early with incomplete design information leads to structural mistakes that are expensive to undo.

**Do not re-fetch** `get_design_context` during HTML refinement. Work from the data and screenshots you already have, the compare tool, and saved notes. Call MCP again only if the Figma file changed or something is genuinely ambiguous — repeat calls add **rate-limit pressure** (see **Figma API rate limits & hygiene** below).

After fetching, compare all three side by side and record:

- Desktop: outer padding, inner gap, column widths, element order
- Tablet: outer padding, inner gap, font size deltas
- Mobile: stacking order, text alignment, image height, any elements that hide or reorder
- Cards, buttons, dividers: corner radius, borders, shadows — note for markup and cross-check **Visual fidelity** and the same-category file in **`src/landing/_includes/`**
- **Interactivity:** if **Standard Section Catalog** / Figma implies Swiper, accordion, sticky CTA, CSS marquee icons, or a landing-only countdown fallback, plan the **`data-*` hooks** and structure from **Reference behaviour** and [`landing.js`](https://github.com/NextCommerceCo/campaign-cart-starter-templates/blob/main/src/landing/assets/js/landing.js) — not only static layout. Promo/checkout countdown banners should follow the checkout template web-component/campaign-cart timer convention instead.
- **Swiper visual shell:** note arrow rotations, pagination pill/tablist wrappers, and mobile alignment from the screenshot before writing markup

**Before writing any markup:** open [campaign-cart-starter-templates `src/landing/_includes/`](https://github.com/NextCommerceCo/campaign-cart-starter-templates/tree/main/src/landing/_includes) and skim a partial for the **same section category** (e.g. hero → `hero-*.html`, FAQ → `faq-*.html`) so asset paths, inner max-width, positioning, **visual treatment** (radius, borders, shadows), and **behaviour** (sliders, accordions, sticky CTAs, marquees) match shipped pages.

Only once you have a clear picture of how the layout changes across all three breakpoints should you begin writing HTML. The responsive class decisions (`flex-col md:flex-row`, `hidden md:block`, etc.) should be obvious before you start, not discovered during.

### Step 1b — Trace the node tree before writing any HTML

HTML nesting must mirror the Figma node tree exactly. Do **not** reorganize nodes based on what the content "means" semantically.

**Rule:** Every Figma parent node becomes one `<div>` (or semantic element). Every child of that node becomes a direct child of that `<div>`. If Figma places a heading, a badge, and a description as siblings inside a parent with `gap: 12px`, all three go inside one `<div class="flex flex-col gap-[12px]">` — even if you think "the heading logically belongs with the title" or "the badge is a separate component."

```html
<!-- Wrong — regrouped by semantic meaning, invented by the developer -->
<div class="heading-group">
  <h2>Title</h2>
  <span>Badge</span>
</div>
<div class="body-group">
  <p>Description</p>
</div>

<!-- Correct — mirrors Figma: all three are siblings inside one parent with gap-[12px] -->
<div class="flex flex-col gap-[12px]">
  <h2>Title</h2>
  <span>Badge</span>
  <p>Description</p>
</div>
```

**Why it matters:** Regrouping breaks spacing. Figma's `gap` values only work correctly when parent-child relationships match. Splitting siblings into separate wrappers produces uncontrolled gaps that get patched with ad-hoc padding — which then breaks at other breakpoints.

**How to enforce it:** Trace node IDs (e.g. `6205:2433`) from the `get_design_context` output rather than naming groups by content. IDs force you to follow the actual tree; naming groups by content invites interpretation and reordering.

### Step 2 — Use the 4-layer HTML structure (always)

```
<section>              ← bg color, overflow-hidden, full-width
  <div> container      ← max-w-[1440px] mx-auto w-full + Figma outer padding (right only); never omit max-w + mx-auto
    <div> content      ← flex-col md:flex-row + gap values from inner Figma node
      [components]     ← image column, content column, sub-components
```

Mapping Figma nodes to layers:


| Figma Node                              | HTML Layer      | Key Properties                                    |
| --------------------------------------- | --------------- | ------------------------------------------------- |
| Section frame (outer, e.g. `143:10518`) | `<section>`     | `bg-*`, `overflow-hidden`                         |
| Section frame padding                   | Container `div` | `max-w-[1440px] mx-auto w-full md:pr-[N] lg:pr-[N]` |
| Inner flex node (e.g. `143:10519`)      | Content `div`   | `flex flex-col md:flex-row md:gap-[N] lg:gap-[N]` |
| Child column nodes                      | Components      | `md:flex-1` per column                            |

**Sanity check before saving the partial:** search the file for `max-w-` — the main inner container must include `max-w-[1440px]` or `max-w-7xl` with `mx-auto`. If only `<section>` and flex/grid exist with no max-width on the content wrapper, the structure is wrong.

### Step 3 — Responsive column rules

Figma pixel widths are 1440px reference values — never hard-code them as flex column widths.


| ❌ Wrong                                | ✅ Correct                      |
| -------------------------------------- | ------------------------------ |
| `lg:w-[680px] lg:flex-none` on image   | `md:flex-1`                    |
| `lg:w-[580px] lg:flex-none` on content | `md:flex-1`                    |
| `w-[440px]` on CTA block               | `md:max-w-[440px] w-full`      |
| `w-[475px]` on heading                 | remove — let it wrap naturally |


The **right padding** from the Figma section frame belongs on the **container**, not the content column. The image column has no left padding — it bleeds to the container's left edge.

### Step 4 — Handle mobile element reordering

When mobile layout reorders elements (e.g. heading above image, image above content), duplicate the element with visibility classes rather than using CSS `order`:

```html
<!-- Heading: mobile only, appears above image in DOM -->
<div class="md:hidden ...">{{ heading }}</div>

<!-- Image column -->
<div class="md:flex-1">...</div>

<!-- Content column: heading hidden on mobile (shown in duplicate above) -->
<div class="hidden md:flex flex-col ...">{{ heading }}...</div>
```

### Step 5 — Save reference screenshots

Download a PNG of each breakpoint node into `src/{slug}/_ref/`. These are used by the compare tool in Step 8 — without them the left side of the compare page will be empty.

**Skip `save-ref.sh`** if `src/{slug}/_ref/` already contains the correct `{section}-desktop.png` / `tablet` / `mobile` for this export (e.g. you are iterating on HTML only). Re-run only when node IDs change or refs are missing. Each run hits Figma’s **`/v1/images/`** endpoint **three times** (expensive renders; low per-minute quota).

Prefer running `save-ref` **once** when you are ready to use the compare page, rather than immediately after every partial edit in a tight loop (see **Figma API rate limits & hygiene**).

```bash
./scripts/save-ref.sh <slug> <section-name> <desktop-node-id> <tablet-node-id> <mobile-node-id>
```

Example:
```bash
./scripts/save-ref.sh novaburn-presale hero 143:10703 143:10748 143:13028
```

Requires `FIGMA_ACCESS_TOKEN` in a `.env` file (copy `.env.example` → `.env`). Get your token from Figma → Account Settings → Personal Access Tokens.

Output:
```
src/novaburn-presale/_ref/
  hero-desktop.png
  hero-tablet.png
  hero-mobile.png
```

---

### Step 6 — Download Figma assets immediately

Asset URLs from `get_design_context` expire in 7 days. Download all icons and images before previewing:

**`export-node.sh`** uses the same **Figma image render** API as `save-ref.sh`. If you export several nodes back-to-back, run **`export-node.sh` sequentially** with a **short pause** (a few seconds) between invocations instead of parallel bursts — especially in the same minute as `save-ref.sh` (see **Figma API rate limits & hygiene**).

```bash
# Download all assets — use a temporary extension first
curl -sL "[url]" -o "src/{campaign}/assets/images/icon-check.tmp"
curl -sL "[url]" -o "src/{campaign}/assets/images/icon-arrow.tmp"
curl -sL "[url]" -o "src/{campaign}/assets/images/hero-photo.tmp"

# Detect actual format — Figma returns SVG for vectors regardless of extension
file src/{campaign}/assets/images/*.tmp
# Example output:
#   icon-check.tmp: SVG Scalable Vector Graphics image
#   icon-arrow.tmp: SVG Scalable Vector Graphics image
#   hero-photo.tmp: PNG image data, 1500x647 ...

# Rename with correct extensions
mv icon-check.tmp icon-check.svg
mv icon-arrow.tmp icon-arrow.svg
mv hero-photo.tmp hero-photo.png
```

**Rule:** Figma MCP always returns SVG for vector assets (icons, badges, illustrations) and PNG/JPG for raster images. Saving a vector as `.png` causes it to silently not render in the browser.

**Rule:** After saving any `.svg` file, check whether the icon was exported from a fixed-size frame in Figma. If so, the SVG already has explicit `width`/`height` attributes and a correct `viewBox` — no further fix needed. If the icon was a raw layer (no wrapping frame), fix the `preserveAspectRatio` attribute — Figma exports these with `preserveAspectRatio="none"` which causes distortion. Change it to `xMidYMid meet`:

```bash
sed -i '' 's/preserveAspectRatio="none"/preserveAspectRatio="xMidYMid meet"/g' assets/images/*.svg
```

Running this on frame-wrapped SVGs is harmless (the attribute will already be absent or correct), so it is safe to run as a catch-all when unsure.

```bash
# Photo assets — export manually from Figma (right-click frame → Export)
# Image fills don't surface as URLs in get_design_context output
```

Once all assets are downloaded and renamed, run image compression:

```bash
npm run compress <slug>
```

This optimises all JPG, PNG, and WebP files in `src/<slug>/assets/images/` in-place. Run once after downloading — do not repeat on already-compressed files.

### Step 7 — Preview project structure

```
_data/campaigns.json
src/{campaign-slug}/
  _layouts/base-landing.html  ← Tailwind CDN + tokens stylesheet
  _includes/landing/{section}.html
  assets/css/tokens.css       ← CSS custom properties for all design tokens
  assets/js/landing.js        ← shared landing interactivity
  assets/images/{section}/    ← downloaded Figma assets for the section
  landing.html                ← handoff page that campaign_includes landing sections
```

Run: `npm run dev` → select campaign → configured `entry_url` such as `http://localhost:3000/{slug}/landing/`

### Step 8 — Compare against Figma refs

Generate a side-by-side compare page (Figma screenshot vs live iframe):

```bash
npm run compare <slug>
npm run compare <slug> <ref-prefix>
npm run compare <slug> <ref-prefix> 3001
open src/<slug>/_ref/compare.html
```

`<ref-prefix>` matches the `save-ref.sh` section name (`{ref-prefix}-desktop.png`, etc.). If omitted and multiple ref sets exist in `_ref/`, the compare script picks deterministically and warns — pass `<ref-prefix>` to select which screenshot set to use.

Requires Figma ref images from Step 5. The compare page shows the Figma PNG on the left and the live dev server in an iframe on the right, at all 3 breakpoints. The iframe updates live as you edit HTML — no re-run needed.

**Keyboard shortcuts:** `D` / `T` / `M` — switch breakpoint

**Refinement loop:** edit `_includes/landing/{section}.html` → save → refresh `compare.html` → spot differences → repeat until it matches.

### Figma API rate limits & hygiene

Figma applies **per-minute** limits to **MCP / REST** usage. Heavy bursts come from the same sources:

| Source | Why it adds pressure |
| ------ | -------------------- |
| **`get_design_context`** (3 breakpoints in parallel) | 3 simultaneous calls at export start — fine once per section; **re-fetching during refinement** multiplies usage fast |
| **`save-ref.sh`** | **3** calls to **`/v1/images/`** per run (PNG renders; strict quota) |
| **`export-node.sh`** | Same **`/v1/images/`** render path — **one call per node** |
| **Back-to-back sections** | Quota is **per minute**, not per session |

**Guidance:**

1. **One MCP fetch per section** at the start — then refine from that data + compare; **don’t re-fetch** unless the design changed or something is unclear.
2. **Run `save-ref.sh` when refs are missing or node IDs changed** — not after every HTML tweak if PNGs in `_ref/` are already correct.
3. **Stagger** heavy work: prefer order **MCP (3) → HTML / curl assets → `export-node` one-by-one with gaps → `save-ref` once → `npm run compare`**. Avoid **`save-ref` + many `export-node` calls in the same burst**.
4. **Batch `export-node.sh` sequentially** with a few seconds between runs when exporting many assets.
5. If you hit **429 / throttling**, wait **~60 seconds** and retry; reduce parallel Figma work first.
6. `figma-remote-mcp` can help with transport/auth stability, but it **does not** increase Figma API quotas; the same rate-limit hygiene rules still apply.

### After every export — auto-open the compare tool

At the end of a section export, refresh the compare workflow. The node IDs are already known from the Figma URLs — extract them and use them directly.

**If reference PNGs are not yet in `_ref/`** (or you updated Figma node IDs), run `save-ref` **once**, then compare:

```bash
./scripts/save-ref.sh <slug> <section> <desktop-node-id> <tablet-node-id> <mobile-node-id>
npm run compare <slug> <section>
open src/<slug>/_ref/compare.html
```

**If `_ref/` already has the right `{section}-*.png` set** (iterate-only pass), skip `save-ref` and run:

```bash
npm run compare <slug> <section>
open src/<slug>/_ref/compare.html
```

Use the same `<section>` string for `save-ref.sh` and `npm run compare` when `_ref/` holds multiple section ref sets.

Node ID format: take the `node-id` query param from the Figma URL and replace `-` with `:` (e.g. `143-10703` → `143:10703`).

The developer needs `npm run dev` running for the live iframe.

### Common mistakes


| Mistake                                                            | Fix                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regrouping nodes by semantic meaning                               | HTML nesting must mirror the Figma node tree exactly. If Figma puts three siblings inside one parent with `gap: 12px`, they all go in one `<div class="flex flex-col gap-[12px]">` — never split them into invented sub-groups. Trace node IDs to enforce this.       |
| Fixed column widths (`lg:w-[Npx]`)                                 | Use `flex-1` — widths are 1440px reference only                                                                                                                                                                                                                      |
| Right padding on content column                                    | Move to the `max-w` container div                                                                                                                                                                                                                                    |
| Missing inner `max-w-* mx-auto` wrapper                          | **Always required** on the main inner container — without it the section stretches edge-to-edge on wide monitors                                                                                                                                                     |
| Re-fetching `get_design_context` on every HTML tweak                         | Work from the first fetch + compare; re-call MCP only when the file changed or something is unclear — reduces rate-limit pressure                                                                                                                                      |
| Running `save-ref.sh` + many `export-node.sh` in one burst                 | Stagger image renders; skip `save-ref` when `_ref/` PNGs are already valid — see **Figma API rate limits & hygiene**                                                                                                                                                     |
| Skipping the reference partial in campaign-cart-starter-templates | Open **`src/landing/_includes/`** in that repo and skim a same-category partial before coding — aligns assets, positioning, wrapper patterns, and visual treatment                                                                                                      |
| Generic `rounded-md` / `rounded-lg` when reference uses `rounded-[Npx]` | Match the **same section family** in `src/landing/_includes/` — arbitrary radius is often intentional                                                                                                                                    |
| Borders/shadows in Figma or reference, missing in export HTML        | Map strokes to `border*` and effects to `shadow*`; see **Visual fidelity**                                                                                                                                                                                            |
| Large container side padding applied too early                     | For large values like `px-[120px]` (120px/side = 240px total), `px-[160px]`, or `px-[240px]`, prefer `xl:` over `lg:`. Use the 4-step scale: `px-[15px] md:px-[26px] lg:px-[60px] xl:px-[120px]` — `lg:px-[120px]` fires at 1024px and leaves only 784px for content, breaking wide text and two-column layouts between 1024–1220px |
| `lg:px-[Npx]` exceeding 80px/side on the main container wrapper   | Never write `lg:px-[120px]` or larger on `max-w-[1440px] mx-auto` — use the 4-step scale instead. Scale the bridge proportionally: 120px desktop → `lg:px-[60px] xl:px-[120px]`; 140px desktop → `lg:px-[70px] xl:px-[140px]`. Internal elements (cards, buttons, accordion rows) with small `lg:px-[Npx]` values (≤40px) are unaffected — this rule applies to the main section container only |
| `whitespace-nowrap` on body/bullet text                            | Only use on single-word UI labels                                                                                                                                                                                                                                    |
| Tailwind CDN in section partial                                    | CDN belongs in `_layouts/base.html` only                                                                                                                                                                                                                             |
| CSS tokens defined inline                                          | Always a separate `css/tokens.css`, listed in frontmatter `styles:`                                                                                                                                                                                                  |
| Saving SVG assets as `.png`                                        | Run `file *.png` after download — Figma returns SVG for all vectors; rename to `.svg`                                                                                                                                                                                |
| `campaign_include '_includes/hero.html'`                           | Tag auto-prepends `_includes/` — use just `'hero.html'`                                                                                                                                                                                                              |
| SVG icon stretches or distorts                                     | **Preferred fix (Figma-side):** wrap the icon in a fixed-size frame (e.g. 60×60) in Figma before naming it `img:`. The exported SVG will have explicit `width`/`height` and a correct `viewBox` — no post-processing needed. **Fallback (export-side, raw layer):** fix `preserveAspectRatio="none"` → `preserveAspectRatio="xMidYMid meet"` in the SVG source and add `self-start` to the `<img>`. Setting only `w-[N] h-[N]` on the `<img>` is not reliable on its own. |
| Arrow/icon points wrong direction                                  | Figma MCP code often wraps icons in `rotate-90` — carry that rotation over as a Tailwind class on the `<img>`                                                                                                                                                        |
| Swiper pagination dots missing white pill/background               | Figma may represent a tablist/pagination wrapper as absolutely-positioned internals. Keep the visible wrapper (e.g. `rounded-[30px] bg-white`) and put `.swiper-pagination` inside it instead of rendering bare dots.                                                |
| Mobile stars/dots/text align left when Figma shows centered        | Check parent-level visual alignment in the screenshot. Do not copy `self-start` / `items-start` from a deeply nested node when the visible component is centered by its parent.                                                                                       |
| Non-web font (Bayshore, script/display fonts) renders as fallback  | Export the text node as a PNG with `export-node.sh` and use `<img>` instead of a font                                                                                                                                                                                |
| `w-auto` image stretches inside `flex flex-col`                    | `align-items: stretch` overrides `w-auto` — add `self-start` to the `<img>`                                                                                                                                                                                          |
| p-big font size uses `lg:` prefix (`text-[18px] lg:text-[20px]`)   | Tablet is also 20px — always use `md:` prefix: `text-[18px] md:text-[20px]`                                                                                                                                                                                          |
| p-small font size uses `md:` prefix (`text-[14px] md:text-[16px]`) | Tablet stays at 14px — always use `lg:` prefix: `text-[14px] lg:text-[16px]`                                                                                                                                                                                         |
| Liquid for loops with dynamic variable names                       | LiquidJS does not support dynamic variable name construction (e.g. `{{ section_item_{{ i }}_title }}`). Use static numbered variables in frontmatter: `item_1_title`, `item_2_title`, etc. and repeat markup per item.                                                |
| Tablet-only `md:` padding persists on desktop                      | A `md:px-[40px]` rule applies at desktop too unless you add a `lg:px-[N]` override. Always check whether the padding value changes at desktop and emit the correct `lg:` value explicitly.                                                                           |
| Using `order-*` for structurally different breakpoint layouts      | CSS `order` only reorders within the same flex container and breaks tab order. When mobile and desktop are structurally different (e.g. stacked vs side-by-side with different element sequences), duplicate the element with `md:hidden` / `hidden md:block` instead — see **Step 4**. |
| Image with overlaid badges rebuilt in HTML                         | If a Figma image has badges, text, or overlays composited on top, don't recreate the composition in HTML. Name the parent node `img-group:` and export as a single canvas-rendered PNG — see **Pattern 3**.                                                           |
| Copying pixel fallbacks from MCP instead of using typography table | `get_design_context` outputs fallbacks from shared component nodes which always reflect desktop values regardless of breakpoint. Read responsive sizes from the typography table in **Design Tokens**, not from MCP output pixel fallbacks.                             |
| Duplicated mobile element placed outside its flex container        | When duplicating an element for mobile visibility (e.g. heading above image), the duplicate must be inside the same flex container to inherit gap spacing. Placing it outside creates an uncontrolled gap that requires manual padding patches.                        |
| Swiper slide images expand to natural height                       | Swiper slides need `h-full` on the slide wrapper; images need `w-full h-full object-cover` (or `object-contain`) to fill the slide. Without explicit height the slide grows to the image's natural dimensions.                                                        |
| Video/media thumbnail expands to natural height                    | The video or thumbnail wrapper needs an explicit height or `aspect-*` class (e.g. `aspect-video`) to constrain it. Without this the element grows to its natural image dimensions.                                                                                    |
| Swiper/carousel nav arrows hand-coded with generic SVGs            | Don't invent new arrow SVGs. Copy `data-swiper-prev` / `data-swiper-next` button markup from the closest reference partial for the same section category — arrow style and size must match shipped pages.                                                              |
| Setting `gap-0` when layout direction changes at a breakpoint      | When switching from `flex-col` to `flex-row` at a breakpoint, the gap usually also changes (e.g. `gap-4` vertical → `gap-8` horizontal). Set the correct gap value per breakpoint explicitly — don't use `gap-0` as a reset.                                          |


---

## Export Checklist

### Figma Setup

- Section frame named `{category}{number}-{breakpoint}` (e.g. `hero1-desktop`)
- Frame is top-level on the Sections page
- Uses Auto Layout throughout (no absolute positioning)
- Width: Fill or fixed 1440px
- All copy is final (no placeholder text)
- All images named with `img:`, `bg:`, or `img-group:` prefix as appropriate
- Icon layers wrapped in a fixed-size frame (e.g. 60×60) in Figma before being named with `img:` prefix
- Colors reference Figma Color Variables (not hardcoded hex)
- Typography font sizes come from Figma Variables (`--font/size-`*) — read fallback px values from each breakpoint node to determine responsive sizes
- Spacing values align to Tailwind scale (multiples of 4px)
- Description contains valid JSON metadata block
- Desktop + mobile breakpoint variants defined

### Export Output

- Liquid partial generated in `_includes/`
- Inner layout uses **`max-w-[1440px]` or `max-w-7xl`** with **`mx-auto`** (and usually **`w-full`**) on the main content wrapper — verified before handoff
- **Reference partial** in [campaign-cart-starter-templates](https://github.com/NextCommerceCo/campaign-cart-starter-templates) **`src/landing/_includes/`** reviewed for the same section type (layout, assets, positioning, radius/borders/shadows, **interactivity / `data-*` hooks**)
- Radius, borders, shadows checked against Figma and the reference partial — see **Visual fidelity**
- **Figma API:** no unnecessary MCP re-fetch; `save-ref` / `export-node` staggered or skipped when refs already valid — see **Figma API rate limits & hygiene**
- All asset refs use `campaign_asset` filter
- All internal links use `campaign_link` filter
- Text properties do NOT use `| default:` fallbacks — omit them entirely so missing variables are visible during dev/QA rather than silently showing placeholder text in production
- Images exported to `assets/images/`
- CSS generated (Tailwind classes or custom or both)
- JS files listed in section metadata
- Section manifest updated
