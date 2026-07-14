// Shared helpers for the font contract across the export pipeline.
//
// The export emits Tailwind arbitrary font-family utilities lifted from Figma,
// e.g. font-['TT_Octosquares',sans-serif]. Tailwind turns underscores into
// spaces, so the *resolved* CSS family is "TT Octosquares". Nothing in the tool
// ships the matching web font or declares an @font-face, so custom brand fonts
// silently fall back to ui-sans-serif. These helpers let the generator scaffold
// the @font-face contract and let validate-export fail when it is missing.

// Families that need no @font-face: CSS generics + the Google fonts the preview
// layout already loads. Compared lowercased.
const SAFE_FONT_FAMILIES = new Set([
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  'inherit',
  'initial',
  'unset',
  'arial',
  'helvetica',
  'helvetica neue',
  'times new roman',
  'georgia',
  'courier new',
  // Google fonts loaded by the preview base layout (new-section.sh):
  'plus jakarta sans',
  'inter',
]);

// Resolve a single Tailwind arbitrary family token to its CSS family name.
// "'TT_Octosquares'" -> "TT Octosquares"; "TT_Norms_Pro" -> "TT Norms Pro".
function resolveFamily(token) {
  return token
    .trim()
    .replace(/^['"]|['"]$/g, '') // strip surrounding quotes
    .replace(/_/g, ' ') // Tailwind underscore -> space
    .trim();
}

// Map a resolved family to the base woff2 filename we scaffold for it.
// "TT Octosquares" -> "TTOctosquares.woff2"
function expectedFontFileBase(family) {
  return family.replace(/[^A-Za-z0-9]/g, '');
}

// CSS-escape a raw class token for use as a selector, matching Tailwind's
// escaping (backslash before any char that is not [A-Za-z0-9_-]).
function escapeClassSelector(rawClass) {
  return '.' + rawClass.replace(/[^A-Za-z0-9_-]/g, (ch) => '\\' + ch);
}

// Find every Tailwind arbitrary font-family utility used in a chunk of HTML.
// Returns [{ rawClass, family, stack }] where rawClass includes any variant
// prefix (md:, lg:, hover:) so the backing selector matches exactly.
function extractFontUsages(html) {
  const usages = [];
  const seen = new Set();
  const re = /((?:[a-zA-Z][\w-]*:)*font-\[(?:family-name:)?([^\]]*)\])/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    const rawClass = match[1];
    const stack = match[2];
    const firstToken = stack.split(',')[0];
    const family = resolveFamily(firstToken);
    if (!family) continue;
    const key = `${rawClass}::${family}`;
    if (seen.has(key)) continue;
    seen.add(key);
    usages.push({ rawClass, family, stack });
  }
  return usages;
}

function isSafeFamily(family) {
  return SAFE_FONT_FAMILIES.has(family.toLowerCase());
}

// Map each custom font family to the set of font weights used alongside it.
// Scans class="..." attributes: any weight utility (font-bold, md:font-black,
// font-[650]) in the same attribute as a font-['Family'] class counts as a
// weight that family must cover. Returns Map<family, Set<number>>.
const WEIGHT_UTILITIES = {
  'font-thin': 100,
  'font-extralight': 200,
  'font-light': 300,
  'font-normal': 400,
  'font-medium': 500,
  'font-semibold': 600,
  'font-bold': 700,
  'font-extrabold': 800,
  'font-black': 900,
};

function extractFamilyWeights(html) {
  const weights = new Map();
  const attrRe = /class\s*=\s*"([^"]*)"/g;
  let attr;
  while ((attr = attrRe.exec(html)) !== null) {
    const classes = attr[1];
    const usages = extractFontUsages(classes).filter(({ family }) => !isSafeFamily(family));
    if (!usages.length) continue;

    const found = new Set();
    for (const token of classes.split(/\s+/)) {
      const bare = token.replace(/^(?:[a-zA-Z][\w-]*:)+/, '');
      if (WEIGHT_UTILITIES[bare] !== undefined) found.add(WEIGHT_UTILITIES[bare]);
      const numeric = bare.match(/^font-\[(\d{2,3})\]$/);
      if (numeric) found.add(Number(numeric[1]));
    }
    if (!found.size) continue;

    for (const { family } of usages) {
      if (!weights.has(family)) weights.set(family, new Set());
      for (const w of found) weights.get(family).add(w);
    }
  }
  return weights;
}

// Parse @font-face blocks from a fonts.css string.
// Returns [{ family, srcUrls: [...] }].
function parseFontFaces(css) {
  const faces = [];
  const blockRe = /@font-face\s*\{([^}]*)\}/g;
  let block;
  while ((block = blockRe.exec(css)) !== null) {
    const body = block[1];
    const familyMatch = body.match(/font-family\s*:\s*([^;]+);/i);
    if (!familyMatch) continue;
    const family = familyMatch[1].trim().replace(/^['"]|['"]$/g, '');
    const srcUrls = [...body.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)].map((m) => m[1].trim());
    faces.push({ family, srcUrls });
  }
  return faces;
}

module.exports = {
  SAFE_FONT_FAMILIES,
  resolveFamily,
  expectedFontFileBase,
  escapeClassSelector,
  extractFamilyWeights,
  extractFontUsages,
  isSafeFamily,
  parseFontFaces,
};
