// Converts Prisma values back into the shapes Stage 1 returned (spec §3), so the API stays the same.
import type { Prisma } from '../generated/prisma/client.js';

const pad = (n: number) => String(n).padStart(2, '0');

/** DATE column → 'YYYY-MM-DD'. Prisma gives midnight UTC, so read UTC parts (never local time). */
export function toDateString(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 'YYYY-MM-DD' → the Date Prisma expects for a DATE column. */
export const fromDateString = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

/** DECIMAL → fixed-scale string, e.g. basic_salary "5000000.00" (Stage 1 numeric without mode). */
export const decimalString = (d: Prisma.Decimal | null, scale: number): string | null => (d === null ? null : d.toFixed(scale));

/** DECIMAL → number (Stage 1 numeric with mode 'number', and DTOs that called Number()). */
export const decimalNumber = (d: Prisma.Decimal | null): number | null => (d === null ? null : d.toNumber());

/** JSON array column → typed array; anything else reads as empty. */
export const jsonArray = <T>(v: Prisma.JsonValue | null | undefined): T[] => (Array.isArray(v) ? (v as T[]) : []);
