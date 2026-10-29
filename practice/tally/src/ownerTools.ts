import type { Me, MemberDto } from '../shared/types';

/** Handing the group over (transfer_ownership): the owner, to an active non-owner member who has an account. */
export function canTransferTo(me: Me, member: MemberDto): boolean {
  return me.isOwner && !member.removed && !member.isOwner && member.hasAccount;
}
