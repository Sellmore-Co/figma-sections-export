#!/usr/bin/env bash
# save-ref.sh — Download Figma node screenshots as reference images
#
# Usage:
#   ./scripts/save-ref.sh <campaign-slug> <section-name> <desktop-node-id-or-url> <tablet-node-id-or-url> <mobile-node-id-or-url>
#
# Example:
#   ./scripts/save-ref.sh section-preview hero-2 143:10703 143:10748 143:13028
#   ./scripts/save-ref.sh section-preview hero-2 "https://www.figma.com/design/FILE/Name?node-id=143-10703"
#
# Requires FIGMA_ACCESS_TOKEN in .env.
# FIGMA_FILE_KEY is optional when any node input is a full Figma URL.

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

extract_file_key() {
  echo "$1" | sed -n 's#.*figma.com/design/\([^/?#]*\).*#\1#p'
}

extract_node_id() {
  echo "$1" \
    | sed -n 's/.*node-id=\([^&#]*\).*/\1/p' \
    | sed 's/%3A/:/Ig; s/-/:/g'
}

for candidate in "$DESKTOP_ID" "$TABLET_ID" "$MOBILE_ID"; do
  URL_FILE_KEY="$(extract_file_key "$candidate")"
  if [ -n "$URL_FILE_KEY" ]; then
    FILE_KEY="$URL_FILE_KEY"
    break
  fi
done

if [ -z "$FILE_KEY" ]; then
  echo "Error: no Figma file key found. Pass full Figma URLs or add FIGMA_FILE_KEY to your .env file:"
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
DOWNLOADED_LABELS=""

download_node() {
  local node_input="$1"
  local label="$2"
  local parsed_node_id
  parsed_node_id="$(extract_node_id "$node_input")"
  local node_id="${parsed_node_id:-$node_input}"
  local out="$REF_DIR/$SECTION-$label.png"

  # Encode node id (: → %3A for URL)
  local encoded=$(echo "$node_id" | sed 's/:/%3A/g')

  echo "Fetching $label ($node_id)..."
  local url=$(curl -sf \
    -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
    "https://api.figma.com/v1/images/$FILE_KEY?ids=$encoded&format=png&scale=1" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d['images'].values())[0])")

  if [ -z "$url" ] || [ "$url" = "null" ]; then
    echo "  Warning: no image URL returned for $node_id"
    return
  fi

  curl -sL "$url" -o "$out"
  DOWNLOADED_LABELS="$DOWNLOADED_LABELS $label"
  echo "  Saved → $out"
}

download_node "$DESKTOP_ID" "desktop"
[ -n "$TABLET_ID" ]  && download_node "$TABLET_ID" "tablet"
[ -n "$MOBILE_ID" ]  && download_node "$MOBILE_ID" "mobile"

python3 - "$REF_DIR" "$SECTION" $DOWNLOADED_LABELS <<'PY'
import json
import struct
import sys
from pathlib import Path

ref_dir = Path(sys.argv[1])
section = sys.argv[2]
labels = sys.argv[3:]
signature = b"\x89PNG\r\n\x1a\n"
breakpoints = {}

for label in labels:
    png_path = ref_dir / f"{section}-{label}.png"
    with png_path.open("rb") as image:
        header = image.read(24)
    if len(header) < 24 or header[:8] != signature or header[12:16] != b"IHDR":
        raise SystemExit(f"Error: {png_path} is not a valid PNG with an IHDR header")
    width, height = struct.unpack(">II", header[16:24])
    breakpoints[label] = {"width": width, "height": height}

sidecar = {
    "generatedBy": "save-ref.sh",
    "scale": 1,
    "breakpoints": breakpoints,
}
(ref_dir / f"{section}-refs.json").write_text(
    json.dumps(sidecar, indent=2) + "\n",
    encoding="utf-8",
)
PY

echo ""
echo "Reference images saved to $REF_DIR/"
