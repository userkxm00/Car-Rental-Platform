import {
  canTransitionMembership,
  MEMBERSHIP_TRANSITIONS,
  MembershipStatusValue,
} from './membership-rules';

describe('Membership transitions (02-B03)', () => {
  it.each<[MembershipStatusValue, MembershipStatusValue]>([
    ['INVITED', 'ACTIVE'],
    ['INVITED', 'DECLINED'],
    ['INVITED', 'REMOVED'],
    ['ACTIVE', 'SUSPENDED'],
    ['ACTIVE', 'REMOVED'],
    ['SUSPENDED', 'ACTIVE'],
    ['SUSPENDED', 'REMOVED'],
    ['DECLINED', 'INVITED'],
    ['DECLINED', 'REMOVED'],
  ])('allows %s → %s', (from, to) => {
    expect(canTransitionMembership(from, to)).toBe(true);
  });

  it.each<[MembershipStatusValue, MembershipStatusValue]>([
    ['INVITED', 'SUSPENDED'],
    ['ACTIVE', 'INVITED'],
    ['ACTIVE', 'DECLINED'],
    ['SUSPENDED', 'DECLINED'],
    ['DECLINED', 'ACTIVE'],
    ['REMOVED', 'ACTIVE'],
    ['REMOVED', 'INVITED'],
  ])('rejects %s → %s', (from, to) => {
    expect(canTransitionMembership(from, to)).toBe(false);
  });

  it('REMOVED is terminal', () => {
    expect(MEMBERSHIP_TRANSITIONS.REMOVED).toEqual([]);
  });
});
