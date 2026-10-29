// Interface mirror of the owner rules in worker/policy.ts. Only for showing or hiding controls: the server enforces them.
import type { Me, MemberDto } from '../shared/types';

/** Handing the group over (transfer_ownership): the owner, to an active non-owner member who has an account. */
export function canTransferTo(me: Me, member: MemberDto): boolean {
  return me.isOwner && !member.removed && !member.isOwner && member.hasAccount;
}

/** The owner may set or clear the invite email of an active member who has not claimed it yet. */
export function canSetInviteEmail(me: Me, member: MemberDto): boolean {
  return me.isOwner && !member.removed && !member.claimed && !member.isOwner;
}

/** The owner may edit the receiving account of any active member other than their own member (owner_member_tools). */
export function canEditAccount(me: Me, member: MemberDto): boolean {
  return me.isOwner && !member.removed && member.id !== me.memberId;
}
