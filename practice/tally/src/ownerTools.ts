// Interface mirror of the owner rules in worker/policy.ts. Only for showing or hiding controls: the server enforces them.
import type { Me, MemberDto } from '../shared/types';

/** The owner may set or clear the invite email of an active member who has not claimed it yet. */
export function canSetInviteEmail(me: Me, member: MemberDto): boolean {
  return me.isOwner && !member.removed && !member.claimed && !member.isOwner;
}
