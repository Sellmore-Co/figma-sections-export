# figma-sections-export

Export sections from any Figma file built on the Sellmore design framework to production-ready Liquid partials for [`next-campaign-page-kit`](https://www.npmjs.com/package/next-campaign-page-kit).

Each section is fetched at three breakpoints (desktop, tablet, mobile) via the Figma MCP plugin inside Claude Code, then converted to a responsive HTML/Liquid partial with Tailwind utility classes, CSS custom property tokens, and campaign filters (`campaign_asset`, `campaign_link`, `campaign_include`).

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

**4. Copy 3 Figma links** (desktop, tablet, mobile) with **Cmd+L** on each frame, then tell Claude the slug and paste the links:
```
Export this section as hero-banner:
https://www.figma.com/design/{fileKey}/...?node-id=XXX-XXXX
https://www.figma.com/design/{fileKey}/...?node-id=XXX-XXXX
https://www.figma.com/design/{fileKey}/...?node-id=XXX-XXXX
```

The slug (`hero-banner`) becomes the campaign folder name and URL path for previewing.

**5. Preview**
```bash
npm run dev
```

→ See [QUICKSTART.md](./QUICKSTART.md) for the full step-by-step guide.

---

## Output

| File | Purpose |
|---|---|
| `src/{slug}/_includes/{section}.html` | Liquid partial — drop into any campaign |
| `src/{slug}/assets/css/tokens.css` | CSS custom properties for design tokens |
| `src/{slug}/assets/images/` | Exported Figma assets |
| `src/{slug}/_ref/` | Reference screenshots per breakpoint (local only) |

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
