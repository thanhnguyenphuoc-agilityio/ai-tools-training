import { describe, expect, it } from 'vitest';
import type { Me, MemberDto } from '../../shared/types';
import { canSetInviteEmail } from '../../src/ownerTools';

const owner: Me = { memberId: 'm-owner', isOwner: true, accountLinked: true };
const guest: Me = { memberId: 'm-guest', isOwner: false, accountLinked: false };

const member = (extra: Partial<MemberDto> = {}): MemberDto => ({
  id: 'm-jamie',
  name: 'Jamie',
  isOwner: false,
  claimed: false,
  removed: false,
  removedReason: null,
  bankBin: null,
  accountNo: null,
  accountName: null,
  bankSource: null,
  invited: false,
  ...extra,
});

describe('canSetInviteEmail (member_email_invite)', () => {
  it('OT-1: the owner may set the email of an active, unclaimed, non-owner member', () => {
    expect(canSetInviteEmail(owner, member())).toBe(true);
  });

  it('OT-2: a non-owner may not', () => {
    expect(canSetInviteEmail(guest, member())).toBe(false);
  });

  it('OT-3: a claimed, removed or owner member is never editable here', () => {
    expect(canSetInviteEmail(owner, member({ claimed: true }))).toBe(false);
    expect(canSetInviteEmail(owner, member({ removed: true }))).toBe(false);
    expect(canSetInviteEmail(owner, member({ isOwner: true }))).toBe(false);
  });
});
