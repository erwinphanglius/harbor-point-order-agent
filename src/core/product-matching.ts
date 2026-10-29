import type { Product } from "./types.js";

interface MatcherSpec {
  phrases: string[];
  tokens: string[];
}

// Spanish -> English translation for common order terms (multilingual intake).
const SPANISH_MAP: [RegExp, string][] = [
  [/\bcajas?\b/g, " cases "],
  [/\brollos?\b/g, " rolls "],
  [/\bgalones\b/g, "gal"],
  [/\bnegras?\b/g, "black"],
  [/\bbasura\b/g, "trash"],
  [/\bbolsas?\b/g, "liners"],
  [/\bguantes\b/g, "gloves"],
  [/\bnitrilo\b/g, "nitrile"],
  [/\btalla\s*l\b/g, "large"],
  [/\btalla\s*m\b/g, "medium"],
  [/\btalla\s*s\b/g, "small"],
  [/\btransparente\b/g, "cling"],
  [/\bfilm\b/g, "cling film"],
  [/\bpor favor\b/g, ""],
  [/\bgracias\b/g, ""],
];

const MATCHERS: Record<string, MatcherSpec> = {
  "HPS-1001": { phrases: ["nitrile glove", "nitrile gloves"], tokens: ["nitrile", "glove", "gloves", "medium", "mediano"] },
  "HPS-1002": { phrases: ["nitrile glove", "nitrile gloves"], tokens: ["nitrile", "glove", "gloves", "large", "grande"] },
  "HPS-1003": { phrases: ["nitrile glove", "nitrile gloves"], tokens: ["nitrile", "glove", "gloves", "small", "pequeño", "pequeno"] },
  "HPS-1004": { phrases: ["vinyl glove", "vinyl gloves"], tokens: ["vinyl", "glove", "gloves"] },

  "HPS-1101": { phrases: ["multifold", "paper towel"], tokens: ["multifold", "towel", "towels"] },
  "HPS-1102": { phrases: ["hardwound", "roll towel"], tokens: ["hardwound"] },
  "HPS-1103": { phrases: ["toilet tissue", "toilet roll"], tokens: ["toilet", "tissue", "regular", "standard"] },
  "HPS-1104": { phrases: ["jumbo toilet", "big toilet", "jumbo roll"], tokens: ["jumbo", "big"] },

  "HPS-1201": { phrases: ["33 gal"], tokens: ["33", "trash", "liner", "liners", "bag", "bags", "black"] },
  "HPS-1202": { phrases: ["55 gal"], tokens: ["55", "trash", "liner", "liners", "bag", "bags", "black"] },
  "HPS-1203": { phrases: ["13 gal"], tokens: ["13", "trash", "liner", "liners", "bag", "bags", "white", "small"] },

  "HPS-1301": { phrases: ["all purpose cleaner", "cleaner concentrate"], tokens: ["concentrate", "all"] },
  "HPS-1302": { phrases: ["disinfectant spray", "quat"], tokens: ["disinfectant", "spray"] },
  "HPS-1303": { phrases: ["glass cleaner"], tokens: ["glass"] },
  "HPS-1304": { phrases: ["foam soap", "hand soap", "soap refill"], tokens: ["foam", "soap"] },
  "HPS-1305": { phrases: ["hand sanitizer", "sanitizer refill"], tokens: ["sanitizer", "gel"] },
  "HPS-1306": { phrases: ["neutral floor cleaner"], tokens: ["neutral", "floor", "gallon"] },
  "HPS-1307": { phrases: ["neutral floor cleaner"], tokens: ["neutral", "floor", "2.5"] },

  "HPS-1401": { phrases: ["kraft clamshell"], tokens: ["clamshell", "9x9"] },
  "HPS-1402": { phrases: ["soup cup"], tokens: ["soup"] },
  "HPS-1403": { phrases: ["hot cup"], tokens: ["hot"] },
  "HPS-1404": { phrases: ["hot cup lid"], tokens: ["lid", "lids", "hot"] },
  "HPS-1405": { phrases: ["clear cup", "cold cup", "clear cold cup"], tokens: ["clear", "cold"] },
  "HPS-1406": { phrases: ["paper straw"], tokens: ["straw", "straws"] },
  "HPS-1407": { phrases: ["dinner napkin"], tokens: ["napkin", "napkins"] },
  "HPS-1408": { phrases: ["wooden cutlery", "cutlery kit"], tokens: ["cutlery", "wooden"] },
  "HPS-1409": { phrases: ["aluminum foil"], tokens: ["foil"] },
  "HPS-1410": { phrases: ["cling film", "cling wrap"], tokens: ["cling"] },
  "HPS-1501": { phrases: ["coffee filter"], tokens: ["coffee", "filter", "filters"] },
  "HPS-1502": { phrases: ["kraft bag", "paper bag", "kraft paper bag"], tokens: ["#8", "kraft"] },
};

export function translateToEnglish(text: string): string {
  let out = text.toLowerCase();
  for (const [re, repl] of SPANISH_MAP) out = out.replace(re, repl);
  return out.replace(/\s+/g, " ").trim();
}

function scoreProduct(spec: MatcherSpec, desc: string): number {
  let score = 0;
  for (const phrase of spec.phrases) {
    if (desc.includes(phrase)) score += 4;
  }
  for (const token of spec.tokens) {
    if (new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(desc)) score += 1;
  }
  return score;
}

export type MatchResult =
  | { status: "matched"; sku: string; confidence: number }
  | { status: "ambiguous"; candidates: string[] }
  | { status: "no_match" };

// Unambiguous short-circuits, checked before generic scoring (order matters).
const PRIORITY_MATCHES: [RegExp, string][] = [
  [/\bsoup\b/, "HPS-1402"],
  [/\blids?\b/, "HPS-1404"],
];

export function matchProduct(description: string, products: Product[]): MatchResult {
  const desc = translateToEnglish(description);
  const bySku = new Map(products.map((p) => [p.sku, p]));

  for (const [re, sku] of PRIORITY_MATCHES) {
    if (re.test(desc) && bySku.has(sku)) return { status: "matched", sku, confidence: 10 };
  }

  const scores: { sku: string; score: number }[] = [];
  for (const [sku, spec] of Object.entries(MATCHERS)) {
    if (!bySku.has(sku)) continue;
    const score = scoreProduct(spec, desc);
    if (score > 0) scores.push({ sku, score });
  }

  if (scores.length === 0) return { status: "no_match" };
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  const tied = scores.filter((s) => s.score === top.score);
  if (tied.length > 1) return { status: "ambiguous", candidates: tied.map((t) => t.sku) };
  return { status: "matched", sku: top.sku, confidence: top.score };
}

export type SkuResolution =
  | { status: "found"; product: Product }
  | { status: "unknown" }
  | { status: "discontinued"; product: Product; replacement: Product | null };

export function resolveSku(sku: string, products: Product[]): SkuResolution {
  const normalized = sku.toUpperCase();
  const product = products.find((p) => p.sku === normalized);
  if (!product) return { status: "unknown" };
  if (product.status === "DISCONTINUED") {
    const replacement = product.replacedBy
      ? products.find((p) => p.sku === product.replacedBy) ?? null
      : null;
    return { status: "discontinued", product, replacement };
  }
  return { status: "found", product };
}
