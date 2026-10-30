/** Longest name a person can give a member, matching the server limit for `ownerName`. */
export const OWNER_NAME_MAX = 40;

/**
 * The value of the create form's name field.
 * A signed-in person with a non-empty account name gets that name, read-only, until they tick "Use a different name".
 * Otherwise the typed value is shown and stays editable.
 */
export function createOwnerName(
  accountName: string | undefined,
  useDifferent: boolean,
  typed: string,
): { value: string; locked: boolean } {
  const account = accountName?.trim() ?? '';
  if (account && !useDifferent) {
    // Trimmed, because the server trims and rejects a blank name (FIELD_REQUIRED).
    return { value: account.slice(0, OWNER_NAME_MAX), locked: true };
  }
  return { value: typed, locked: false };
}
