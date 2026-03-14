# Quickstart

Export Figma sections to production-ready Liquid partials for `next-campaign-page-kit`.

---

## 1. Clone and install

```bash
git clone https://github.com/Sellmore-Co/figma-sections-export
cd figma-sections-export
npm install
```

---

## 2. Open Claude Code

```bash
claude .
```

Make sure the Figma MCP plugin is active — you'll see it listed in the available tools on startup.

> First time? See [CLAUDE.md](./CLAUDE.md) for full setup including the Figma MCP plugin and access token.

---

## 3. In Figma, copy links for your 3 breakpoint frames

For each variant (desktop, tablet, mobile) click the frame on the canvas and press **Cmd+L** (Mac) or **Ctrl+L** (Windows) to copy the link.

You'll end up with 3 URLs like:
```
https://www.figma.com/design/ia7650Y3lLte4WVYARNvSX/...?node-id=143-10518
https://www.figma.com/design/ia7650Y3lLte4WVYARNvSX/...?node-id=143-10610
https://www.figma.com/design/ia7650Y3lLte4WVYARNvSX/...?node-id=143-12936
```

---

## 4. Paste the 3 links into Claude Code

```
Export this section:
https://www.figma.com/design/{fileKey}/...?node-id=XXX-XXXX
https://www.figma.com/design/{fileKey}/...?node-id=XXX-XXXX
https://www.figma.com/design/{fileKey}/...?node-id=XXX-XXXX
```

Claude will:
- Fetch all 3 breakpoints in parallel
- Generate a responsive Liquid partial in `src/{campaign}/_includes/`
- Download all Figma assets (icons, images) to `src/{campaign}/assets/images/`
- Set up the preview campaign

---

## 5. Preview

```bash
npm run dev
```

Select your campaign from the list → browser opens at `http://localhost:3000/{campaign-slug}/` with live reload.

---

## Output

| File | Purpose |
|---|---|
| `src/{campaign}/_includes/{section}.html` | Liquid partial — drop into any campaign |
| `src/{campaign}/assets/css/tokens.css` | CSS custom properties for design tokens |
| `src/{campaign}/assets/images/` | Exported Figma assets |
| `src/{campaign}/index.html` | Preview page |
