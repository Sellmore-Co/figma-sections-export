# Quickstart

Export sections from any Figma file built on the Sellmore design framework to production-ready Liquid partials for `next-campaign-page-kit`.

---

## Before you start

**New designer?**
Use [DESIGNER-WORKFLOW.md](./DESIGNER-WORKFLOW.md) for the short, non-technical path. This quickstart includes more implementation detail.

**Check your Figma file is compatible.**
This tool works with any Figma file that follows the Sellmore design framework. Open your file and confirm:

- There is a **Sections** page
- Section frames follow `{category}{number}-{breakpoint}` naming (e.g. `hero1-desktop`, `hero1-tablet`, `hero1-mobile`)
- Each section has a **`breakpoint` variant** with desktop, tablet, and mobile frames
- Component properties use `snake_case` for text (`headline_text`)
- Image layers are prefixed `img:`, `bg:`, or `img-group:`

If you're working from the [Debranded Sections](https://www.figma.com/design/ia7650Y3lLte4WVYARNvSX/Debranded-Sections) master file or a client file branched from it, you're set.

**Choose a slug for the campaign.**
The slug is a short kebab-case name for the whole campaign — not per section. Landing sections and any presell page for that campaign live inside the same slug.

**Interactive sections** (sliders, accordions, sticky CTAs, icon marquees): mirror behaviour and `data-*` markup from the external reference, [campaign-cart-starter-templates `src/landing`](https://github.com/NextCommerceCo/campaign-cart-starter-templates/tree/main/src/landing), especially `_includes/` and `assets/js/landing.js` — see [CLAUDE.md — Reference behaviour](./CLAUDE.md#reference-behaviour-interactivity--responsive).

**Figma rate limits:** MCP fetches, `save-ref.sh`, and `export-node.sh` all consume Figma quota. Fetch breakpoints once per section, avoid re-fetching during refinement, stagger image renders, and skip `save-ref` when `_ref/` screenshots are already up to date — see [CLAUDE.md — Figma API rate limits & hygiene](./CLAUDE.md#figma-api-rate-limits--hygiene).

```
src/{slug}/
  _layouts/
    base-landing.html
  _includes/
    landing/
      hero-1.html       ← each landing section added here
      benefits-2.html
      faq-1.html
  landing.html        ← assembles landing sections in order; opened by entry_url
  presell.html        ← optional standalone advertorial page
  assets/
    js/landing.js
    images/{section}/
    images/presell/
```

---

## 1. Clone and install

```bash
git clone https://github.com/Sellmore-Co/figma-sections-export
cd figma-sections-export
npm install
```

The project uses the current public `next-campaign-page-kit` package from [NextCommerceCo/campaign-page-kit](https://github.com/NextCommerceCo/campaign-page-kit). For a fresh production campaign repo, `campaign-init --ai-context codex` can also generate the latest upstream `AGENTS.md`; this export repo keeps additional Figma-specific rules on top.

---

## 2. Add your Figma token

```bash
cp .env.example .env
```

Open `.env` and paste your Figma personal access token.

Get one at: **Figma → Account Settings → Personal Access Tokens → Generate new token**
Scopes needed: Files → **Read the contents of and render images from files** + Files → **Read metadata of files**

---

## 3. Open Claude Code

```bash
claude .
```

Make sure the Figma MCP plugin is active — you'll see it listed in the available tools on startup.

> First time? See [CLAUDE.md](./CLAUDE.md) for full setup including the Figma MCP plugin.

---

## 4. In Figma, find the section's 3 breakpoint frames

Go to the **Sections** page of your Figma file. Find the section you want to export — it will have three variant frames: desktop, tablet, and mobile.

Click each frame and press **Cmd+L** (Mac) or **Ctrl+L** (Windows) to copy its link.

For presells, copy the desktop/tablet/mobile frames for the presell page. Presells export to a full page (`presell.html`), not to `_includes/`.

---

## 5. Paste the links into Claude Code

Tell Claude the slug. The section name should come from the selected Figma frame name, so `problemsolution2-desktop` becomes `problemsolution-2`. For the first section:

```
Export this landing section in novaburn-presale:
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX   ← desktop
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX   ← tablet
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX   ← mobile
```

For every section after that, use the same slug:

```
Add this landing section to novaburn-presale:
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX
```

Claude will:
- Fetch all 3 breakpoints in parallel
- Save reference screenshots to `src/{slug}/_ref/`
- Generate a responsive Liquid partial in `src/{slug}/_includes/landing/`
- Download all Figma assets (icons, images) to `src/{slug}/assets/images/{section}/`
- Append the section to `src/{slug}/landing.html`

New landing campaigns receive a shared `assets/js/landing.js` copied from `templates/landing/assets/js/landing.js`, so sliders and accordions use the same behavior contract across sections. The included countdown helper is a landing-only fallback; promo/checkout timers should use the campaign-cart/web-component timer pattern from the checkout templates.

For a presell, ask for a presell page export instead:

```
Export this as the presell page in novaburn-presale:
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX
```

Claude will generate `src/{slug}/presell.html` using `base-presell.html`, `images/presell/`, `next_url`, and the advertorial structure from the public starter templates.

If you paste only three Figma links with no context, the agent should ask for three missing details before exporting:

```text
Campaign slug:
Type: landing section or presell page?
```

It should infer the section/page name from Figma. If the frame name cannot be read or does not follow the standard `{category}{number}-{breakpoint}` pattern, then the agent should ask for the name as a fallback.

---

## 6. Preview

```bash
npm run dev
```

Select your campaign from the list → browser opens the configured `entry_url`, usually `http://localhost:3000/{slug}/landing/` or `http://localhost:3000/{slug}/presell/`, with live reload. Re-run after each new section to see the page grow.

---

## 7. Compare against Figma

After exporting a section, generate a side-by-side comparison of the Figma ref and your live output:

```bash
npm run compare <slug>
npm run compare <slug> 3001
npm run compare <slug> <ref-prefix>
npm run compare <slug> <ref-prefix> 3001
open src/<slug>/_ref/compare.html
```

`<ref-prefix>` is the part before `-desktop.png` / `-tablet.png` / `-mobile.png` in `_ref/` (the same name you pass to `save-ref.sh` as `<section>`). If you omit it and more than one ref set exists, the tool picks alphabetically first and prints a warning — pass `<ref-prefix>` to choose explicitly. If the second argument is numeric only, it is treated as the dev server port (same as before).

The compare page loads the Figma reference screenshot on the left and the live dev server in an iframe on the right at all 3 breakpoints. Press `D` / `T` / `M` to switch. Edit your HTML, refresh, repeat until it matches.

After each landing section export, the agent should ask whether the page is complete or whether there are more sections to export. Final handoff should only run after you confirm the page is complete. For presell pages, the agent can offer final handoff immediately.

---

## 8. Validate the export

Run validation before handoff:

```bash
npm run validate -- <slug>
```

This catches broken Liquid, flat image paths, un-prefixed variables, per-section JS drift, missing Swiper/accordion data hooks, and presell pages that do not follow the reference article structure.

It also warns when landing partials contain hardcoded visible copy. The goal is for Figma text, CTA labels, review quotes, and alt text to live in `landing.html` / `presell.html` frontmatter as editable campaign fields.

---

## 9. Prepare developer handoff

When the page is ready, run the handoff check:

```bash
npm run handoff -- <slug>
```

If `_ref/` contains screenshots for multiple sections, pass the section you want to compare:

```bash
npm run handoff -- <slug> <ref-prefix>
```

This runs validation, generates a compare page when it can, and compresses final images once. Compression is intentionally final-handoff only; avoid running it after every visual tweak.

Compression only touches final handoff assets:

```text
src/<slug>/assets/images/
```

It does not compress `_ref/` comparison screenshots or other campaigns.

To inspect what name a Figma frame will export as:

```bash
npm run infer -- "<Figma selection link>"
```

---

## Output

| File | Purpose |
|---|---|
| `src/{slug}/landing.html` | Drop-in landing page for developer handoff |
| `src/{slug}/_includes/landing/{section}.html` | Landing partial namespaced to avoid checkout include collisions |
| `src/{slug}/presell.html` | Standalone advertorial presell page |
| `src/{slug}/assets/css/tokens.css` | CSS custom properties for design tokens |
| `src/{slug}/assets/js/landing.js` | Shared landing section behavior copied from `templates/landing/assets/js/landing.js` |
| `src/{slug}/assets/images/{section}/` | Exported Figma assets namespaced by section |
| `src/{slug}/_ref/` | Reference screenshots per breakpoint (local only) |
