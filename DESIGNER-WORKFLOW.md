# Designer Workflow

This is the short path for designers exporting landing pages and presell pages from Figma for a developer to drop into an active campaign.

---

## 1. Install Once

```bash
npm install
```

You also need Figma access set up for your agent, plus a Figma token in `.env` if you are using the shell export helpers.

---

## 2. Build From The Figma Templates

Use the Debranded Sections file:

[Debranded Sections](https://www.figma.com/design/ia7650Y3lLte4WVYARNvSX/Debranded-Sections)

Before export, make sure:

- Copy is final
- Images are final
- Each section has desktop, tablet, and mobile frames
- Image layers use `img:`, `bg:`, or `img-group:` when they need exporting

The export should turn visible Figma copy into editable page fields. That lets a developer adjust headlines, CTA text, reviews, FAQ answers, and image alt text in the page frontmatter instead of hunting through section markup.

Current Figma naming conventions cover assets and tokens. Behaviour is inferred from the section family, visible controls, and the matching reference partial.

---

## 3. Copy Three Figma Links

For each section, copy links to the three breakpoint frames:

- desktop
- tablet
- mobile

In Figma, select the frame and use **Copy link to selection**.

---

## 4. Paste This Prompt Into Your Agent

For a landing section:

```text
Export this landing section for developer handoff.

Campaign slug: novaburn
Infer the section name from the Figma frame name.

Desktop:
<Figma link>

Tablet:
<Figma link>

Mobile:
<Figma link>

After export, save Figma reference screenshots, generate the compare page, run validation, and tell me whether this section is ready.
```

For a presell page:

```text
Export this presell page for developer handoff.

Campaign slug: novaburn
Infer the page name from the Figma frame name.

Desktop:
<Figma link>

Tablet:
<Figma link>

Mobile:
<Figma link>

After export, save Figma reference screenshots, generate the compare page, run validation, and tell me whether this page is ready.
```

If you only paste three links, the agent should not fetch Figma yet. It should ask:

```text
What campaign slug should I export into, and is this a landing section or a presell page?
```

The agent should infer the section/page name from the Figma frame name. For example, a frame named `problemsolution2-desktop` exports as `problemsolution-2`.

---

## 5. Review The Compare Page

Start the preview:

```bash
npm run dev
```

The agent can then generate the compare page:

```bash
npm run compare -- novaburn hero-1
```

Open:

```text
src/novaburn/_ref/compare.html
```

The left side is the Figma screenshot. The right side is the rendered HTML.

After each landing section export, the agent should ask whether the page is complete or whether you have more sections to export. Handoff should only run after you confirm the page is complete.

For a presell page, the agent may offer handoff immediately because the presell export is usually the whole page.

---

## 6. Final Developer Handoff

When all sections or the presell page are finished, ask:

```text
Prepare novaburn for developer handoff.
```

Or run:

```bash
npm run handoff -- novaburn
```

If there are multiple Figma reference sets, pass the section you want to compare:

```bash
npm run handoff -- novaburn hero-1
```

The handoff command validates the export, generates a compare page when it can, and compresses final images once.

Compression happens at final handoff only and only touches:

```text
src/novaburn/assets/images/
```

Give the developer the folder:

```text
src/novaburn/
```
