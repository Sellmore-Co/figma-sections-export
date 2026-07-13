// hotspots.js — turn Figma button geometry into percentage-based hotspot
// rectangles relative to the section frame, so a transparent <a> can sit over
// ONLY the button (per breakpoint) instead of wrapping the whole image.
//
// Recipe (from issue #27): given the section frame's absoluteBoundingBox and a
// button node's absoluteBoundingBox,
//   left%   = (btn.x - frame.x) / frame.w
//   top%    = (btn.y - frame.y) / frame.h
//   width%  =  btn.w           / frame.w
//   height% =  btn.h           / frame.h

function round(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clampPct(value) {
  return Math.min(100, Math.max(0, value));
}

// Compute a single hotspot rectangle (percentages) for a button box inside a
// frame box. Both are { x, y, width, height } in absolute canvas coordinates.
function computeHotspot(buttonBox, frameBox) {
  if (!buttonBox || !frameBox) {
    throw new Error('computeHotspot: both buttonBox and frameBox are required');
  }
  if (!frameBox.width || !frameBox.height) {
    throw new Error('computeHotspot: frameBox must have non-zero width and height');
  }

  return {
    left: round(clampPct(((buttonBox.x - frameBox.x) / frameBox.width) * 100)),
    top: round(clampPct(((buttonBox.y - frameBox.y) / frameBox.height) * 100)),
    width: round(clampPct((buttonBox.width / frameBox.width) * 100)),
    height: round(clampPct((buttonBox.height / frameBox.height) * 100)),
  };
}

module.exports = { computeHotspot, round, clampPct };
