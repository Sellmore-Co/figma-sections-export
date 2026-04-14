#!/usr/bin/env bash
# save-ref.sh — Download Figma node screenshots as reference images
#
# Usage:
#   ./scripts/save-ref.sh <campaign-slug> <section-name> <desktop-node-id> <tablet-node-id> <mobile-node-id>
#
# Example:
#   ./scripts/save-ref.sh section-preview hero-2 143:10703 143:10748 143:13028
#
# Requires FIGMA_ACCESS_TOKEN and FIGMA_FILE_KEY in .env (copy .env.example → .env)

set -e

# Load .env
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$FIGMA_ACCESS_TOKEN" ]; then
  echo "Error: FIGMA_ACCESS_TOKEN not set. Copy .env.example to .env and add your token."
  exit 1
fi

CAMPAIGN="$1"
SECTION="$2"
DESKTOP_ID="$3"
TABLET_ID="$4"
MOBILE_ID="$5"
FILE_KEY="$FIGMA_FILE_KEY"

if [ -z "$FILE_KEY" ]; then
  echo "Error: FIGMA_FILE_KEY not set. Add it to your .env file:"
  echo "  FIGMA_FILE_KEY=your-figma-file-key"
  echo ""
  echo "Find the file key in the Figma URL:"
  echo "  figma.com/design/<FILE_KEY>/..."
  exit 1
fi

if [ -z "$CAMPAIGN" ] || [ -z "$SECTION" ] || [ -z "$DESKTOP_ID" ]; then
  echo "Usage: $0 <campaign> <section> <desktop-id> [tablet-id] [mobile-id]"
  exit 1
fi

REF_DIR="src/$CAMPAIGN/_ref"
mkdir -p "$REF_DIR"

download_node() {
  local node_id="$1"
  local label="$2"
  local out="$REF_DIR/$SECTION-$label.png"

  # Encode node id (: → %3A for URL)
  local encoded=$(echo "$node_id" | sed 's/:/%3A/g')

  echo "Fetching $label ($node_id)..."
  local url=$(curl -sf \
    -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
    "https://api.figma.com/v1/images/$FILE_KEY?ids=$encoded&format=png&scale=1.5" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d['images'].values())[0])")

  if [ -z "$url" ] || [ "$url" = "null" ]; then
    echo "  Warning: no image URL returned for $node_id"
    return
  fi

  curl -sL "$url" -o "$out"
  echo "  Saved → $out"
}

download_node "$DESKTOP_ID" "desktop"
[ -n "$TABLET_ID" ]  && download_node "$TABLET_ID" "tablet"
[ -n "$MOBILE_ID" ]  && download_node "$MOBILE_ID" "mobile"

echo ""
echo "Reference images saved to $REF_DIR/"
