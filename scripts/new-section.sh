#!/usr/bin/env bash
# Scaffold a new section partial, creating the campaign structure if needed.
#
# Usage:
#   ./scripts/new-section.sh <slug> <section-name> [display-name]
#
# Examples:
#   ./scripts/new-section.sh hero-7 hero-7          # new slug + first section
#   ./scripts/new-section.sh hero-7 hero-7-features # add section to existing slug

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

SLUG="$1"
SECTION="$2"
DISPLAY_NAME="${3:-}"

if [[ -z "$SLUG" || -z "$SECTION" ]]; then
  echo "Usage: $0 <slug> <section-name> [display-name]"
  echo ""
  echo "  slug          campaign folder name  e.g. hero-7"
  echo "  section-name  partial file name     e.g. hero-7, hero-7-features"
  echo "  display-name  optional title shown in dev server menu"
  echo ""
  echo "Examples:"
  echo "  $0 hero-7 hero-7"
  echo "  $0 hero-7 hero-7-features"
  exit 1
fi

CAMPAIGN_DIR="$ROOT/src/$SLUG"
NEW_CAMPAIGN=false

# ── Create campaign structure if slug doesn't exist yet ────────────────────────

if [[ ! -d "$CAMPAIGN_DIR" ]]; then
  NEW_CAMPAIGN=true

  # Derive display name from slug if not provided
  if [[ -z "$DISPLAY_NAME" ]]; then
    TITLE=$(echo "$SLUG" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2); print}')
    DISPLAY_NAME="$TITLE — Section Preview"
  fi

  echo "Creating new campaign: $SLUG"
  mkdir -p "$CAMPAIGN_DIR/_layouts"
  mkdir -p "$CAMPAIGN_DIR/_includes"
  mkdir -p "$CAMPAIGN_DIR/assets/css"
  mkdir -p "$CAMPAIGN_DIR/assets/images"
  mkdir -p "$CAMPAIGN_DIR/assets/js"

  # _layouts/base.html
  cat > "$CAMPAIGN_DIR/_layouts/base.html" << 'BASEOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Plus Jakarta Sans', 'sans-serif'],
          },
          colors: {
            'brand-primary': 'var(--brand-primary)',
            'brand-secondary': 'var(--brand-secondary)',
            'brand-accent': 'var(--brand-accent)',
            'surface-bg': 'var(--surface-bg)',
            'surface-card': 'var(--surface-card)',
            'surface-alt': 'var(--surface-alt)',
            'text-primary': 'var(--text-primary)',
            'text-secondary': 'var(--text-secondary)',
            'text-inverse': 'var(--text-inverse)',
          }
        }
      }
    }
  </script>
  {% for style in styles %}
  <link rel="stylesheet" href="{{ style | campaign_asset }}">
  {% endfor %}
</head>
<body class="font-sans bg-white text-[var(--text-primary)]">
  {{ content }}
  {% for script in scripts %}
  <script src="{{ script | campaign_asset }}"></script>
  {% endfor %}
</body>
</html>
BASEOF

  # assets/css/tokens.css
  cat > "$CAMPAIGN_DIR/assets/css/tokens.css" << 'TOKENSEOF'
:root {
  /* Brand */
  --brand-primary: #0f75ff;
  --brand-secondary: #edf2ff;
  --brand-accent: #22c55e;

  /* Surfaces */
  --surface-bg: #ffffff;
  --surface-card: #f8faff;
  --surface-alt: #f1f5ff;

  /* Text */
  --text-primary: #020b1e;
  --text-secondary: #4a5568;
  --text-inverse: #ffffff;

  /* Border */
  --border-default: #e2e8f0;

  /* State */
  --state-success: #22c55e;
  --state-warning: #f59e0b;
  --state-error: #ef4444;
}

/* Typography scale */
.text-display     { font-size: 48px; font-weight: 700; line-height: 1.1; }
.text-heading-1   { font-size: 36px; font-weight: 700; line-height: 1.2; }
.text-heading-2   { font-size: 28px; font-weight: 700; line-height: 1.3; }
.text-heading-3   { font-size: 22px; font-weight: 600; line-height: 1.4; }
.text-body-lg     { font-size: 18px; font-weight: 400; line-height: 1.7; }
.text-body        { font-size: 16px; font-weight: 400; line-height: 1.7; }
.text-body-sm     { font-size: 14px; font-weight: 400; line-height: 1.6; }
.text-caption     { font-size: 12px; font-weight: 500; line-height: 1.5; }
.text-overline    { font-size: 12px; font-weight: 700; line-height: 1.5; text-transform: uppercase; letter-spacing: 0.08em; }
TOKENSEOF

  # index.html (empty — section includes added below)
  cat > "$CAMPAIGN_DIR/index.html" << INDEXEOF
---
title: "$DISPLAY_NAME"
page_type: product
styles:
  - css/tokens.css

headline: "Your Headline Here"
body_text: "Your body copy here."
cta_text: "Order Now"
cta_url: "checkout.html"
---

INDEXEOF

  # Add to campaigns.json
  node -e "
const fs = require('fs');
const path = '$ROOT/_data/campaigns.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
data['$SLUG'] = { name: '$DISPLAY_NAME' };
fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
"

else
  echo "Adding section to existing campaign: $SLUG"
fi

# ── Create the section partial ─────────────────────────────────────────────────

PARTIAL="$CAMPAIGN_DIR/_includes/$SECTION.html"

if [[ -f "$PARTIAL" ]]; then
  echo "Error: _includes/$SECTION.html already exists in $SLUG."
  exit 1
fi

cat > "$PARTIAL" << INCLUDEEOF
<!-- TODO: replace with exported Liquid partial for $SECTION -->
<section class="py-24">
  <div class="max-w-7xl mx-auto px-4 text-center">
    <h1 class="text-heading-1" style="color: var(--text-primary);">$SECTION</h1>
    <p class="text-body-lg mt-4" style="color: var(--text-secondary);">Section partial not yet exported.</p>
  </div>
</section>
INCLUDEEOF

# Append campaign_include to index.html
printf "\n%s\n" "{% campaign_include '$SECTION.html' %}" >> "$CAMPAIGN_DIR/index.html"

# ── Summary ────────────────────────────────────────────────────────────────────

echo ""
if [[ "$NEW_CAMPAIGN" == true ]]; then
  echo "Created src/$SLUG/"
  echo "  _layouts/base.html"
  echo "  assets/css/tokens.css"
  echo "  assets/images/"
  echo "  index.html"
  echo "  → added to _data/campaigns.json"
fi
echo "  _includes/$SECTION.html  ← replace with exported partial"
echo ""
echo "Run 'npm run dev' and select '$SLUG' to preview."
