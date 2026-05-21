#!/usr/bin/env bash
# export-node.sh — Export a Figma node as it appears on canvas (respects crop/frame bounds)
#
# Use this instead of downloading raw fill assets when the image has been
# positioned/cropped inside a Figma frame. This exports the rendered canvas
# view, not the underlying source file.
#
# Usage:
#   ./scripts/export-node.sh <node-id-or-figma-url> <output-path> [scale] [export-type] [file-key]
#
# Examples:
#   ./scripts/export-node.sh 143:10744 src/section-preview/assets/images/hero-2-photo.png 2
#   ./scripts/export-node.sh 143:10744 src/section-preview/assets/images/hero-2-photo.png
#   ./scripts/export-node.sh 143:14240 src/bottomcta-3/assets/images/bottomcta-3-hero.png 2 img-group
#
# Requires FIGMA_ACCESS_TOKEN in .env.
# FIGMA_FILE_KEY is optional when you pass a full Figma URL or the fifth file-key argument.

set -e

if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$FIGMA_ACCESS_TOKEN" ]; then
  echo "Error: FIGMA_ACCESS_TOKEN not set. Copy .env.example to .env and add your token."
  exit 1
fi

NODE_INPUT="$1"
OUTPUT="$2"
SCALE="${3:-2}"
EXPORT_TYPE="${4:-generic}"
FILE_KEY="${5:-$FIGMA_FILE_KEY}"

extract_file_key() {
  echo "$1" | sed -n 's#.*figma.com/design/\([^/?#]*\).*#\1#p'
}

extract_node_id() {
  echo "$1" \
    | sed -n 's/.*node-id=\([^&#]*\).*/\1/p' \
    | sed 's/%3A/:/Ig; s/-/:/g'
}

URL_FILE_KEY="$(extract_file_key "$NODE_INPUT")"
URL_NODE_ID="$(extract_node_id "$NODE_INPUT")"

if [ -n "$URL_FILE_KEY" ]; then
  FILE_KEY="$URL_FILE_KEY"
fi

if [ -n "$URL_NODE_ID" ]; then
  NODE_ID="$URL_NODE_ID"
else
  NODE_ID="$NODE_INPUT"
fi

if [ -z "$FILE_KEY" ]; then
  echo "Error: FIGMA_FILE_KEY not set. Add it to your .env file:"
  echo "  FIGMA_FILE_KEY=your-figma-file-key"
  echo ""
  echo "Find the file key in the Figma URL:"
  echo "  figma.com/design/<FILE_KEY>/..."
  exit 1
fi

if [ -z "$NODE_ID" ] || [ -z "$OUTPUT" ]; then
  echo "Usage: $0 <node-id-or-figma-url> <output-path> [scale] [export-type] [file-key]"
  echo "Example: $0 143:10744 src/section-preview/assets/images/hero-2-photo.png 2"
  echo "Example: $0 'https://www.figma.com/design/FILE/Name?node-id=143-10744' src/section-preview/assets/images/hero-2-photo.png 2"
  echo "Example: $0 143:14240 src/bottomcta-3/assets/images/bottomcta-3-hero.png 2 img-group"
  exit 1
fi

ENCODED=$(echo "$NODE_ID" | sed 's/:/%3A/g')

if [ "$EXPORT_TYPE" = "img-group" ]; then
  echo "Export type: img-group (composed/layered visual)"
  echo "Reminder: use the parent composition/group node ID, not child image nodes."
fi

echo "Exporting node $NODE_ID at ${SCALE}x..."
URL=$(curl -sf \
  -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "https://api.figma.com/v1/images/$FILE_KEY?ids=$ENCODED&format=png&scale=$SCALE" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d['images'].values())[0])")

if [ -z "$URL" ] || [ "$URL" = "null" ]; then
  echo "Error: no image URL returned for node $NODE_ID"
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
curl -sL "$URL" -o "$OUTPUT"

TYPE_INFO=$(file "$OUTPUT" || true)
EXT="${OUTPUT##*.}"

if echo "$TYPE_INFO" | grep -q "SVG"; then
  if [ "$EXT" = "png" ] || [ "$EXT" = "jpg" ] || [ "$EXT" = "jpeg" ]; then
    echo "Warning: exported file is SVG but output extension is .$EXT"
    echo "Consider renaming to .svg for correct asset type."
  fi
fi

echo "Saved → $OUTPUT"
echo "$TYPE_INFO"
