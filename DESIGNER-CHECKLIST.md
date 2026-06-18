# Figma Handoff Checklist — Designer

Share this checklist with the designer before export begins. Every item must be checked before handing off.

---

## File access — required before export can begin

The export tool accesses your Figma file via the API. A standard shared link is not enough — one of the following must be true:

- **Link sharing is set to "Anyone with the link"** — in Figma: Share → under the link, set to "Anyone with the link — can view"
- **OR the developer's Figma account is added as a viewer** — Share → Invite → add their email

> Without this, the export tool will return a "cannot access file" error even if the link opens fine in a browser.

---

## File structure

- File has a **Sections** page
- Section frames are **top-level** on the Sections page — not nested inside other frames
- Section frames follow the naming pattern `{category}{number}-{breakpoint}` — e.g. `hero1-desktop`, `hero1-tablet`, `hero1-mobile`. This matches the category and variant number in the external reference, [campaign-cart-starter-templates `src/landing`](https://github.com/NextCommerceCo/campaign-cart-starter-templates/tree/main/src/landing), and determines the export filename (e.g. `hero1` → `hero-1.html`)

### When assembling a full page for export

- Place the section frames inside **one page wrapper frame**, stacked in **top-to-bottom page order** — this is how the export reads the section sequence
- Keep each section's **three breakpoint frames together** — don't park a mobile frame elsewhere on the canvas. A breakpoint that lives outside the wrapper gets missed or wrongly derived from another breakpoint
- **Delete or archive stale/duplicate variant frames.** Two frames with the same name (e.g. three copies of `nav2-desktop`) cause the wrong one to be exported

> If the file has duplicate-named frames or breakpoints scattered outside the wrapper, the export will pause and ask you to either point at the canonical wrapper frame or tidy the file first.

---

## Breakpoint variants

Every section must have a `breakpoint` variant with exactly three frames:

- `desktop` — 1440px wide
- `tablet` — 768px wide
- `mobile` — 375px wide
- All three frames are complete — not just a desktop with a half-finished mobile

---

## Layout

- Every frame and column uses **Auto Layout** — no absolute positioning anywhere
- Section frame width is **Fill container** or fixed **1440px**
- Spacing values (gap, padding) use the **spacing variables** from the design system — do not enter custom px values

---

## Text content

- All copy is **final** before handoff — Claude reads text content directly from layers and uses it to generate Liquid variable names. Placeholder text ("Lorem ipsum", "Headline goes here") will produce meaningless variable names in the export.

---

## Images

Every image layer must be named with one of three prefixes. Pick the right one — the wrong prefix will produce a broken export.


| Prefix       | When to use                                                                   | Example                    |
| ------------ | ----------------------------------------------------------------------------- | -------------------------- |
| `img:`       | Product, person, illustration — a discrete visual that sits alongside content | `img:hero-product`         |
| `bg:`        | Decorative fill behind a section or column — content overlays it              | `bg:hero-bg`               |
| `img-group:` | Multiple layers (phone + badge + product + overlay) composed into one visual  | `img-group:hero-composite` |


- Every image layer in every section uses one of these prefixes
- `bg:` images are placed as **fills on the section or column frame** — not as a floating layer
- `img:` images are **fully contained within their frame** — no bleed, no offset, transparent PNG background, full subject visible
- `img-group:` has a **single parent group/frame** that wraps all child layers — export targets the parent, not the children
- **Blended / multi-fill backgrounds:** if a background is built from **multiple stacked fills** on one frame, or uses **opacity or a blend mode**, the export tool cannot reconstruct it reliably (it sees one flat fill and loses the blend). **Provide a single flattened PNG** of that background, or split it into per-column `bg:` fills — and flag it to the developer before handoff

---

## Colors

- All colors reference **Figma Color Variables** — no hardcoded hex values
- Color variables follow the naming convention: `brand/primary`, `brand/secondary`, `surface/background`, `text/primary`, etc.

---

## Typography

- Font sizes use **Figma Variables** (`--font/size-heading1`, `--font/size-p-medium`, etc.)
- Fallback px values are correct per breakpoint (the export reads these directly to generate responsive classes)

---

## Fonts

- All fonts are **web-safe or Google Fonts** (Plus Jakarta Sans, Inter, etc.)
- If the design uses a display or script font that won't load in a browser (e.g. a custom brand script), **flag it to the developer before handoff** — the text will be exported as an image rather than live text
