#!/usr/bin/env bash
# export-node.sh — Export a Figma node as it appears on canvas (respects crop/frame bounds)
#
# Use this instead of downloading raw fill assets when the image has been
# positioned/cropped inside a Figma frame. This exports the rendered canvas
# view, not the underlying source file.
#
# Usage:
#   ./scripts/export-node.sh <node-id> <output-path> [scale]
#
# Examples:
#   ./scripts/export-node.sh 143:10744 src/section-preview/assets/images/hero-2-photo.png 2
#   ./scripts/export-node.sh 143:10744 src/section-preview/assets/images/hero-2-photo.png
#
# Requires FIGMA_ACCESS_TOKEN in .env

set -e

if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$FIGMA_ACCESS_TOKEN" ]; then
  echo "Error: FIGMA_ACCESS_TOKEN not set. Copy .env.example to .env and add your token."
  exit 1
fi

NODE_ID="$1"
OUTPUT="$2"
SCALE="${3:-2}"
FILE_KEY="ia7650Y3lLte4WVYARNvSX"

if [ -z "$NODE_ID" ] || [ -z "$OUTPUT" ]; then
  echo "Usage: $0 <node-id> <output-path> [scale]"
  echo "Example: $0 143:10744 src/section-preview/assets/images/hero-2-photo.png 2"
  exit 1
fi

ENCODED=$(echo "$NODE_ID" | sed 's/:/%3A/g')

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
echo "Saved → $OUTPUT"
