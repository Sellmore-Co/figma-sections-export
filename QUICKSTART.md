# Quickstart

Export sections from any Figma file built on the Sellmore design framework to production-ready Liquid partials for `next-campaign-page-kit`.

---

## Before you start — check your Figma file

This tool works with any Figma file that follows the Sellmore design framework. Open your file and confirm:

- There is a **Sections** page
- Section frames are named `section/{kebab-case}` (e.g. `section/hero-banner`)
- Each section has a **`breakpoint` variant** with desktop, tablet, and mobile frames
- Component properties use `snake_case` for text (`headline_text`) and `show_*` for booleans (`show_badge`)
- Image layers are prefixed `img:`, `bg:`, or `img-group:`

If you're working from the [Debranded Sections](https://www.figma.com/design/ia7650Y3lLte4WVYARNvSX/Debranded-Sections) master file or a client file branched from it, you're set.

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

This token is used to download reference screenshots of each section at each breakpoint.

---

## 3. Open Claude Code

```bash
claude .
```

Make sure the Figma MCP plugin is active — you'll see it listed in the available tools on startup.

> First time? See [CLAUDE.md](./CLAUDE.md) for full setup including the Figma MCP plugin.

---

## 4. In Figma, find your section's 3 breakpoint frames

Go to the **Sections** page of your Figma file. Find the section you want to export — it will have three variant frames: desktop, tablet, and mobile.

Click each frame and press **Cmd+L** (Mac) or **Ctrl+L** (Windows) to copy its link. You'll end up with 3 URLs from your file:

```
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX   ← desktop
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX   ← tablet
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX   ← mobile
```

---

## 5. Choose a slug and paste the links into Claude Code

The **slug** is a short kebab-case name you choose — it becomes the campaign folder (`src/{slug}/`) and the preview URL (`localhost:3000/{slug}/`). Use the section name or a descriptive label.

```
Export this section as hero-banner:
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX
https://www.figma.com/design/{your-file-key}/...?node-id=XXX-XXXX
```

Claude will:
- Fetch all 3 breakpoints in parallel
- Save reference screenshots to `src/{slug}/_ref/`
- Generate a responsive Liquid partial in `src/{slug}/_includes/`
- Download all Figma assets (icons, images) to `src/{slug}/assets/images/`
- Set up the preview campaign

---

## 6. Preview

```bash
npm run dev
```

Select your campaign from the list → browser opens at `http://localhost:3000/{slug}/` with live reload.

---

## Output

| File | Purpose |
|---|---|
| `src/{slug}/_includes/{section}.html` | Liquid partial — drop into any campaign |
| `src/{slug}/assets/css/tokens.css` | CSS custom properties for design tokens |
| `src/{slug}/assets/images/` | Exported Figma assets |
| `src/{slug}/_ref/` | Reference screenshots per breakpoint (local only) |
| `src/{slug}/index.html` | Preview page |
