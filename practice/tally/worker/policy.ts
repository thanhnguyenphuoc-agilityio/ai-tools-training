// Every "who may do what" rule lives here. Routes call these instead of
// comparing ids inline, so a new rule (e.g. a closed group becomes read-only)
// is a change in one file. Keep in sync with docs/business-rules.md.
import type { Identity } from './auth';
import { ApiError } from './http';

export function requireAccount(me: Identity): string {
  if (!me.userId) throw new ApiError(401, 'SIGN_IN_REQUIRED', 'sign in first');
  return me.userId;
}

/** A route outside a group (`/me`, `/me/groups`) that needs a signed-in account; there is no group identity to resolve. */
export function requireSignedIn(account: { id: string } | null): string {
  if (!account) throw new ApiError(401, 'SIGN_IN_REQUIRED', 'sign in first');
  return account.id;
}

/** Deleting the account is refused while it owns a group that still has other active members. */
export function requireNoSharedOwnedGroups(count: number): void {
  if (count > 0) {
    throw new ApiError(409, 'ACCOUNT_OWNS_SHARED_GROUP', 'cannot delete account while owning groups with other members', {
      count,
    });
  }
}

export function requireMember(me: Identity): string {
  if (!me.memberId) throw new ApiError(401, 'JOIN_FIRST', 'join the group first');
  return me.memberId;
}

export function requireOwner(me: Identity): void {
  if (!me.isOwner) throw new ApiError(403, 'OWNER_ONLY', 'only the group owner can do this');
}

export function requireOwnerAccount(me: Identity): string {
  requireOwner(me);
  return requireAccount(me);
}

/**
 * Checks that neither the signed-in account nor the device is already a member.
 * The account check comes first so an account gets ACCOUNT_ALREADY_MEMBER.
 */
export function requireNotMember(me: Identity): void {
  if (me.accountMemberId) {
    throw new ApiError(409, 'ACCOUNT_ALREADY_MEMBER', 'your account is already a member of this group');
  }
  if (me.memberId) {
    throw new ApiError(409, 'ALREADY_MEMBER', 'this device is already a member of the group');
  }
}

export function requireGroupNotOwnedByOther(me: Identity, group: { owner_user_id: string | null }): void {
  if (group.owner_user_id !== null && group.owner_user_id !== me.userId) {
    throw new ApiError(403, 'GROUP_OWNED_BY_OTHER_ACCOUNT', 'group belongs to another account');
  }
}

export function requireMemberLinkable(me: Identity, member: { id: string; user_id: string | null }): void {
  if (member.user_id !== null && member.user_id !== me.userId) {
    throw new ApiError(409, 'MEMBER_LINKED_ELSEWHERE', 'member linked to another account');
  }
  if (me.accountMemberId !== null && me.accountMemberId !== member.id) {
    throw new ApiError(409, 'ACCOUNT_ALREADY_MEMBER', 'your account is already a member of this group');
  }
}

/**
 * Whether "Link to my account" has something to link: a signed-in person whose access on this device is not linked
 * yet. It mirrors the checks of `linkToAccount` (`worker/accountLink.ts`) without throwing, so the button is shown
 * only when the request can succeed. Owners never use it: they attach automatically (`attachOwnerGroup`).
 */
export function canLinkToAccount(
  me: Identity,
  deviceMember: { id: string; user_id: string | null; is_owner: number } | null,
): boolean {
  if (!me.userId) return false;
  // A member linked to any account is not linkable. An account that already has another member in the group is refused.
  return (
    deviceMember !== null &&
    deviceMember.is_owner === 0 &&
    deviceMember.user_id === null &&
    me.accountMemberId === null
  );
}

/** Name and bank details: the member themself or the owner. */
export function requireCanEditMember(me: Identity, memberId: string): void {
  if (me.memberId !== memberId && !me.isOwner) throw new ApiError(403, 'EDIT_SELF_ONLY', 'you can only edit yourself');
}

/** The invite email of a member: the owner only (member_email_invite). */
export function requireCanSetInviteEmail(me: Identity): void {
  requireOwner(me);
}

/** Whether a signed-in account without any member in the group may be linked to an invited member on GET. */
export function canAutoLinkInvite(me: Identity): boolean {
  return me.userId !== null && me.memberId === null && me.accountMemberId === null;
}

/**
 * Removing a member: the owner only (remove_member). A guest gets OWNER_ONLY too, since joining
 * would not help. Whether the target can be removed (not the owner, zero balance) is checked by the route.
 */
export function requireCanRemoveMember(me: Identity): void {
  requireOwner(me);
}

/**
 * Releasing a wrongly claimed name (wrong_name_claim): the owner only. The route checks the target (owner member,
 * removed, not claimed) itself, because those refusals need the member row.
 */
export function requireCanReleaseMember(me: Identity): void {
  requireOwner(me);
}

/** Expenses: the author or the owner. A guest (no member identity) is never the author. */
export function requireCanDeleteExpense(me: Identity, expense: { created_by: string | null }): void {
  if (me.isOwner) return;
  if (requireMember(me) !== expense.created_by) {
    throw new ApiError(403, 'DELETE_NOT_ALLOWED', 'only the author or the group owner can delete this');
  }
}

/**
 * Editing an expense (edit_expense): the author or the owner. An expense without a recorded author can be edited
 * only by the owner. A guest gets JOIN_FIRST, as for any member action.
 */
export function requireCanEditExpense(me: Identity, expense: { created_by: string | null }): void {
  if (me.isOwner) return;
  const caller = requireMember(me);
  if (!expense.created_by || caller !== expense.created_by) {
    throw new ApiError(403, 'EDIT_NOT_ALLOWED', 'only the author or the group owner can edit this');
  }
}

/** Recording "I sent money": only for yourself, unless you are the owner. */
export function requireCanRecordTransfer(me: Identity, fromId: string): void {
  const caller = requireMember(me);
  if (fromId !== caller && !me.isOwner) {
    throw new ApiError(403, 'TRANSFER_SELF_ONLY', 'you can only record your own transfers');
  }
}

/** Confirming money arrived: the receiver or the owner. */
export function requireCanConfirmTransfer(me: Identity, transfer: { to_id: string }): void {
  if (me.memberId !== transfer.to_id && !me.isOwner) {
    throw new ApiError(403, 'CONFIRM_RECEIVER_ONLY', 'only the receiver can confirm');
  }
}

/** Handing the group over (transfer_ownership): the current owner only. */
export function requireCanTransferOwnership(me: Identity): void {
  requireOwner(me);
}

/**
 * The member who receives ownership (transfer_ownership): not the current owner, and linked to an account, because
 * owner access is tied to an account. Removed members are refused earlier by `loadActiveMember`.
 */
export function requireTransferTarget(member: { is_owner: number; user_id: string | null }): void {
  if (member.is_owner === 1) throw new ApiError(409, 'OWNER_TRANSFER_SELF', 'the owner already has owner access');
  if (member.user_id === null) {
    throw new ApiError(409, 'OWNER_TRANSFER_NOT_LINKED', 'the member needs an account to receive ownership');
  }
}
