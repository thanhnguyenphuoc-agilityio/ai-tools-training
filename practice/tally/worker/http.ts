// Shared plumbing for route files: env types, errors, input validation.
import type { Context } from 'hono';
import type { ErrorCode, ErrorParams } from '../shared/errors';
import { getCurrency, type CurrencyInfo } from '../shared/currency';
import { MAX_AMOUNT, MAX_WEIGHT, isValidWeight, roundWeight } from '../shared/money';
import { findBank, type BankDetails } from '../shared/types';

export interface Env {
  DB: D1Database;
  /** Receipt photos (receipt_photos). Bound in wrangler.jsonc as RECEIPTS. */
  RECEIPTS: R2Bucket;
  GOOGLE_CLIENT_ID?: string;
  DEV_LOGIN?: string;
  /** Live updates (group_live_updates). Optional: without it nothing is signalled and the live endpoint answers 404. */
  GROUP_LIVE?: DurableObjectNamespace;
}

export interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  name: string;
  name_custom: number;
  bank_bin: string | null;
  account_no: string | null;
  account_name: string | null;
  created_at: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user?: UserRow | null;
    /** Set by a read that changed the group (the member_email_invite auto-link), so live pages reload. */
    groupChanged?: boolean;
  };
};
export type Ctx = Context<AppEnv>;

export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 500,
    public code: ErrorCode,
    message: string,
    public params?: ErrorParams,
  ) {
    super(message);
  }
}

export const now = () => new Date().toISOString();

/** True for the error D1 throws when a UNIQUE index rejects a write. */
export const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Error && err.message.includes('UNIQUE constraint failed');

export function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError(400, 'FIELD_REQUIRED', `${field} is required`, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new ApiError(400, 'FIELD_TOO_LONG', `${field} is too long (max ${max})`, { field, max });
  }
  return trimmed;
}

export function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return text(value, field, max);
}

/**
 * An invite email: null for no email (undefined, null, '' or spaces only), else the trimmed lowercase address.
 * Only the shape is checked (one `@`, text on both sides, no spaces, at most 254 characters). The value is never put
 * into the error.
 */
export function optionalEmail(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ApiError(400, 'INVALID_EMAIL', `${field} must be an email address`, { field });
  }
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parts = trimmed.split('@');
  const valid =
    trimmed.length <= 254 && !/\s/.test(trimmed) && parts.length === 2 && parts[0] !== '' && parts[1] !== '';
  if (!valid) throw new ApiError(400, 'INVALID_EMAIL', `${field} must be an email address`, { field });
  return trimmed.toLowerCase();
}

export function amount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > MAX_AMOUNT) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'amount must be a positive integer in minor units', { max: MAX_AMOUNT });
  }
  return value;
}

/** One participant's typed amount in an exact split: an integer from 0 (owes nothing) to MAX_AMOUNT. */
export function shareAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_AMOUNT) {
    throw new ApiError(400, 'INVALID_SHARE_AMOUNT', 'participant amount must be an integer from 0, in minor units', {
      max: MAX_AMOUNT,
    });
  }
  return value;
}

export function weight(value: unknown): number {
  const n = Number(value);
  if (!isValidWeight(n)) {
    throw new ApiError(400, 'INVALID_WEIGHT', `weight must be between 0 and ${MAX_WEIGHT}, with at most 2 decimals`, {
      max: MAX_WEIGHT,
    });
  }
  return roundWeight(n);
}

export function currency(value: unknown): CurrencyInfo {
  const info = typeof value === 'string' ? getCurrency(value) : undefined;
  if (!info) throw new ApiError(400, 'INVALID_CURRENCY', 'unsupported currency');
  return info;
}

/** Rounding unit (minor units) that the currency allows. Defaults to exact. */
export function roundTo(value: unknown, info: CurrencyInfo): number {
  if (value === undefined) return info.roundOptions[0];
  if (typeof value !== 'number' || !info.roundOptions.includes(value)) {
    throw new ApiError(400, 'INVALID_ROUNDING', `roundTo must be one of ${info.roundOptions.join(', ')}`);
  }
  return value;
}

export function isoDate(value: unknown): string {
  // Round-trip through Date so impossible dates such as 2026-02-30 (which Date.parse rolls over) are rejected.
  const valid =
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid) {
    throw new ApiError(400, 'INVALID_DATE', 'spentOn must be YYYY-MM-DD');
  }
  return value;
}

/**
 * Reads bank fields from a PATCH body, keeping `current` for fields that are
 * absent. Clearing accountNo clears all three.
 */
export function bankDetails(body: Record<string, unknown>, current: BankDetails): BankDetails {
  const pick = (key: keyof BankDetails, max: number) =>
    body[key] === undefined ? current[key] : optionalText(body[key], key, max);
  const result = {
    bankBin: pick('bankBin', 6),
    accountNo: pick('accountNo', 19),
    accountName: pick('accountName', 60),
  };

  if (!result.accountNo) return { bankBin: null, accountNo: null, accountName: null };
  if (!result.bankBin || !findBank(result.bankBin)) throw new ApiError(400, 'UNKNOWN_BANK', 'unknown bank');
  if (!/^[0-9A-Za-z]{4,19}$/.test(result.accountNo)) {
    throw new ApiError(400, 'INVALID_ACCOUNT_NO', 'account number must be 4-19 letters or digits');
  }
  return result;
}

export async function readJson(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new ApiError(400, 'INVALID_JSON', 'body must be a JSON object');
}
