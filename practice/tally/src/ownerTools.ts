// Interface mirror of the owner rules in worker/policy.ts. Only for showing or hiding controls: the server enforces them.
import type { Settlement } from '../shared/settle';
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

/** Which action a suggested transfer offers: the payer pays; the owner may record it for someone else. */
export type PayAction = 'pay' | 'recordFor' | null;

export function payAction(me: Me, s: Settlement): PayAction {
  if (s.fromId === me.memberId) return 'pay';
  if (me.isOwner) return 'recordFor';
  return null;
}

/** The owner may release the name of an active, claimed member who is not the owner (wrong_name_claim). */
export function canReleaseMember(me: Me, member: MemberDto): boolean {
  return me.isOwner && !member.removed && !member.isOwner && member.claimed;
}
