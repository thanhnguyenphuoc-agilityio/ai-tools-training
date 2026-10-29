import { describe, expect, it } from 'vitest';
import type { Me, MemberDto } from '../../shared/types';
import { canReleaseMember, canSetInviteEmail, canTransferTo } from '../../src/ownerTools';

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
    invited: false,
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

describe('canSetInviteEmail (member_email_invite)', () => {
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
    hasAccount: false,
    invited: false,
    ...extra,
  });

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

describe('canReleaseMember (wrong_name_claim)', () => {
  const owner: Me = { memberId: 'm-owner', isOwner: true, accountLinked: true };
  const memberMe: Me = { memberId: 'm-sam', isOwner: false, accountLinked: true };
  const guest: Me = { memberId: null, isOwner: false, accountLinked: false };

  const member = (extra: Partial<MemberDto> = {}): MemberDto => ({
    id: 'm-jamie',
    name: 'Jamie',
    isOwner: false,
    claimed: true,
    removed: false,
    removedReason: null,
    bankBin: null,
    accountNo: null,
    accountName: null,
    bankSource: null,
    hasAccount: false,
    invited: false,
    ...extra,
  });

  it('RM-1: the owner may release an active, claimed, non-owner member', () => {
    expect(canReleaseMember(owner, member())).toBe(true);
  });

  it('RM-2: a plain member or a guest may not', () => {
    expect(canReleaseMember(memberMe, member())).toBe(false);
    expect(canReleaseMember(guest, member())).toBe(false);
  });

  it('RM-3: an unclaimed, removed or owner member is never released here', () => {
    expect(canReleaseMember(owner, member({ claimed: false }))).toBe(false);
    expect(canReleaseMember(owner, member({ removed: true }))).toBe(false);
    expect(canReleaseMember(owner, member({ isOwner: true }))).toBe(false);
  });
});
