// Interface mirror of the owner rules in worker/policy.ts. Only for showing or hiding controls: the server enforces them.
import type { Settlement } from '../shared/settle';
import type { Me, MemberDto, TransferDto } from '../shared/types';

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
export type PayAction = 'pay' | 'recordFor' | 'waiting' | null;

/**
 * The payer pays, and the owner may record a debt that is not their own. Either becomes 'waiting' while a sent
 * transfer from the same payer to the same receiver is still unconfirmed. A plain member sees nothing on others' debts.
 */
export function payAction(
  me: Me,
  s: Settlement,
  transfers: Pick<TransferDto, 'fromId' | 'toId' | 'status'>[],
): PayAction {
  const base: PayAction = s.fromId === me.memberId ? 'pay' : me.isOwner ? 'recordFor' : null;
  if (base === null) return null;
  if (transfers.some((tr) => tr.status === 'sent' && tr.fromId === s.fromId && tr.toId === s.toId)) return 'waiting';
  return base;
}

/** The owner may release the name of an active, claimed member who is not the owner (wrong_name_claim). */
export function canReleaseMember(me: Me, member: MemberDto): boolean {
  return me.isOwner && !member.removed && !member.isOwner && member.claimed;
}

/**
 * Leaving the group (leave_group): a member of this device other than the owner, who is still active. Mirrors
 * requireCanLeaveGroup in worker/policy.ts; a guest sees no action, and the owner hands the group over first.
 */
export function canLeaveGroup(me: Me, members: MemberDto[]): boolean {
  if (me.memberId === null || me.isOwner) return false;
  const self = members.find((m) => m.id === me.memberId);
  return !!self && !self.removed && !self.isOwner;
}

/**
 * Deleting the group (leave_group): the owner, while no other member is active. Unclaimed members count as members,
 * as in the server check (requireGroupAlone). Mirrors requireCanDeleteGroup and the guarded DELETE in worker/routes/groups.ts.
 */
export function canDeleteGroup(me: Me, members: MemberDto[]): boolean {
  return me.isOwner && !members.some((m) => !m.removed && !m.isOwner);
}
