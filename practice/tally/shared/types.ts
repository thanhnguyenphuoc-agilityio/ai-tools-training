// JSON shapes exchanged between the Worker API and the web app.
import banks from './banks.json';

export interface Bank {
  bin: string;
  shortName: string;
}

/** Banks that accept VietQR transfers, from api.vietqr.io/v2/banks. */
export const BANKS: Bank[] = banks;

export function findBank(bin: string | null | undefined): Bank | undefined {
  return bin ? BANKS.find((b) => b.bin === bin) : undefined;
}

export interface BankDetails {
  bankBin: string | null;
  accountNo: string | null;
  accountName: string | null;
}

export interface MemberDto extends BankDetails {
  id: string;
  name: string;
  isOwner: boolean;
  /** Someone uses this member on a device. Unclaimed members were added by name. */
  claimed: boolean;
  /** Removed by the owner (remove_member). Kept so that past expenses and transfers still show the name. */
  removed: boolean;
  removedReason: string | null;
  bankSource: 'group' | 'account' | null;
  /** Linked to a signed-in account (boolean only; the account itself is never returned). */
  hasAccount: boolean;
  /** Active unclaimed member who has an invite email set. The email itself is never returned. */
  invited: boolean;
}

/** equal: same share for everyone; weight: by weight; exact: each participant's amount is typed. */
export type SplitMode = 'equal' | 'weight' | 'exact';

export interface ExpenseDto {
  id: string;
  payerId: string;
  amount: number;
  description: string;
  spentOn: string; // YYYY-MM-DD as picked by the user, no timezone
  splitMode: SplitMode;
  /** `weight` is 1 in equal and exact splits. */
  shares: { memberId: string; weight: number; amount: number }[];
  createdBy: string | null; // member id of the author
  createdAt: string; // ISO timestamp (UTC)
}

export interface TransferDto {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  status: 'sent' | 'confirmed';
  createdAt: string;
  confirmedAt: string | null;
}

export interface Me {
  memberId: string | null;
  isOwner: boolean;
  accountLinked: boolean;
}

export interface GroupDto {
  code: string;
  name: string;
  /** ISO 4217 code; every amount in the group is in its minor units. */
  currency: string;
  /** Rounding unit for new expenses, in minor units (see shared/currency.ts). */
  roundTo: number;
  createdAt: string;
  lastActivityAt: string;
  /** last change + INACTIVE_DAYS; null when the group is kept */
  expiresAt: string | null;
  /** A kept group is exempt from inactivity deletion (lock_groups). */
  locked: boolean;
  /** True when the group belongs to a signed-in account (owner_link_binds_account). */
  ownedByAccount: boolean;
  /** True once the group has any expense (deleted ones included) or transfer; the currency can no longer change. */
  currencyLocked: boolean;
  canLinkAccount: boolean;
  members: MemberDto[];
  expenses: ExpenseDto[];
  transfers: TransferDto[];
  me: Me;
}

export interface CreateGroupResponse {
  code: string;
  /** Shown once. The server only stores its hash. Null when created by a signed-in account. */
  ownerKey: string | null;
}

export interface UserDto extends BankDetails {
  id: string;
  name: string;
  email: string;
}

export interface MeResponse {
  user: UserDto | null;
}

export interface ConfigResponse {
  googleClientId: string | null;
  devLogin: boolean;
}

export interface NewExpense {
  payerId: string;
  amount: number;
  description: string;
  spentOn: string;
  splitMode: SplitMode;
  /** `weight` is read in weight mode; `amount` (minor units, zero allowed) in exact mode. */
  participants: { memberId: string; weight?: number; amount?: number }[];
}

export interface MyGroupDto {
  code: string;
  name: string;
  currency: string;
  isOwner: boolean;
  lastActivityAt: string;
}

export interface MyGroupsResponse {
  groups: MyGroupDto[];
}
