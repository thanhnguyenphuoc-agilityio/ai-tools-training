// Every "who may do what" rule lives here. Routes call these instead of
// comparing ids inline, so a new rule (e.g. a locked group becomes read-only)
// is a change in one file. Keep in sync with docs/business-rules.md.
import type { Identity } from './auth';
import { ApiError } from './http';

export function requireMember(me: Identity): string {
  if (!me.memberId) throw new ApiError(401, 'JOIN_FIRST', 'join the group first');
  return me.memberId;
}

export function requireOwner(me: Identity): void {
  if (!me.isOwner) throw new ApiError(403, 'OWNER_ONLY', 'only the group owner can do this');
}

/** Name and bank details: the member themself or the owner. */
export function requireCanEditMember(me: Identity, memberId: string): void {
  if (me.memberId !== memberId && !me.isOwner) throw new ApiError(403, 'EDIT_SELF_ONLY', 'you can only edit yourself');
}

/**
 * Removing a member: the owner only (remove_member). A guest gets OWNER_ONLY too, since joining
 * would not help. Whether the target can be removed (not the owner, zero balance) is checked by the route.
 */
export function requireCanRemoveMember(me: Identity): void {
  requireOwner(me);
}

/** Expenses: the author or the owner. A guest (no member identity) is never the author. */
export function requireCanDeleteExpense(me: Identity, expense: { created_by: string | null }): void {
  if (me.isOwner) return;
  if (requireMember(me) !== expense.created_by) {
    throw new ApiError(403, 'DELETE_NOT_ALLOWED', 'only the author or the group owner can delete this');
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
