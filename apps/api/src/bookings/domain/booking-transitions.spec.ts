import type { BookingStatus } from '@prisma/client';
import {
  BOOKING_TRANSITIONS,
  BookingCommand,
  InvalidTransitionError,
  bookingCommandPermission,
  resolveTransition,
} from './booking-transitions';
import { Permission } from '../../authorization/permissions';

/**
 * State-machine table tests (05-C01…C12): every command has exactly one
 * target, a fixed source set, an authorizing permission, and disallowed
 * moves throw the structured error.
 */

describe('BOOKING_TRANSITIONS (05-C01…C12)', () => {
  it('covers every command with one target state', () => {
    const commands = Object.values(BookingCommand);
    expect(BOOKING_TRANSITIONS).toHaveLength(commands.length);
    const byCommand = new Map(BOOKING_TRANSITIONS.map((t) => [t.command, t]));
    for (const command of commands) {
      expect(byCommand.get(command)).toBeDefined();
    }
  });

  it('allows the full happy path DRAFT → HOLD → PENDING → CONFIRMED → READY → ACTIVE → RETURN_PENDING → RETURNED → SETTLEMENT → COMPLETED', () => {
    const path: Array<[string, BookingStatus]> = [
      ['requestConfirmation', 'PENDING_CONFIRMATION'],
      ['confirm', 'CONFIRMED'],
      ['markReady', 'READY_FOR_PICKUP'],
      ['checkOut', 'ACTIVE'],
      ['requestReturn', 'RETURN_PENDING'],
      ['completeReturn', 'RETURNED'],
      ['openSettlement', 'SETTLEMENT_PENDING'],
      ['complete', 'COMPLETED'],
    ];
    let current: BookingStatus = 'HOLD';
    for (const [command, expected] of path) {
      const transition = resolveTransition(current, command);
      expect(transition.to).toBe(expected);
      current = expected;
    }
  });

  it('supports requestConfirmation from DRAFT as well as HOLD', () => {
    expect(resolveTransition('DRAFT', 'requestConfirmation').to).toBe('PENDING_CONFIRMATION');
    expect(resolveTransition('HOLD', 'requestConfirmation').to).toBe('PENDING_CONFIRMATION');
  });

  it('maps exceptional states (05-C11)', () => {
    expect(resolveTransition('HOLD', 'expire').to).toBe('EXPIRED');
    expect(resolveTransition('PENDING_CONFIRMATION', 'reject').to).toBe('REJECTED');
    expect(resolveTransition('READY_FOR_PICKUP', 'markNoShow').to).toBe('NO_SHOW');
    for (const from of ['DRAFT', 'HOLD', 'PENDING_CONFIRMATION', 'CONFIRMED', 'READY_FOR_PICKUP'] as BookingStatus[]) {
      expect(resolveTransition(from, 'cancel').to).toBe('CANCELLED');
    }
  });

  it('rejects disallowed moves with the structured error', () => {
    for (const [from, command] of [
      ['DRAFT', 'confirm'],
      ['PENDING_CONFIRMATION', 'checkOut'],
      ['CONFIRMED', 'requestReturn'],
      ['ACTIVE', 'markReady'],
      ['COMPLETED', 'cancel'],
      ['CANCELLED', 'complete'],
      ['HOLD', 'markNoShow'],
    ] as Array<[BookingStatus, string]>) {
      expect(() => resolveTransition(from, command)).toThrow(InvalidTransitionError);
      try {
        resolveTransition(from, command);
      } catch (error) {
        expect((error as InvalidTransitionError).code).toBe('BOOKING_INVALID_TRANSITION');
      }
    }
  });

  it('authorizes every transition with the documented permission (05-C12)', () => {
    const expected: Record<string, string> = {
      requestConfirmation: Permission.BOOKING_CREATE,
      confirm: Permission.BOOKING_CONFIRM,
      markReady: Permission.BOOKING_CONFIRM,
      checkOut: Permission.BOOKING_CONFIRM,
      requestReturn: Permission.BOOKING_RETURN,
      completeReturn: Permission.BOOKING_RETURN,
      openSettlement: Permission.BOOKING_RETURN,
      complete: Permission.BOOKING_RETURN,
      cancel: Permission.BOOKING_CANCEL,
      reject: Permission.BOOKING_CONFIRM,
      expire: Permission.BOOKING_CANCEL,
      markNoShow: Permission.BOOKING_CONFIRM,
    };
    for (const [command, permission] of Object.entries(expected)) {
      expect(bookingCommandPermission(command)).toBe(permission);
    }
  });
});
