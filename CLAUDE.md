# Figma Design Framework — Export Tool

This repo builds an export script that reads a Figma file via the REST API and generates production-ready HTML/Liquid partials for the `next-campaign-page-kit` framework.

**Figma file:** [https://www.figma.com/design/ia7650Y3lLte4WVYARNvSX/Debranded-Sections](https://www.figma.com/design/ia7650Y3lLte4WVYARNvSX/Debranded-Sections)

**Reference implementation:** [campaign-cart-landing-page-sections](https://github.com/NextCommerceCo/campaign-cart-landing-page-sections) — canonical example of exported section partials, asset structure, JS conventions, and page composition.

**Before generating HTML for an export:** in [campaign-cart-landing-page-sections](https://github.com/NextCommerceCo/campaign-cart-landing-page-sections), open **`src/landing/_includes/`** ([browse on GitHub](https://github.com/NextCommerceCo/campaign-cart-landing-page-sections/tree/main/src/landing/_includes)) and skim at least one partial that matches the section type you are exporting (e.g. hero → `hero-*.html`, FAQ → `faq-*.html`). Copy **patterns**, not marketing copy: outer `section` vs inner wrapper, `max-w-*` + `mx-auto`, horizontal padding, how images are constrained and positioned (`object-*`, flex vs absolute columns), card/list structure, and how **radius, borders, and shadows** are written (see **Visual fidelity**). *This path is in the reference repo — not necessarily the same as your local preview campaign folder.* If an older partial disagrees with the rest of this document on tokens or naming, **this document (`CLAUDE.md`) wins**.

---

## Getting Started

### Prerequisites

- **Node.js** 18+ — [nodejs.org](https://nodejs.org)
- **Claude Code** CLI — [claude.ai/code](https://claude.ai/code)
- **Figma MCP plugin** enabled in Claude Code (see below)

---

### 1. Clone this repo and install

```bash
git clone <this-repo>
cd figma-templates-export
npm install
```

`npm install` pulls `next-campaign-page-kit` from npm and makes the `campaign-dev`, `campaign-build` etc. commands available.

---

### 2. Enable the Figma MCP plugin in Claude Code

The Figma MCP server gives Claude direct read access to your Figma files — no manual copy-paste of node data needed.

**In Claude Code, open settings:**

```bash
claude mcp add
```

Select **Figma** from the plugin list, or add it manually to your Claude Code MCP config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "@figma/mcp-server"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "your-figma-personal-access-token"
      }
    }
  }
}
```

Get your Figma personal access token: Figma → Account Settings → Personal Access Tokens → Generate. Scopes needed: Files → **Read the contents of and render images from files** + Files → **Read metadata of files**.

Restart Claude Code after adding the plugin. You'll know it's working when Claude can call `get_design_context` and return screenshots directly from a Figma URL.

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

Paste all 3 Figma links into Claude Code in a single message:

```
Export this section:
https://www.figma.com/design/{fileKey}/...?node-id=143-10518
https://www.figma.com/design/{fileKey}/...?node-id=143-10610
https://www.figma.com/design/{fileKey}/...?node-id=143-12936
```

Claude will fetch all 3 breakpoints in parallel, then generate the Liquid partial following the process defined in `## Section Export Process` below.

---

### 5. Preview the output

```bash
npm run dev
```

Select your campaign from the list → opens `http://localhost:3000/{campaign-slug}/` with live reload.

---

## Intended Workflow

This tool exports Figma sections as Liquid partials (`_includes/*.html`) that are assembled into a landing or presell page. The **unit of export is always a single section** — exporting section by section produces better results than attempting a full-page export in one pass.

**Production page workflow:**

1. Dev has a Figma landing/presell page built from the unbranded section templates
2. Identifies the sections on the page (e.g. hero, features, FAQ, footer)
3. Exports each section one at a time as `_includes/{section}.html`
4. A page file (any name — `presale.html`, `landing.html`, etc.) assembles them via `campaign_include` tags — a slug can contain multiple page files

What matters is consistent scoping:

- Includes: `_includes/{section-name}.html`
- Images: `images/{section-name}/{filename}`
- JS: all in `assets/js/landing.js`

**Note for Claude:** The current `src/` directory contains one slug per section — this is local testing only, not the intended workflow. Ignore this structure when guiding developers. Always direct developers toward the page-level workflow above.

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

Text layers in the Figma file use default naming (layer content or generic IDs). Claude reads the text content directly and infers `snake_case` Liquid variable names from context — e.g. a heading that reads "How Next Commerce Works" becomes `{{ section_heading }}`.

**Copy must be final before export.** Placeholder text ("Lorem ipsum", "Headline goes here") produces meaningless variable names that must be manually fixed after export.

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
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <!-- content -->
  </div>
</section>
```

### Mandatory inner max-width

- `<section>` may be full-bleed for backgrounds.
- **All** main content (text, grids, cards, columns) must sit inside a child with **`max-w-[1440px]`** or **`max-w-7xl`** (pick one per project and stay consistent), **`mx-auto`**, and usually **`w-full`**.
- **Anti-pattern:** direct children of `<section>` that are only `flex` / `grid` / `px-*` with **no** `max-w-*` — the layout reads full viewport width on large screens.
- **Exception:** intentional full-bleed strips (e.g. one full-width image band). Typography and UI blocks should still use a max-width wrapper unless the design explicitly breaks that rule.

### Visual fidelity (radius, borders, shadows)

**Source of truth:** Prefer the **same section family** in [campaign-cart-landing-page-sections](https://github.com/NextCommerceCo/campaign-cart-landing-page-sections) under **`src/landing/_includes/`** over generic Tailwind guesses. Shipped partials encode how subtle UI is done — e.g. primary CTAs often use **`rounded-[6px]`** with **`bg-[var(--brand-primary)]`**, FAQ-style rows often use **`border-t` / `border-b`** with **`border-[rgba(0,0,0,0.16)]`**, and image columns that clip content use **`overflow-hidden`** on the wrapper plus `object-*` / sizing as in the reference. Use **`rounded-[Npx]`** when Figma specifies a radius and the reference uses arbitrary values — do not default to `rounded-md` / `rounded-lg` unless both Figma and the reference agree.

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

**Carousel/slider sections use Swiper** (loaded via `base.html`). Configure via data attributes on the root element:

```html
<div data-swiper-root
     data-slides="1.1" data-slides-md="2" data-slides-lg="3"
     data-gap="16" data-gap-md="24" data-gap-lg="32"
     data-loop="true">
  <div class="swiper-wrapper">...</div>
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

**Countdown timer:**

```html
<div data-countdown data-duration-minutes="15" data-storage-key="{{ section_id }}-timer">
  ...
</div>
```

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

| Section          | Figma Base Name      | Export Partial          | Category     | JS?    |
| ---------------- | -------------------- | ----------------------- | ------------ | ------ |
| Hero             | `hero{n}`            | `hero-{n}.html`         | hero         | No     |
| Benefits         | `benefits{n}`        | `benefits-{n}.html`     | content      | No     |
| Features         | `features{n}`        | `features-{n}.html`     | content      | No     |
| Before & After   | `beforeafter{n}`     | `beforeafter-{n}.html`  | content      | Yes    |
| Testimonials     | `testimonials{n}`    | `testimonials-{n}.html` | social-proof | Slider |
| Reviews          | `reviews{n}`         | `reviews-{n}.html`      | social-proof | Slider |
| UGC              | `ugc{n}`             | `ugc-{n}.html`          | social-proof | Slider |
| How-To           | `howto{n}`           | `howto-{n}.html`        | content      | No     |
| Ingredients      | `ingredients{n}`     | `ingredients-{n}.html`  | content      | No     |
| Problem/Solution | `problemsolution{n}` | `problemsolution-{n}.html` | content   | No     |
| Compare          | `compare{n}`         | `compare-{n}.html`      | content      | No     |
| Results          | `results{n}`         | `results-{n}.html`      | social-proof | No     |
| Icons            | `icons{n}`           | `icons-{n}.html`        | social-proof | No     |
| Guarantee        | `guarantee{n}`       | `guarantee-{n}.html`    | trust        | No     |
| Bottom CTA       | `bottomcta{n}`       | `bottomcta-{n}.html`    | cta          | No     |
| FAQ              | `faq{n}`             | `faq-{n}.html`          | faq          | Yes    |
| Media            | `media{n}`           | `media-{n}.html`        | content      | Yes    |
| Nav              | `nav{n}`             | `nav-{n}.html`          | nav          | No     |
| Footer           | `footer{n}`          | `footer-{n}.html`       | footer       | No     |


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

After fetching, compare all three side by side and record:

- Desktop: outer padding, inner gap, column widths, element order
- Tablet: outer padding, inner gap, font size deltas
- Mobile: stacking order, text alignment, image height, any elements that hide or reorder
- Cards, buttons, dividers: corner radius, borders, shadows — note for markup and cross-check **Visual fidelity** and the same-category file in **`src/landing/_includes/`**

**Before writing any markup:** open [campaign-cart-landing-page-sections `src/landing/_includes/`](https://github.com/NextCommerceCo/campaign-cart-landing-page-sections/tree/main/src/landing/_includes) and skim a partial for the **same section category** (e.g. hero → `hero-*.html`, FAQ → `faq-*.html`) so asset paths, inner max-width, positioning, and **visual treatment** (radius, borders, shadows) match shipped pages.

Only once you have a clear picture of how the layout changes across all three breakpoints should you begin writing HTML. The responsive class decisions (`flex-col md:flex-row`, `hidden md:block`, etc.) should be obvious before you start, not discovered during.

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

**Rule:** After saving any `.svg` file, fix the `preserveAspectRatio` attribute — Figma always exports `preserveAspectRatio="none"` which causes distortion. Change it to `xMidYMid meet`:

```bash
sed -i '' 's/preserveAspectRatio="none"/preserveAspectRatio="xMidYMid meet"/g' assets/images/*.svg
```

```bash
# Photo assets — export manually from Figma (right-click frame → Export)
# Image fills don't surface as URLs in get_design_context output
```

### Step 7 — Preview project structure

```
_data/campaigns.json
src/{campaign-slug}/
  _layouts/base.html          ← Tailwind CDN + tokens stylesheet
  _includes/{section}.html    ← generated partial
  assets/css/tokens.css       ← CSS custom properties for all design tokens
  assets/images/              ← all downloaded Figma assets
  index.html                  ← preview page that campaign_includes the section
```

Run: `npm run dev` → select campaign → `http://localhost:3000/{slug}/`

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

**Refinement loop:** edit `_includes/{section}.html` → save → refresh `compare.html` → spot differences → repeat until it matches.

### After every export — auto-open the compare tool

At the end of every section export, automatically run these three commands. The node IDs are already known from the Figma URLs provided at the start — extract them and use them directly.

```bash
./scripts/save-ref.sh <slug> <section> <desktop-node-id> <tablet-node-id> <mobile-node-id>
npm run compare <slug> <section>
open src/<slug>/_ref/compare.html
```

Use the same `<section>` string for `save-ref.sh` and `npm run compare` so the correct `*-desktop.png` set is used when `_ref/` contains multiple sections.

Node ID format: take the `node-id` query param from the Figma URL and replace `-` with `:` (e.g. `143-10703` → `143:10703`).

This opens the compare page immediately — the developer just needs `npm run dev` running to see the live iframe.

### Common mistakes


| Mistake                                                            | Fix                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixed column widths (`lg:w-[Npx]`)                                 | Use `flex-1` — widths are 1440px reference only                                                                                                                                                                                                                      |
| Right padding on content column                                    | Move to the `max-w` container div                                                                                                                                                                                                                                    |
| Missing inner `max-w-* mx-auto` wrapper                          | **Always required** on the main inner container — without it the section stretches edge-to-edge on wide monitors                                                                                                                                                     |
| Skipping the reference partial in campaign-cart-landing-page-sections | Open **`src/landing/_includes/`** in that repo and skim a same-category partial before coding — aligns assets, positioning, wrapper patterns, and visual treatment                                                                                                      |
| Generic `rounded-md` / `rounded-lg` when reference uses `rounded-[Npx]` | Match the **same section family** in `src/landing/_includes/` — arbitrary radius is often intentional                                                                                                                                    |
| Borders/shadows in Figma or reference, missing in export HTML        | Map strokes to `border*` and effects to `shadow*`; see **Visual fidelity**                                                                                                                                                                                            |
| Large container side padding applied too early                     | For large values like `px-[240px]` or `px-[160px]`, prefer `xl:` over `lg:` unless Figma explicitly requires `lg`                                                                                                                                                    |
| `whitespace-nowrap` on body/bullet text                            | Only use on single-word UI labels                                                                                                                                                                                                                                    |
| Tailwind CDN in section partial                                    | CDN belongs in `_layouts/base.html` only                                                                                                                                                                                                                             |
| CSS tokens defined inline                                          | Always a separate `css/tokens.css`, listed in frontmatter `styles:`                                                                                                                                                                                                  |
| Saving SVG assets as `.png`                                        | Run `file *.png` after download — Figma returns SVG for all vectors; rename to `.svg`                                                                                                                                                                                |
| `campaign_include '_includes/hero.html'`                           | Tag auto-prepends `_includes/` — use just `'hero.html'`                                                                                                                                                                                                              |
| SVG icon stretches or distorts                                     | Figma always exports SVGs with `preserveAspectRatio="none" width="100%" height="100%"` — fix the SVG source: change to `preserveAspectRatio="xMidYMid meet"`. Do this for every downloaded SVG. Setting explicit `w-[N] h-[N]` on the `<img>` alone is not reliable. |
| Arrow/icon points wrong direction                                  | Figma MCP code often wraps icons in `rotate-90` — carry that rotation over as a Tailwind class on the `<img>`                                                                                                                                                        |
| Non-web font (Bayshore, script/display fonts) renders as fallback  | Export the text node as a PNG with `export-node.sh` and use `<img>` instead of a font                                                                                                                                                                                |
| `w-auto` image stretches inside `flex flex-col`                    | `align-items: stretch` overrides `w-auto` — add `self-start` to the `<img>`                                                                                                                                                                                          |
| p-big font size uses `lg:` prefix (`text-[18px] lg:text-[20px]`)   | Tablet is also 20px — always use `md:` prefix: `text-[18px] md:text-[20px]`                                                                                                                                                                                          |
| p-small font size uses `md:` prefix (`text-[14px] md:text-[16px]`) | Tablet stays at 14px — always use `lg:` prefix: `text-[14px] lg:text-[16px]`                                                                                                                                                                                         |


---

## Export Checklist

### Figma Setup

- Section frame named `{category}{number}-{breakpoint}` (e.g. `hero1-desktop`)
- Frame is top-level on the Sections page
- Uses Auto Layout throughout (no absolute positioning)
- Width: Fill or fixed 1440px
- All copy is final (no placeholder text)
- All images named with `img:`, `bg:`, or `img-group:` prefix as appropriate
- Colors reference Figma Color Variables (not hardcoded hex)
- Typography font sizes come from Figma Variables (`--font/size-`*) — read fallback px values from each breakpoint node to determine responsive sizes
- Spacing values align to Tailwind scale (multiples of 4px)
- Description contains valid JSON metadata block
- Desktop + mobile breakpoint variants defined

### Export Output

- Liquid partial generated in `_includes/`
- Inner layout uses **`max-w-[1440px]` or `max-w-7xl`** with **`mx-auto`** (and usually **`w-full`**) on the main content wrapper — verified before handoff
- **Reference partial** in [campaign-cart-landing-page-sections](https://github.com/NextCommerceCo/campaign-cart-landing-page-sections) **`src/landing/_includes/`** reviewed for the same section type (layout, assets, positioning, radius/borders/shadows)
- Radius, borders, shadows checked against Figma and the reference partial — see **Visual fidelity**
- All asset refs use `campaign_asset` filter
- All internal links use `campaign_link` filter
- Text properties do NOT use `| default:` fallbacks — omit them entirely so missing variables are visible during dev/QA rather than silently showing placeholder text in production
- Images exported to `assets/images/`
- CSS generated (Tailwind classes or custom or both)
- JS files listed in section metadata
- Section manifest updated

