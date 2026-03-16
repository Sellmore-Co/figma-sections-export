# figma-sections-export

Export Figma sections to production-ready Liquid partials for [`next-campaign-page-kit`](https://www.npmjs.com/package/next-campaign-page-kit).

Each section is fetched at three breakpoints (desktop, tablet, mobile) via the Figma MCP plugin inside Claude Code, then converted to a responsive HTML/Liquid partial with Tailwind utility classes, CSS custom property tokens, and campaign filters (`campaign_asset`, `campaign_link`, `campaign_include`).

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

**4. Copy 3 Figma links** (desktop, tablet, mobile) with **Cmd+L** on each frame, then paste into Claude:
```
Export this section:
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
| `src/{campaign}/_includes/{section}.html` | Liquid partial — drop into any campaign |
| `src/{campaign}/assets/css/tokens.css` | CSS custom properties for design tokens |
| `src/{campaign}/assets/images/` | Exported Figma assets |
| `src/{campaign}/_ref/` | Reference screenshots per breakpoint (local only) |

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
