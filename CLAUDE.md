# Figma Design Framework — Export Tool

This repo builds an export script that reads a Figma file via the REST API and generates production-ready HTML/Liquid partials for the `next-campaign-page-kit` framework.

**Figma file:** https://www.figma.com/design/ia7650Y3lLte4WVYARNvSX/Debranded-Sections

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

Get your Figma personal access token: Figma → Account Settings → Personal Access Tokens → Generate.

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

## Core Principle

Every Figma frame, component property, style, and naming convention maps 1:1 to a framework concept. The designer's work IS the developer spec. No interpretation needed.

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

| Figma Concept | Framework Output | Location |
|---|---|---|
| Section Frame | Liquid partial | `_includes/{name}.html` |
| Atomic Component | Nested partial | `_includes/_components/{name}.html` |
| Component Property (text) | Liquid variable | `{{ variable_name }}` |
| Component Property (boolean) | Liquid conditional | `{% if show_badge %}...{% endif %}` |
| Component Property (instance swap) | Nested include | `{% campaign_include '...' %}` |
| Variant Property | CSS class or responsive prefix | `md:flex-row` |
| Color Style | CSS custom property | `var(--brand-primary)` |
| Typography Style | CSS class | `.heading-1` |
| Auto Layout | Flex/Grid CSS | `flex flex-col gap-4` |
| Image Fill | Asset + filter | `{{ 'images/x.jpg' \| campaign_asset }}` |
| Link annotation | Link + filter | `{{ 'page.html' \| campaign_link }}` |
| Page Frame | Page HTML + frontmatter | `presale.html` |

---

## Figma File Structure

```
Figma File: "Debranded Sections"
├── Tokens        — Colors, typography, spacing, effects
├── Components    — Atomic/reusable components (buttons, badges, inputs)
├── Sections      — Exportable section components (ONLY THIS PAGE IS EXPORTED)
├── Pages         — Assembled page compositions (reference only)
└── Sandbox       — Experiments (not exported)
```

---

## Naming Conventions (the contract)

| Figma Element | Convention | Example | Maps To |
|---|---|---|---|
| Section frame | `section/{name}` | `section/hero-banner` | `_includes/hero-banner.html` |
| Atomic component | `component/{name}` | `component/cta-button` | `_includes/_components/cta-button.html` |
| Component property | `snake_case` | `headline_text` | `{{ headline_text }}` |
| Boolean property | `show_{element}` | `show_badge` | `{% if show_badge %}` |
| Contained image | `img:{filename}` | `img:hero-product` | `<img>` + `object-contain` |
| Background image | `bg:{filename}` | `bg:hero-bg` | CSS `background-image` |
| Link annotation | `link:{target}` | `link:checkout` | `{{ 'checkout.html' \| campaign_link }}` |
| Variant property | `breakpoint` | `breakpoint=desktop` | Responsive CSS breakpoint |
| Color style | `brand/{name}` | `brand/primary` | `--brand-primary` |
| Typography style | `text/{role}` | `text/heading-1` | `.text-heading-1` |

### Frame Name Prefixes

| Prefix | Behavior |
|---|---|
| `section/` | Exported as standalone Liquid partial in `_includes/` |
| `component/` | Exported as reusable sub-partial in `_includes/_components/` |
| `page/` | Defines page composition order and frontmatter (Pages page only) |
| `_` (underscore) | Ignored by export script |

---

## Section Frame Requirements

| Requirement | Required? |
|---|---|
| Name follows `section/{kebab-case}` | Required |
| Top-level frame (not nested) | Required |
| Uses Auto Layout | Required |
| Width: Fill container or fixed 1440px | Required |
| `breakpoint` variant (desktop + mobile) | Recommended |
| Component properties for dynamic content | Required |
| Description field contains metadata JSON | Recommended |

### Section Description Metadata (JSON in description field)

```json
{
  "section_id": "hero-banner",
  "category": "hero",
  "scripts": [],
  "styles": ["css/sections.css"],
  "wrapper_tag": "section",
  "wrapper_class": "section-hero",
  "container": true
}
```

Categories: `hero`, `content`, `cta`, `social-proof`, `faq`, `footer`

---

## Component Properties → Liquid Variables

| Figma Property Type | Liquid Output |
|---|---|
| Text | `{{ headline }}` |
| Boolean | `{% if show_badge %} ... {% endif %}` |
| Instance Swap | `{% campaign_include '_components/...' %}` |
| Variant | `class="section--{{ variant }}"` |

All properties use `snake_case`. Spaces in Figma property names are converted: `Headline Text` → `headline_text`.

---

## The Three Essential Filters

**`campaign_asset`** — resolves relative paths to campaign directory:
```liquid
{{ 'images/hero.jpg' | campaign_asset }}  → /campaign-slug/images/hero.jpg
{{ 'css/global.css' | campaign_asset }}   → /campaign-slug/css/global.css
```

**`campaign_link`** — generates clean internal URLs:
```liquid
{{ 'checkout.html' | campaign_link }}  → /campaign-slug/checkout/
{{ '#pricing' | campaign_link }}       → #pricing (anchors pass through)
```

**`campaign_include`** — renders a partial with named args:
```liquid
{% campaign_include 'hero-banner.html' headline="Welcome" cta_text="Buy Now" %}
{% campaign_include '_components/cta-button.html' text=btn_text url=btn_url %}
```

---

## Auto Layout → CSS Mapping

| Figma Auto Layout Property | Tailwind Output |
|---|---|
| Direction: Horizontal | `flex flex-row` |
| Direction: Vertical | `flex flex-col` |
| Wrap: Yes | `flex-wrap` |
| Gap: 16px | `gap-4` |
| Padding: 24px all | `p-6` |
| Padding: 16px h / 24px v | `px-4 py-6` |
| Align items: Center | `items-center` |
| Justify: Space between | `justify-between` |
| Child: Fill container | `flex-1` |
| Max width constraint | `max-w-7xl mx-auto` |

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

---

## Responsive Variants

Every section has a `breakpoint` variant:

| Variant | CSS Breakpoint | Figma Frame Width |
|---|---|---|
| `mobile` | Default (no prefix) | 375px |
| `tablet` | `md:` (768px+) | 768px |
| `desktop` | `lg:` (1024px+) | 1440px |

Script compares mobile/desktop variants and generates responsive classes:
- Mobile vertical + desktop horizontal → `flex flex-col lg:flex-row`
- Mobile 1-col + desktop 3-col → `grid grid-cols-1 lg:grid-cols-3`
- Hidden mobile, visible desktop → `hidden lg:block`

---

## Design Tokens

### Colors (Figma Color Styles → CSS custom properties)

| Figma Style Name | CSS Custom Property |
|---|---|
| `brand/primary` | `--brand-primary` |
| `brand/secondary` | `--brand-secondary` |
| `brand/accent` | `--brand-accent` |
| `surface/background` | `--surface-bg` |
| `surface/card` | `--surface-card` |
| `surface/alt` | `--surface-alt` |
| `text/primary` | `--text-primary` |
| `text/secondary` | `--text-secondary` |
| `text/inverse` | `--text-inverse` |
| `border/default` | `--border-default` |
| `state/success` | `--state-success` |
| `state/warning` | `--state-warning` |
| `state/error` | `--state-error` |

### Typography (Figma Text Styles)

| Style | Size / Weight / Line Height | CSS Class |
|---|---|---|
| `text/display` | 48px / 700 / 1.1 | `.text-display` |
| `text/heading-1` | 36px / 700 / 1.2 | `.text-heading-1` |
| `text/heading-2` | 28px / 700 / 1.3 | `.text-heading-2` |
| `text/heading-3` | 22px / 600 / 1.4 | `.text-heading-3` |
| `text/body-lg` | 18px / 400 / 1.7 | `.text-body-lg` |
| `text/body` | 16px / 400 / 1.7 | `.text-body` |
| `text/body-sm` | 14px / 400 / 1.6 | `.text-body-sm` |
| `text/caption` | 12px / 500 / 1.5 | `.text-caption` |
| `text/overline` | 12px / 700 / 1.5 / uppercase | `.text-overline` |

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

### Two Image Patterns — Designer Must Choose One

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

#### Why not use the raw asset URL from `get_design_context`?

The MCP returns the **original uploaded source file** — not what Figma renders on canvas. A designer can upload a 1500px wide image, crop it in the frame with offset positioning, and the raw asset URL still gives you the 1500px original. Always use `export-node.sh` to get the canvas-rendered version.

| Source | What you get |
|---|---|
| `imgRectangle730` URL from `get_design_context` | Original uploaded file — wrong size, un-cropped |
| `export-node.sh {node-id}` | Canvas-rendered PNG — correctly cropped and sized |

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

JS is section-scoped. Each interactive section gets its own file.

| Interaction | JS File |
|---|---|
| FAQ accordion | `js/faq-accordion.js` |
| Testimonial slider | `js/testimonial-slider.js` |
| Countdown timer | `js/countdown.js` |
| Before/after slider | `js/before-after.js` |
| Sticky bar | `js/sticky-bar.js` |
| Video modal | `js/video-modal.js` |

Use `data-*` attributes as JS hooks (never class names):
```html
<div data-faq-item data-open="false">
  <button data-faq-toggle>{{ question }}</button>
  <div data-faq-answer style="max-height: 0; overflow: hidden;">{{ answer }}</div>
</div>
```

---

## Page Frontmatter Fields

| Field | Required | Description |
|---|---|---|
| `title` | Yes | Page `<title>` |
| `page_type` | Yes | `product`, `checkout`, `upsell`, `receipt` |
| `page_layout` | No | Layout file (default: `base.html`) |
| `styles` | No | CSS files array |
| `scripts` | No | JS files array |
| `next_success_url` | No | Redirect after checkout |
| `next_upsell_accept` | No | Redirect on upsell accept |
| `next_upsell_decline` | No | Redirect on upsell decline |
| `footer` | No | Include footer boolean |

---

## Standard Section Catalog

| Section | Frame Name | Category | JS? |
|---|---|---|---|
| Hero Banner | `section/hero-banner` | hero | No |
| Social Proof Bar | `section/social-proof-bar` | social-proof | No |
| Product Features | `section/product-features` | content | No |
| Before & After | `section/before-after` | content | Yes |
| Testimonials | `section/testimonials` | social-proof | Slider |
| Ingredients / How It Works | `section/ingredients` | content | No |
| FAQ Accordion | `section/faq-accordion` | faq | Yes |
| CTA Strip | `section/cta-strip` | cta | No |
| Guarantee | `section/guarantee` | trust | No |
| Pricing Table | `section/pricing-table` | cta | No |
| Video Section | `section/video-section` | content | Yes |
| Countdown Timer | `section/countdown` | urgency | Yes |
| Footer | `section/footer` | footer | No |

---

## Figma API Fields the Export Script Reads

| API Field | Purpose |
|---|---|
| `node.name` | Frame name → output filename |
| `node.componentPropertyDefinitions` | Properties → Liquid variables |
| `node.description` | JSON metadata → export config |
| `node.children` | Child nodes → HTML structure |
| `node.layoutMode` | `HORIZONTAL`/`VERTICAL` → `flex-row`/`flex-col` |
| `node.itemSpacing` | Gap → `gap-{n}` |
| `node.paddingLeft/Right/Top/Bottom` | Padding → `p-{n}` |
| `node.primaryAxisAlignItems` | Justify content |
| `node.counterAxisAlignItems` | Align items |
| `node.fills` | Background colors/images |
| `node.styles` | References to color/text styles |

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
        { "name": "headline", "type": "text", "default": "Your Headline" },
        { "name": "cta_url", "type": "link", "filter": "campaign_link" },
        { "name": "background_image", "type": "image", "filter": "campaign_asset" },
        { "name": "show_badge", "type": "boolean", "default": true }
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

### Step 1 — Fetch all 3 breakpoint nodes in parallel

Every section has desktop, tablet, and mobile variants. Always fetch all three at once with `get_design_context` before writing any HTML. Note from each variant:
- Desktop: outer padding, inner gap, column widths
- Tablet: outer padding, inner gap, font size deltas
- Mobile: stacking order, text alignment, image height

### Step 2 — Use the 4-layer HTML structure (always)

```
<section>              ← bg color, overflow-hidden, full-width
  <div> container      ← max-w-[1440px] mx-auto + Figma outer padding (right only)
    <div> content      ← flex-col md:flex-row + gap values from inner Figma node
      [components]     ← image column, content column, sub-components
```

Mapping Figma nodes to layers:
| Figma Node | HTML Layer | Key Properties |
|---|---|---|
| Section frame (outer, e.g. `143:10518`) | `<section>` | `bg-*`, `overflow-hidden` |
| Section frame padding | Container `div` | `max-w-[1440px] mx-auto md:pr-[N] lg:pr-[N]` |
| Inner flex node (e.g. `143:10519`) | Content `div` | `flex flex-col md:flex-row md:gap-[N] lg:gap-[N]` |
| Child column nodes | Components | `md:flex-1` per column |

### Step 3 — Responsive column rules

Figma pixel widths are 1440px reference values — never hard-code them as flex column widths.

| ❌ Wrong | ✅ Correct |
|---|---|
| `lg:w-[680px] lg:flex-none` on image | `md:flex-1` |
| `lg:w-[580px] lg:flex-none` on content | `md:flex-1` |
| `w-[440px]` on CTA block | `md:max-w-[440px] w-full` |
| `w-[475px]` on heading | remove — let it wrap naturally |

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

Save a PNG of each breakpoint node for visual reference during HTML authoring and future review. These live in `src/{campaign}/_ref/` (gitignored — local only).

```bash
./scripts/save-ref.sh section-preview hero-2 143:10703 143:10748 143:13028
```

Requires `FIGMA_ACCESS_TOKEN` in a `.env` file (copy `.env.example` → `.env`). Get your token from Figma → Account Settings → Personal Access Tokens.

Output:
```
src/{campaign}/_ref/
  hero-2-desktop.png
  hero-2-tablet.png
  hero-2-mobile.png
```

Use these images when writing HTML to compare the output against the Figma design at each breakpoint.

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

### Common mistakes

| Mistake | Fix |
|---|---|
| Fixed column widths (`lg:w-[Npx]`) | Use `flex-1` — widths are 1440px reference only |
| Right padding on content column | Move to the `max-w` container div |
| Missing `max-w-[1440px] mx-auto` wrapper | Always required — this is what caps layout width |
| `whitespace-nowrap` on body/bullet text | Only use on single-word UI labels |
| Tailwind CDN in section partial | CDN belongs in `_layouts/base.html` only |
| CSS tokens defined inline | Always a separate `css/tokens.css`, listed in frontmatter `styles:` |
| Saving SVG assets as `.png` | Run `file *.png` after download — Figma returns SVG for all vectors; rename to `.svg` |
| `campaign_include '_includes/hero.html'` | Tag auto-prepends `_includes/` — use just `'hero.html'` or `'_components/btn.html'` |

---

## Export Checklist

### Figma Setup
- Section frame named `section/{kebab-case}`
- Frame is top-level on the Sections page
- Uses Auto Layout throughout (no absolute positioning)
- Width: Fill or fixed 1440px
- All dynamic text uses component properties (snake_case)
- All toggle elements use boolean properties (`show_*`)
- All images named with `img:` prefix
- Colors reference Figma Color Styles (not hardcoded hex)
- Typography references Figma Text Styles
- Spacing values align to Tailwind scale (multiples of 4px)
- Description contains valid JSON metadata block
- Desktop + mobile breakpoint variants defined

### Export Output
- Liquid partial generated in `_includes/`
- All asset refs use `campaign_asset` filter
- All internal links use `campaign_link` filter
- Sub-components use `campaign_include`
- Boolean properties wrapped in `{% if %}` blocks
- Text properties have `| default:` fallbacks
- Images exported to `assets/images/`
- CSS generated (Tailwind classes or custom or both)
- JS files listed in section metadata
- Section manifest updated
