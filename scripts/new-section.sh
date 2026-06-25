#!/usr/bin/env bash
# Scaffold a landing section preview or standalone presell page.
#
# Usage:
#   ./scripts/new-section.sh <slug> <name> [display-name] [mode]
#
# Modes:
#   landing-section  Creates _includes/landing/<name>.html and landing.html.
#   presell-page     Creates <name>.html as a standalone advertorial page.
#
# Examples:
#   ./scripts/new-section.sh novaburn-presale hero-1
#   ./scripts/new-section.sh novaburn-presale faq-1 "Novaburn Presale"
#   ./scripts/new-section.sh novaburn-presale presell "Novaburn Presell" presell-page

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

SLUG="$1"
NAME="$2"
DISPLAY_NAME="${3:-}"
MODE="${4:-landing-section}"

if [[ -z "$SLUG" || -z "$NAME" ]]; then
  echo "Usage: $0 <slug> <name> [display-name] [landing-section|presell-page]"
  echo ""
  echo "  slug          campaign folder name       e.g. novaburn-presale"
  echo "  name          section or page name        e.g. hero-1, faq-1, presell"
  echo "  display-name  optional dev server title"
  echo "  mode          landing-section or presell-page"
  exit 1
fi

if [[ "$MODE" != "landing-section" && "$MODE" != "presell-page" ]]; then
  echo "Error: mode must be landing-section or presell-page."
  exit 1
fi

CAMPAIGN_DIR="$ROOT/src/$SLUG"
NEW_CAMPAIGN=false

titleize() {
  echo "$1" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2); print}'
}

section_var_prefix() {
  echo "$1" | tr '-' '_'
}

ensure_campaign_shell() {
  if [[ ! -d "$CAMPAIGN_DIR" ]]; then
    NEW_CAMPAIGN=true

    if [[ -z "$DISPLAY_NAME" ]]; then
      DISPLAY_NAME="$(titleize "$SLUG") - Export Preview"
    fi

    echo "Creating new campaign: $SLUG"
    mkdir -p "$CAMPAIGN_DIR/_layouts"
    mkdir -p "$CAMPAIGN_DIR/_includes/landing"
    mkdir -p "$CAMPAIGN_DIR/assets/css"
    mkdir -p "$CAMPAIGN_DIR/assets/images/_shared"
    mkdir -p "$CAMPAIGN_DIR/assets/js"

    node -e "
const fs = require('fs');
const path = '$ROOT/_data/campaigns.json';
fs.mkdirSync(require('path').dirname(path), { recursive: true });
const data = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : {};
data['$SLUG'] = { name: '$DISPLAY_NAME', entry_url: '$MODE' === 'presell-page' ? 'presell.html' : 'landing.html' };
fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
"
  else
    echo "Using existing campaign: $SLUG"
  fi
}

write_landing_layout() {
  local layout="$CAMPAIGN_DIR/_layouts/base-landing.html"
  if [[ -f "$layout" ]]; then return; fi

  cat > "$layout" << 'BASELANDING'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }}</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css">

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

  <link rel="stylesheet" href="{{ 'css/tokens.css' | campaign_asset }}">
  <link rel="stylesheet" href="{{ 'css/fonts.css' | campaign_asset }}">
  {% for style in styles %}
  <link rel="stylesheet" href="{{ style | campaign_asset }}">
  {% endfor %}
</head>
<body class="font-sans bg-white text-[var(--text-primary)]">
  {{ content }}

  <script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>
  <script src="{{ 'js/landing.js' | campaign_asset }}"></script>
  {% for script in scripts %}
  <script src="{{ script | campaign_asset }}"></script>
  {% endfor %}
</body>
</html>
BASELANDING
}

write_presell_layout() {
  local layout="$CAMPAIGN_DIR/_layouts/base-presell.html"
  if [[ -f "$layout" ]]; then return; fi

  mkdir -p "$CAMPAIGN_DIR/assets/css/presell"
  cat > "$layout" << 'BASEPRESELL'
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
  <link rel="stylesheet" href="{{ 'css/presell/tokens.css' | campaign_asset }}">
  <link rel="stylesheet" href="{{ 'css/fonts.css' | campaign_asset }}">
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
BASEPRESELL
}

write_tokens() {
  local out="$1"
  if [[ -f "$out" ]]; then return; fi
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TOKENSEOF'
:root {
  --brand-primary: #0f75ff;
  --brand-secondary: #edf2ff;
  --brand-accent: #22c55e;
  --surface-bg: #ffffff;
  --surface-card: #f8faff;
  --surface-alt: #f1f5ff;
  --text-primary: #020b1e;
  --text-secondary: #4a5568;
  --text-inverse: #ffffff;
  --border-default: #e2e8f0;
  --state-success: #22c55e;
  --state-warning: #f59e0b;
  --state-error: #ef4444;
}

.text-display { font-size: 48px; font-weight: 700; line-height: 1.1; }
.text-heading-1 { font-size: 36px; font-weight: 700; line-height: 1.2; }
.text-heading-2 { font-size: 28px; font-weight: 700; line-height: 1.3; }
.text-heading-3 { font-size: 22px; font-weight: 600; line-height: 1.4; }
.text-body-lg { font-size: 18px; font-weight: 400; line-height: 1.7; }
.text-body { font-size: 16px; font-weight: 400; line-height: 1.7; }
.text-body-sm { font-size: 14px; font-weight: 400; line-height: 1.6; }
.text-caption { font-size: 12px; font-weight: 500; line-height: 1.5; }
.text-overline { font-size: 12px; font-weight: 700; line-height: 1.5; text-transform: uppercase; letter-spacing: 0.08em; }
TOKENSEOF
}

write_fonts_stub() {
  local out="$CAMPAIGN_DIR/assets/css/fonts.css"
  if [[ -f "$out" ]]; then return; fi
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'FONTSEOF'
/* Brand web fonts — STUB.
 *
 * Run `npm run fonts -- <slug>` after exporting sections. It scans the markup
 * for Tailwind font-['Family'] classes and replaces this stub with @font-face
 * declarations + the list of .woff2 files the brand must supply (assets/fonts/).
 * Custom fonts fall back to ui-sans-serif until those files exist.
 */
FONTSEOF
}

write_landing_js() {
  local out="$CAMPAIGN_DIR/assets/js/landing.js"
  if [[ -f "$out" ]]; then return; fi
  mkdir -p "$(dirname "$out")"
  cp "$ROOT/templates/landing/assets/js/landing.js" "$out"
}

write_presell_countdown() {
  local out="$CAMPAIGN_DIR/assets/js/presell/countdown.js"
  if [[ -f "$out" ]]; then return; fi
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'COUNTDOWNJS'
(function () {
  document.querySelectorAll('[data-countdown]').forEach(function (root) {
    var durationMs = (parseFloat(root.getAttribute('data-duration-minutes')) || 15) * 60 * 1000;
    var key = root.getAttribute('data-storage-key') || 'presell-countdown';
    var end = parseInt(localStorage.getItem(key) || '0', 10);
    if (!end || end <= Date.now()) {
      end = Date.now() + durationMs;
      localStorage.setItem(key, String(end));
    }

    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function tick() {
      var remaining = Math.max(0, end - Date.now());
      var total = Math.floor(remaining / 1000);
      var hrs = Math.floor(total / 3600);
      var min = Math.floor((total % 3600) / 60);
      var sec = total % 60;
      root.querySelectorAll('[data-countdown-hrs]').forEach(function (el) { el.textContent = pad(hrs); });
      root.querySelectorAll('[data-countdown-min]').forEach(function (el) { el.textContent = pad(min); });
      root.querySelectorAll('[data-countdown-sec]').forEach(function (el) { el.textContent = pad(sec); });
      if (remaining > 0) setTimeout(tick, 1000);
    }
    tick();
  });
}());
COUNTDOWNJS
}

create_landing_section() {
  local var_prefix
  var_prefix="$(section_var_prefix "$NAME")"

  ensure_campaign_shell
  write_landing_layout
  write_tokens "$CAMPAIGN_DIR/assets/css/tokens.css"
  write_fonts_stub
  write_landing_js
  mkdir -p "$CAMPAIGN_DIR/assets/images/$NAME"

  local landing_page="$CAMPAIGN_DIR/landing.html"
  if [[ "$NEW_CAMPAIGN" == true || ! -f "$landing_page" ]]; then
    cat > "$landing_page" << INDEXEOF
---
page_layout: base-landing.html
title: "$DISPLAY_NAME"
page_type: product

next_url: "checkout.html"
cta_text: "Order Now"
guarantee_text: "30 Day Money Back Guarantee"

${var_prefix}_heading: "Your Heading Here"
${var_prefix}_body_text: "Your body copy here."
---

INDEXEOF
  fi

  local partial="$CAMPAIGN_DIR/_includes/landing/$NAME.html"
  if [[ -f "$partial" ]]; then
    echo "Error: _includes/landing/$NAME.html already exists in $SLUG."
    exit 1
  fi

  cat > "$partial" << INCLUDEEOF
<!-- TODO: replace with exported Liquid partial for $NAME. Match the external reference: campaign-cart-starter-templates/src/landing. -->
<section class="py-[40px] md:py-[48px] lg:py-[60px] bg-white">
  <div class="max-w-[1440px] mx-auto px-[15px] md:px-[26px] lg:px-[60px] xl:px-[120px]">
    <div class="text-center max-w-[800px] mx-auto">
      <h2 class="text-[28px] md:text-[32px] lg:text-[40px] leading-[1.2] font-bold text-[var(--text-primary)]">{{ ${var_prefix}_heading }}</h2>
      <p class="mt-[16px] text-[16px] md:text-[18px] leading-[1.5] text-[var(--text-secondary)]">{{ ${var_prefix}_body_text }}</p>
    </div>
  </div>
</section>
INCLUDEEOF

  printf "\n%s\n" "{% campaign_include 'landing/$NAME.html' %}" >> "$landing_page"
}

create_presell_page() {
  ensure_campaign_shell
  write_presell_layout
  write_tokens "$CAMPAIGN_DIR/assets/css/presell/tokens.css"
  write_fonts_stub
  write_presell_countdown
  mkdir -p "$CAMPAIGN_DIR/assets/images/presell"

  local page="$CAMPAIGN_DIR/$NAME.html"
  if [[ -f "$page" ]]; then
    echo "Error: $NAME.html already exists in $SLUG."
    exit 1
  fi

  cat > "$page" << 'PRESELLEOF'
---
page_layout: base-presell.html
title: "10 Reasons Why You Need This"
page_type: product
scripts:
  - js/presell/countdown.js

article_title: "10 Reasons Why Thousands Are Switching To This"
article_subtitle: "If you have been looking for a simple way to improve your routine, this may be the most important article you read today."
author_name: "Sarah Mitchell"
author_publication: "Wellness Insider"
author_date: "March 15, 2026"
read_time: "6 min read"

reason_1_tag: "Top Rated"
reason_1_heading: "It Works From The First Day"
reason_1_body: "Replace this with the exported presell body copy from Figma."
reason_1_image: "images/presell/placeholder.svg"

cta_heading: "Right Now, You Can Get It At The Lowest Price Of The Year"
cta_body: "This limited-time deal is in high demand and stock keeps selling out."
cta_text: "GET 60% OFF"
next_url: "landing.html"
product_image: "images/presell/placeholder.svg"
product_image_alt: "Product photo"
guarantee_text: "30 Day Money Back Guarantee"
---

<header class="bg-white border-b border-[var(--border-default)] py-10 md:py-14">
  <div class="max-w-[800px] mx-auto px-[15px] md:px-[35px] lg:px-0">
    <h1 class="font-bold text-[32px] md:text-[44px] leading-tight text-[var(--text-primary)] mb-5">{{ article_title }}</h1>
    <div class="text-sm text-[var(--text-secondary)] mb-5">
      <span class="italic">by</span>
      <strong class="text-[var(--text-primary)] not-italic ml-1">{{ author_name }}</strong>
      <span class="mx-1">.</span>
      <span>{{ author_publication }}</span>
      <span class="mx-1">.</span>
      <span>Updated {{ author_date }}</span>
      <span class="mx-1">.</span>
      <span>{{ read_time }}</span>
    </div>
    <p class="text-[17px] md:text-[18px] font-semibold text-[var(--text-primary)] leading-[1.6]">{{ article_subtitle }}</p>
  </div>
</header>

<main class="bg-white">
  <div class="border-b border-[var(--border-default)] py-8 md:py-12">
    <div class="max-w-[800px] mx-auto px-[15px] md:px-[35px] lg:px-0 flex flex-col md:flex-row gap-5 md:gap-8">
      <h2 class="md:hidden text-[24px] font-bold text-[var(--text-primary)] leading-[1.2]">{{ reason_1_heading }}</h2>
      <div class="shrink-0 w-full md:w-[308px] rounded-lg overflow-hidden">
        <div class="relative h-[220px] md:h-[287px]">
          <img src="{{ reason_1_image | campaign_asset }}" alt="{{ reason_1_heading }}" class="absolute inset-0 w-full h-full object-cover">
        </div>
        <div class="bg-[var(--brand-primary)] py-3 flex items-center justify-center">
          <span class="text-white font-bold text-[18px] md:text-[20px]">{{ reason_1_tag }}</span>
        </div>
      </div>
      <div class="flex flex-col justify-center flex-1">
        <h2 class="hidden md:block text-[28px] font-bold text-[var(--text-primary)] leading-[1.2] mb-5">{{ reason_1_heading }}</h2>
        <p class="text-[20px] font-medium text-[var(--text-primary)] opacity-80 leading-[1.5]">{{ reason_1_body }}</p>
      </div>
    </div>
  </div>

  <section class="bg-[var(--surface-alt)] py-10 md:py-14">
    <div class="max-w-[800px] mx-auto px-[15px] md:px-[35px] lg:px-0 text-center">
      <img src="{{ product_image | campaign_asset }}" alt="{{ product_image_alt }}" class="w-[220px] h-auto mx-auto mb-6 object-contain">
      <h2 class="font-bold text-[30px] md:text-[40px] leading-tight text-[var(--text-primary)] mb-4">{{ cta_heading }}</h2>
      <p class="text-[18px] text-[var(--text-secondary)] leading-[1.5] mb-6">{{ cta_body }}</p>
      <a href="{{ next_url | campaign_link }}" class="w-full md:w-[440px] mx-auto rounded-[6px] bg-[var(--brand-primary)] px-[24px] py-[20px] flex items-center justify-center text-white font-bold text-[20px] no-underline">{{ cta_text }}</a>
      <p class="mt-3 text-[16px] font-semibold text-[var(--text-primary)]">{{ guarantee_text }}</p>
    </div>
  </section>
</main>
PRESELLEOF
}

if [[ "$MODE" == "landing-section" ]]; then
  create_landing_section
else
  create_presell_page
fi

echo ""
if [[ "$NEW_CAMPAIGN" == true ]]; then
  echo "Created src/$SLUG/ and added it to _data/campaigns.json"
fi

if [[ "$MODE" == "landing-section" ]]; then
  echo "Created _includes/landing/$NAME.html"
  echo "Created assets/images/$NAME/"
else
  echo "Created $NAME.html"
  echo "Created assets/images/presell/"
fi

echo ""
echo "Run 'npm run validate -- $SLUG' after replacing the scaffold with exported markup."
echo "Run 'npm run dev' and select '$SLUG' to preview."
