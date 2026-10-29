import { describe, expect, it } from 'vitest';
import type { Me, MemberDto } from '../../shared/types';
import { canTransferTo } from '../../src/ownerTools';

describe('canTransferTo', () => {
  const ownerMe: Me = { memberId: 'm-alex', isOwner: true, accountLinked: true };
  const memberMe: Me = { memberId: 'm-sam', isOwner: false, accountLinked: true };
  const guestMe: Me = { memberId: null, isOwner: false, accountLinked: false };

  const member = (overrides: Partial<MemberDto>): MemberDto => ({
    id: 'm-sam',
    name: 'Sam',
    bankBin: null,
    accountNo: null,
    accountName: null,
    isOwner: false,
    claimed: true,
    removed: false,
    removedReason: null,
    bankSource: null,
    hasAccount: true,
    ...overrides,
  });

  it('the owner may hand over to an active non-owner member with an account', () => {
    expect(canTransferTo(ownerMe, member({}))).toBe(true);
  });

  it('not offered to a member without an account', () => {
    expect(canTransferTo(ownerMe, member({ hasAccount: false }))).toBe(false);
  });

  it('not offered to the owner themself or to a removed member', () => {
    expect(canTransferTo(ownerMe, member({ id: 'm-alex', isOwner: true }))).toBe(false);
    expect(canTransferTo(ownerMe, member({ removed: true }))).toBe(false);
  });

  it('not offered to a plain member or a guest', () => {
    expect(canTransferTo(memberMe, member({}))).toBe(false);
    expect(canTransferTo(guestMe, member({}))).toBe(false);
  });
});
