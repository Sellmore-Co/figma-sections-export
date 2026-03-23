# figma-sections-export

Export sections from any Figma file built on the Sellmore design framework to production-ready Liquid partials for [`next-campaign-page-kit`](https://www.npmjs.com/package/next-campaign-page-kit).

Each section is fetched at three breakpoints (desktop, tablet, mobile) via the Figma MCP plugin inside Claude Code, then converted to a responsive HTML/Liquid partial with Tailwind utility classes, CSS custom property tokens, and campaign filters (`campaign_asset`, `campaign_link`, `campaign_include`).

---

## How it works

A landing page is made up of multiple sections (hero, FAQ, CTA, etc.). You export them one at a time — AI handles one section reliably; a whole page at once is too much.

All sections from the same page share one **slug** — a short kebab-case name you choose for the campaign (e.g. `novaburn-presale`). Each exported section becomes a partial inside that slug's `_includes/` folder. The slug's `index.html` assembles them in order.

```
src/novaburn-presale/
  _includes/
    hero.html        ← exported first
    benefits.html    ← exported second
    faq.html         ← exported third
  index.html         ← includes all three in order
  assets/
    css/tokens.css
    images/
```

---

## Compatible Figma files

This tool works with any Figma file that follows the Sellmore design framework conventions. Before starting, confirm your file has:

- A **Sections** page with section frames named `section/{kebab-case}` (e.g. `section/hero-banner`)
- Each section has a **`breakpoint` variant** with desktop, tablet, and mobile frames
- Component properties use `snake_case` for text and `show_*` for booleans
- Image layers are prefixed `img:`, `bg:`, or `img-group:`

If you're working from the [Debranded Sections](https://www.figma.com/design/ia7650Y3lLte4WVYARNvSX/Debranded-Sections) master file or a file branched from it, you're good to go.

---

## Quickstart

**1. Clone and install**
```bash
git clone https://github.com/Sellmore-Co/figma-sections-export
cd figma-sections-export
npm install
```

**2. Add your Figma token**
```bash
cp .env.example .env
# paste your token — Figma → Account Settings → Personal Access Tokens
# scopes: File content (read) + File metadata (read)
```

**3. Open Claude Code**
```bash
claude .
```
On startup, Claude Code lists active MCP servers. You should see:
```
✓ figma (mcp)
```
If it's missing, install the plugin once:
```bash
claude mcp add --name figma https://mcp.figma.com/mcp
```
Then restart Claude Code. You'll know it's working when Claude can call `get_design_context` and return a live screenshot directly from a Figma URL.

**4. Choose a slug for the page, then export sections one at a time**

Pick a slug for the whole landing page. Then for each section, copy 3 Figma links (desktop, tablet, mobile) with **Cmd+L** and tell Claude the slug and section name:
```
Export this as the hero section in novaburn-presale:
https://www.figma.com/design/{fileKey}/...?node-id=XXX-XXXX
https://www.figma.com/design/{fileKey}/...?node-id=XXX-XXXX
https://www.figma.com/design/{fileKey}/...?node-id=XXX-XXXX
```

Each subsequent section goes into the same slug:
```
Add this as the faq section to novaburn-presale:
https://www.figma.com/design/{fileKey}/...?node-id=XXX-XXXX
https://www.figma.com/design/{fileKey}/...?node-id=XXX-XXXX
https://www.figma.com/design/{fileKey}/...?node-id=XXX-XXXX
```

**5. Preview**
```bash
npm run dev
```

→ See [QUICKSTART.md](./QUICKSTART.md) for the full step-by-step guide.

---

## Output

| File | Purpose |
|---|---|
| `src/{slug}/_includes/{section}.html` | Liquid partial for one section |
| `src/{slug}/assets/css/tokens.css` | CSS custom properties for design tokens |
| `src/{slug}/assets/images/` | Exported Figma assets |
| `src/{slug}/_ref/` | Reference screenshots per breakpoint (local only) |
| `src/{slug}/index.html` | Preview page — includes all exported sections |

---

## Scripts

| Script | Purpose |
|---|---|
| `scripts/save-ref.sh` | Download reference screenshots for each breakpoint |
| `scripts/export-node.sh` | Export a Figma node as canvas-rendered PNG (respects crop/frame) |

---

## Docs

- [QUICKSTART.md](./QUICKSTART.md) — setup and first export
- [CLAUDE.md](./CLAUDE.md) — full export process, design contract, naming conventions
- [figma-design-framework-spec.html](./figma-design-framework-spec.html) — complete framework specification
