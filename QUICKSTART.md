# Quickstart

Export sections from any Figma file built on the Sellmore design framework to production-ready Liquid partials for `next-campaign-page-kit`.

---

## Before you start

**Check your Figma file is compatible.**
This tool works with any Figma file that follows the Sellmore design framework. Open your file and confirm:

- There is a **Sections** page
- Section frames are named `section/{kebab-case}` (e.g. `section/hero-banner`)
- Each section has a **`breakpoint` variant** with desktop, tablet, and mobile frames
- Component properties use `snake_case` for text (`headline_text`)
- Image layers are prefixed `img:`, `bg:`, or `img-group:`

If you're working from the [Debranded Sections](https://www.figma.com/design/ia7650Y3lLte4WVYARNvSX/Debranded-Sections) master file or a client file branched from it, you're set.

**Choose a slug for the landing page.**
The slug is a short kebab-case name for the whole page — not per section. All sections from that page will live inside it. Pick it once and use it for every export on this page.

```
src/{slug}/
  _includes/
    hero.html       ← each section added here
    benefits.html
    faq.html
  index.html        ← assembles all sections in order
  assets/
```

---

## 1. Clone and install

```bash
git clone https://github.com/Sellmore-Co/figma-sections-export
cd figma-sections-export
npm install
```

---

## 2. Add your Figma token

```bash
cp .env.example .env
```

Open `.env` and paste your Figma personal access token.

Get one at: **Figma → Account Settings → Personal Access Tokens → Generate new token**
Scopes needed: **File content** (read) + **File metadata** (read).

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

---

## 5. Paste the links into Claude Code

Always tell Claude the slug and section name. For the first section:

```
Export this as the hero section in novaburn-presale:
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX   ← desktop
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX   ← tablet
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX   ← mobile
```

For every section after that, use the same slug:

```
Add this as the faq section to novaburn-presale:
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX
```

Claude will:
- Fetch all 3 breakpoints in parallel
- Save reference screenshots to `src/{slug}/_ref/`
- Generate a responsive Liquid partial in `src/{slug}/_includes/`
- Download all Figma assets (icons, images) to `src/{slug}/assets/images/`
- Append the section to `src/{slug}/index.html`

---

## 6. Preview

```bash
npm run dev
```

Select your campaign from the list → browser opens at `http://localhost:3000/{slug}/` with live reload. Re-run after each new section to see the page grow.

---

## 7. Compare against Figma

After exporting a section, generate a side-by-side comparison of the Figma ref and your live output:

```bash
npm run compare <slug>
open src/<slug>/_ref/compare.html
```

The compare page loads the Figma reference screenshot on the left and the live dev server in an iframe on the right at all 3 breakpoints. Press `D` / `T` / `M` to switch. Edit your HTML, refresh, repeat until it matches.

---

## Output

| File | Purpose |
|---|---|
| `src/{slug}/_includes/{section}.html` | Liquid partial for one section |
| `src/{slug}/assets/css/tokens.css` | CSS custom properties for design tokens |
| `src/{slug}/assets/images/` | Exported Figma assets |
| `src/{slug}/_ref/` | Reference screenshots per breakpoint (local only) |
| `src/{slug}/index.html` | Preview page — includes all exported sections in order |
