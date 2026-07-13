// figma-tree.js — walk a Figma node document and pull out the bits an
// interactive export needs: CTA button nodes, text content, and Dev Mode
// annotations. Pure functions, no network — feed them a node document from
// figma-rest.getNodeDocument (or a fixture).

// Matches CTA button layer names. Designers name these a few ways:
//   "Link → Button"  (Figma's prototype-reaction arrow, U+2192)
//   "Link -> Button" / "Link => Button"
//   "Button", "CTA", "btn", "Buy Button", "Button / Primary"
const BUTTON_NAME_RE =
  /(?:link\s*(?:[→➔➜➡⮕]|-+>|=>)\s*)?\bbutton\b|\bcta\b|\bbtn\b/i;

// Walk the tree depth-first, calling visit(node, depth, parent) for each node.
function walk(node, visit, depth = 0, parent = null) {
  if (!node) return;
  visit(node, depth, parent);
  const children = node.children || [];
  for (const child of children) walk(child, visit, depth + 1, node);
}

// Collect every node matching a predicate, in document order.
function findAll(node, predicate) {
  const out = [];
  walk(node, (n, depth, parent) => {
    if (predicate(n, depth, parent)) out.push(n);
  });
  return out;
}

function isButtonName(name) {
  return BUTTON_NAME_RE.test(String(name || ''));
}

// True when a node looks like a tappable CTA region with usable geometry.
function looksLikeButton(node) {
  if (!node || !node.absoluteBoundingBox) return false;
  if (node.visible === false) return false;
  return isButtonName(node.name);
}

// Find candidate CTA button nodes inside a section frame.
//
// Returns the candidates sorted "most likely primary CTA first": nodes whose
// name carries the explicit "Link → Button" arrow rank above bare "button"
// matches, then larger nodes rank above smaller ones. Nested matches are
// de-duplicated to the outermost matching ancestor so we hotspot the whole
// button, not an inner label.
function findButtonNodes(frame) {
  const matches = findAll(frame, looksLikeButton);

  // Drop a match if one of its ancestors is also a match (keep the outer one).
  const outer = matches.filter((node) => {
    const ancestors = findAll(frame, (candidate) =>
      candidate !== node && (candidate.children || []).length > 0 && containsNode(candidate, node));
    return !ancestors.some((anc) => matches.includes(anc));
  });

  return outer.sort((a, b) => score(b) - score(a));

  function score(node) {
    const explicitArrow = /link\s*(?:[→➔➜➡⮕]|-+>|=>)\s*button/i.test(node.name) ? 1e9 : 0;
    const area = (node.absoluteBoundingBox.width || 0) * (node.absoluteBoundingBox.height || 0);
    return explicitArrow + area;
  }
}

function containsNode(parent, target) {
  let found = false;
  walk(parent, (n) => { if (n === target) found = true; });
  return found;
}

// Find a button by an explicit name filter (substring, case-insensitive).
function findButtonByName(frame, nameFilter) {
  if (!nameFilter) return null;
  const needle = String(nameFilter).toLowerCase();
  const matches = findAll(frame, (n) =>
    n.absoluteBoundingBox && String(n.name || '').toLowerCase().includes(needle));
  return matches[0] || null;
}

// Collect non-empty text nodes in document order, with light metadata.
function findTextNodes(node) {
  return findAll(node, (n) => n.type === 'TEXT' && typeof n.characters === 'string' && n.characters.trim())
    .map((n) => ({
      id: n.id,
      name: n.name,
      text: n.characters.trim(),
      fontSize: n.style && n.style.fontSize,
      fontWeight: n.style && n.style.fontWeight,
      box: n.absoluteBoundingBox || null,
    }));
}

// Collect Dev Mode annotations attached anywhere in the tree. The REST node
// schema exposes these as node.annotations: [{ label, properties, ... }].
// Returns [] when the token/plan does not surface them (see docs).
function collectAnnotations(node) {
  const out = [];
  walk(node, (n) => {
    if (Array.isArray(n.annotations) && n.annotations.length) {
      for (const annotation of n.annotations) {
        out.push({
          nodeId: n.id,
          nodeName: n.name,
          label: annotation.label || '',
          properties: annotation.properties || [],
        });
      }
    }
  });
  return out;
}

// Try to read a real destination URL off a node (text hyperlink or a node-
// level hyperlink). Returns '' when none is set — callers then fall back to a
// campaign_link Liquid variable.
function extractHyperlink(node) {
  let url = '';
  walk(node, (n) => {
    if (url) return;
    if (n.style && n.style.hyperlink && n.style.hyperlink.url) url = n.style.hyperlink.url;
    if (!url && n.hyperlink && n.hyperlink.url) url = n.hyperlink.url;
  });
  return url;
}

module.exports = {
  BUTTON_NAME_RE,
  walk,
  findAll,
  isButtonName,
  looksLikeButton,
  findButtonNodes,
  findButtonByName,
  findTextNodes,
  collectAnnotations,
  extractHyperlink,
};
