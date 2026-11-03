import type { CustomerContact, ShipToAddress } from "./types.js";

export interface CustomerResolution {
  found: boolean;
  customerId: string | null;
  knownContact: boolean;
}

export function buildDomainMap(contacts: CustomerContact[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of contacts) {
    const domain = c.email.split("@")[1]?.toLowerCase();
    if (domain && !map.has(domain)) map.set(domain, c.customerId);
  }
  return map;
}

export function resolveCustomer(
  fromEmail: string,
  contacts: CustomerContact[],
  domainMap: Map<string, string>,
): CustomerResolution {
  const email = fromEmail.toLowerCase();
  const exact = contacts.find((c) => c.email.toLowerCase() === email);
  if (exact) return { found: true, customerId: exact.customerId, knownContact: true };

  const domain = email.split("@")[1];
  const customerId = domain ? domainMap.get(domain.toLowerCase()) ?? null : null;
  if (customerId) return { found: true, customerId, knownContact: false };
  return { found: false, customerId: null, knownContact: false };
}

const STOP_WORDS = new Set(["main", "admin", "office", "central", "warehouse", "center", "club", "the"]);

export function resolveShipTo(
  customerId: string,
  locationHint: string | null,
  text: string,
  shipTos: ShipToAddress[],
): string | null {
  const owned = shipTos.filter((s) => s.customerId === customerId);
  if (owned.length === 0) return null;

  const search = locationHint && locationHint.trim().length > 0 ? locationHint : text;
  const keywords = search.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  for (const addr of owned) {
    if (addr.isDefault) continue;
    const nameTokens = addr.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
    const addressTokens = addr.address.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    const matched =
      nameTokens.some((w) => keywords.includes(w)) ||
      addressTokens.some((w) => keywords.includes(w));
    if (matched) return addr.shipToId;
  }

  const def = owned.find((s) => s.isDefault);
  return def ? def.shipToId : owned[0].shipToId;
}
