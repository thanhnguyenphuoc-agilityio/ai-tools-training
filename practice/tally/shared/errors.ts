// Stable error codes returned by the API as { error, code, params }.
// `error` is an English message for logs and API users; the UI translates
// `code` (see src/i18n/locales). Adding a code here makes the locale files
// fail to type-check until every locale has a message for it.

export const ERROR_CODES = [
  'INTERNAL',
  'NOT_FOUND',
  'BODY_TOO_LARGE',
  'INVALID_JSON',
  'FIELD_REQUIRED',
  'FIELD_TOO_LONG',
  'INVALID_AMOUNT',
  'INVALID_DATE',
  'INVALID_WEIGHT',
  'INVALID_SHARE_AMOUNT',
  'SPLIT_SUM_MISMATCH',
  'INVALID_CURRENCY',
  'INVALID_ROUNDING',
  'CURRENCY_LOCKED',
  'UNKNOWN_BANK',
  'INVALID_ACCOUNT_NO',
  'INVALID_EMAIL',
  'GROUP_NOT_FOUND',
  'MEMBER_NOT_FOUND',
  'EXPENSE_NOT_FOUND',
  'TRANSFER_NOT_FOUND',
  'JOIN_FIRST',
  'OWNER_ONLY',
  'EDIT_SELF_ONLY',
  'DELETE_NOT_ALLOWED',
  'TRANSFER_SELF_ONLY',
  'CONFIRM_RECEIVER_ONLY',
  'WRONG_OWNER_KEY',
  'DUPLICATE_NAME',
  'MEMBER_ALREADY_CLAIMED',
  'PAYER_NOT_IN_GROUP',
  'PARTICIPANT_NOT_IN_GROUP',
  'NO_PARTICIPANTS',
  'DUPLICATE_PARTICIPANT',
  'SELF_TRANSFER',
  'ALREADY_CONFIRMED',
  'MEMBER_REMOVED',
  'MEMBER_HAS_BALANCE',
  'CANNOT_REMOVE_OWNER',
  'EXPENSE_HAS_REMOVED_MEMBER',
  'ALREADY_MEMBER',
  'SIGN_IN_REQUIRED',
  'INVALID_GOOGLE_TOKEN',
  'GROUP_OWNED_BY_OTHER_ACCOUNT',
  'ACCOUNT_ALREADY_MEMBER',
  'MEMBER_LINKED_ELSEWHERE',
  'OWNER_KEY_REVOKED',
  'ACCOUNT_OWNS_SHARED_GROUP',
  'LOCK_LIMIT_REACHED',
  'OWNER_TRANSFER_NOT_LINKED',
  'OWNER_TRANSFER_SELF',
  'MEMBER_NOT_CLAIMED',
  'CANNOT_RELEASE_OWNER',
  'EDIT_NOT_ALLOWED',
  'INVALID_SESSION_TIME',
  'SESSION_NOT_FOUND',
  'SESSION_HAS_EXPENSES',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ErrorParams = Record<string, string | number>;

export interface ErrorBody {
  error: string;
  code: ErrorCode;
  params?: ErrorParams;
}
