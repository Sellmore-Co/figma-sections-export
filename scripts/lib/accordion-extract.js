// accordion-extract.js — pull question/answer pairs out of a Figma FAQ /
// accordion frame so they can be rendered as a real <details> accordion.
//
// Two common Figma shapes are handled:
//   • grouped — an auto-layout list whose children are row groups, each row
//     group wrapping a question text node and (often) an answer text node.
//   • flat    — a list whose direct children are bare question text nodes, with
//     the answers living in Dev Mode annotations or hidden layers.
//
// When an answer has no visible text layer, an annotation on a node in that row
// (from figma-tree.collectAnnotations) is used instead.

const { walk, findAll } = require('./figma-tree');

function textNodesIn(node) {
  return findAll(node, (n) => n.type === 'TEXT' && typeof n.characters === 'string' && n.characters.trim());
}

function directText(node) {
  return (node.children || []).filter(
    (c) => c.type === 'TEXT' && typeof c.characters === 'string' && c.characters.trim(),
  );
}

// Map nodeId -> readable annotation text, for filling answers from Dev Mode.
function annotationTextByNode(annotations) {
  const map = new Map();
  for (const a of annotations || []) {
    const props = (a.properties || []).map((p) => p.value || p.type).filter(Boolean).join(', ');
    const text = [a.label, props].filter(Boolean).join(' — ').trim();
    if (text) map.set(a.nodeId, text);
  }
  return map;
}

// Locate the accordion list and how its rows are shaped.
// Returns { container, mode: 'grouped' | 'flat' } or null.
function findListContainer(frame) {
  // Preferred: a container whose children are row GROUPS (non-text nodes that
  // each contain a text node). This avoids mistaking "heading + list" or a
  // single row's "question + answer" for the list itself.
  let best = null;
  let bestScore = 0;
  walk(frame, (node) => {
    const groupedRows = (node.children || []).filter(
      (c) => c.type !== 'TEXT' && textNodesIn(c).length > 0,
    );
    if (groupedRows.length >= 2 && groupedRows.length > bestScore) {
      best = node;
      bestScore = groupedRows.length;
    }
  });
  if (best) return { container: best, mode: 'grouped' };

  // Fallback: a container whose direct children are bare question text nodes.
  bestScore = 0;
  walk(frame, (node) => {
    const textChildren = directText(node);
    if (textChildren.length >= 2 && textChildren.length > bestScore) {
      best = node;
      bestScore = textChildren.length;
    }
  });
  return best ? { container: best, mode: 'flat' } : null;
}

// Returns { items: [{ question, answer, questionNodeId }], source }.
// source: 'text' | 'annotations' | 'mixed' | 'questions-only' | 'none'.
function extractAccordionItems(frame, annotations = []) {
  const annMap = annotationTextByNode(annotations);
  const found = findListContainer(frame);
  if (!found) return { items: [], source: 'none' };

  const { container, mode } = found;
  const rows = mode === 'grouped'
    ? (container.children || []).filter((c) => c.type !== 'TEXT' && textNodesIn(c).length > 0)
    : directText(container);

  const items = [];
  let fromText = 0;
  let fromAnn = 0;

  for (const row of rows) {
    const texts = mode === 'grouped' ? textNodesIn(row) : [row];
    const question = texts[0].characters.trim();
    const questionNodeId = texts[0].id;

    let answer = texts.slice(1).map((t) => t.characters.trim()).filter(Boolean).join('\n\n');
    if (answer) {
      fromText += 1;
    } else {
      let annAnswer = '';
      walk(row, (n) => { if (!annAnswer && annMap.has(n.id)) annAnswer = annMap.get(n.id); });
      if (annAnswer) {
        answer = annAnswer;
        fromAnn += 1;
      }
    }

    items.push({ question, answer, questionNodeId });
  }

  let source = 'questions-only';
  if (fromText && fromAnn) source = 'mixed';
  else if (fromText) source = 'text';
  else if (fromAnn) source = 'annotations';

  return { items, source };
}

module.exports = { extractAccordionItems, findListContainer, annotationTextByNode };
