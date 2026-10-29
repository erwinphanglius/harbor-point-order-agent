import type { Email } from "./types.js";

export interface ParsedItem {
  sku: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  location: string | null;
  line: string;
}

const UNIT_WORDS = new Set([
  "case",
  "cases",
  "cs",
  "box",
  "boxes",
  "roll",
  "rolls",
  "caja",
  "cajas",
  "rollo",
  "rollos",
]);

// Words that indicate a following number is a product *size* not a quantity.
const MEASUREMENT_RE = /^(gal|gallon|gallons|galones|galon|oz|ml|lit|liter|litre|liters|litres|l|in|inch|inches|ply|lb|lbs|kg|mm|cm|ft|#|pack|packs|x)\b/i;

const MONTH_RE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

const SKU_RE = /HPS-\d{4}/gi;

function isQuantityToken(raw: string, next: string | undefined): boolean {
  if (!/^\d+(\.\d+)?$/.test(raw)) return false;
  if (!next) return true;
  return !MEASUREMENT_RE.test(next);
}

function cleanDescription(parts: string[]): string {
  return parts
    .map((t) => t.replace(/^[^a-z0-9#]+|[^a-z0-9#]+$/gi, ""))
    .filter((t) => t.length > 0 && !/^(and|the|please|send|we|i|a|an|plus|also|for|our|us|need|of|de|at|this|these|those)$/i.test(t))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLineLocation(line: string): { location: string | null; rest: string } {
  const m = line.match(/^([A-Za-z][A-Za-z .]+):\s*(.*)$/);
  if (m && /\d/.test(m[2]) && !/^sku$/i.test(m[1].trim())) {
    return { location: m[1].trim(), rest: m[2] };
  }
  return { location: null, rest: line };
}

function extractQtyFromSkuLine(line: string): { quantity: number; unit: string | null } | null {
  const xMatch = line.match(/x\s*(\d+(?:\.\d+)?)/i);
  if (xMatch) return { quantity: parseFloat(xMatch[1]), unit: null };

  const unitMatch = line.match(/(\d+(?:\.\d+)?)\s*(case|cs|box|roll|caja|rollo)s?\b/i);
  if (unitMatch) return { quantity: parseFloat(unitMatch[1]), unit: unitMatch[2].toLowerCase() };

  if (line.includes(",")) {
    const fields = line.split(",").map((f) => f.trim()).filter(Boolean);
    const last = fields[fields.length - 1];
    if (last && /^\d+(\.\d+)?$/.test(last)) return { quantity: parseFloat(last), unit: null };
  }

  const any = line.match(/(\d+(?:\.\d+)?)/);
  if (any) return { quantity: parseFloat(any[1]), unit: null };
  return null;
}

function stripSkuAndQty(line: string, quantity: number | null, unit: string | null): string {
  let out = line;
  out = out.replace(SKU_RE, " ");
  if (quantity != null) out = out.replace(new RegExp(`\\b${quantity}\\b`), " ");
  if (unit) out = out.replace(new RegExp(`\\b${unit}s?\\b`, "i"), " ");
  out = out
    .replace(/[,:()]/g, " ")
    .replace(/\bx\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out;
}

function tokenizeQuantityItems(text: string): ParsedItem[] {
  const tokens = text.split(/\s+/);
  const items: ParsedItem[] = [];
  let i = 0;
  while (i < tokens.length) {
    const raw = tokens[i].replace(/[,;:]+$/, "");
    const next = tokens[i + 1];
    const prev = tokens[i - 1];
    const precededByHash = prev ? prev.includes("#") : false;
    const prevIsMonth = prev ? MONTH_RE.test(prev) : false;

    if (
      !precededByHash &&
      !prevIsMonth &&
      /^\d+(\.\d+)?$/.test(raw) &&
      isQuantityToken(raw, next)
    ) {
      const quantity = parseFloat(raw);
      let j = i + 1;
      let unit: string | null = null;
      if (tokens[j] && UNIT_WORDS.has(tokens[j].toLowerCase().replace(/[,;:.]/g, ""))) {
        unit = tokens[j].toLowerCase().replace(/[,;:.]/g, "");
        j++;
      }
      if (tokens[j] && tokens[j].toLowerCase() === "of") j++;
      const desc: string[] = [];
      while (j < tokens.length) {
        const t = tokens[j];
        const tn = tokens[j + 1];
        const tp = tokens[j - 1];
        const cleaned = t.replace(/[,;:.]/g, "");
        const isNextQty =
          !tp?.includes("#") && /^\d+(\.\d+)?$/.test(cleaned) && isQuantityToken(cleaned, tn);
        if (isNextQty) break;
        desc.push(t);
        j++;
      }
      const description = cleanDescription(desc);
      if (description) {
        items.push({ sku: null, description, quantity, unit, location: null, line: text });
      }
      i = j;
    } else {
      i++;
    }
  }
  return items;
}

function extractExclusions(text: string): string[] {
  const out: string[] = [];
  const re = /\b(?:skip|except|leave\s+out|without|drop|remove)\b([^,.;\n]{0,40})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const phrase = m[1]
      .replace(/\b(?:skip|except|the|remove|drop|any|all|of|those|these)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (phrase) out.push(phrase.toLowerCase());
  }
  return out;
}

function applyExclusions(items: ParsedItem[], text: string): ParsedItem[] {
  const exclusions = extractExclusions(text);
  if (exclusions.length === 0) return items;
  return items.filter((it) => {
    const desc = it.description.toLowerCase();
    return !exclusions.some((kw) => {
      const stem = kw.replace(/s$/, "");
      return desc.includes(kw) || desc.includes(stem);
    });
  });
}

function tokenizeDescFirstItems(text: string): ParsedItem[] {
  const m = text.match(/^\s*(.+?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(cases?|cs|boxes?|rolls?)?\s*$/i);
  if (!m) return [];
  const description = cleanDescription(m[1].split(/\s+/));
  if (!description) return [];
  return [{ sku: null, description, quantity: parseFloat(m[2]), unit: m[3]?.toLowerCase() ?? null, location: null, line: text }];
}

export function parseEmail(email: Email): ParsedItem[] {
  const lines = email.body.split(/\r?\n/);
  const items: ParsedItem[] = [];
  let pendingLocation: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(sku[, ]description|description[, ]qty)$/i.test(line)) continue;
    if (/^[-–]+\s*(forwarded message)?\s*[-–]+$/i.test(line)) continue;

    const { location, rest } = splitLineLocation(line);
    const effectiveLocation = location ?? pendingLocation;
    if (location) pendingLocation = location;

    const segments = rest.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);

    for (const segment of segments) {
      const skus = segment.match(SKU_RE);
      if (skus && skus.length > 0) {
        const qty = extractQtyFromSkuLine(segment);
        const description = stripSkuAndQty(segment, qty?.quantity ?? null, qty?.unit ?? null);
        items.push({
          sku: skus[0].toUpperCase(),
          description,
          quantity: qty?.quantity ?? null,
          unit: qty?.unit ?? null,
          location: effectiveLocation,
          line,
        });
      } else {
        let qtyItems = tokenizeQuantityItems(segment);
        if (qtyItems.length === 0) qtyItems = tokenizeDescFirstItems(segment);
        for (const it of qtyItems) {
          items.push({ ...it, location: effectiveLocation, line });
        }
      }
    }
  }

  return applyExclusions(items, email.body);
}

const MONTHS: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12",
};

export function extractRequestedDate(body: string): string | null {
  const monthAlt = Object.keys(MONTHS).join("|");
  const re = new RegExp(
    `\\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\\s*(${monthAlt})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
    "i",
  );
  const m = body.match(re);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  const day = m[2].padStart(2, "0");
  return `2026-${month}-${day}`;
}
