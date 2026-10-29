import type { DateString } from "./types.js";

/** Compare two ISO date strings ("YYYY-MM-DD"). Returns <0, 0, >0. */
export function compareDates(a: DateString, b: DateString): number {
  return a.localeCompare(b);
}

/** True when `date` is within [validFrom, validTo] inclusive (ISO strings). */
export function isWithinRange(
  date: DateString,
  validFrom: DateString,
  validTo: DateString,
): boolean {
  return compareDates(date, validFrom) >= 0 && compareDates(date, validTo) <= 0;
}

/** Parse a full ISO timestamp ("2026-11-02T07:02:00-05:00") to a date string. */
export function toDateString(timestamp: string): DateString {
  return timestamp.slice(0, 10);
}
