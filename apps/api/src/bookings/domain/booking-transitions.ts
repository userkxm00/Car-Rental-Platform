import type { BookingStatus } from '@prisma/client';
import type { PermissionValue } from '../../authorization/permissions';
import { Permission } from '../../authorization/permissions';
import { BookingErrorCode } from './booking-rules';

/**
 * Booking state machine (05-C): every status change is a named domain
 * command with a fixed source set, a single target state and an explicit
 * permission (05-C12). Clients can never set a status directly — the API
 * exposes only these commands (docs/10-booking-state-machine.md).
 *
 * docs/10 mapping: QUOTED = the linked quote record (05-A);
 * PREPARING/CHECKED_OUT = READY_FOR_PICKUP; IN_RENTAL = ACTIVE;
 * RETURNING = RETURN_PENDING; INSPECTION_PENDING = RETURNED. Extensions and
 * overdue are records (05-D), never statuses.
 */

export const BookingCommand = {
  REQUEST_CONFIRMATION: 'requestConfirmation',
  REQUEST_EXTENSION: 'requestExtension',
  CONFIRM: 'confirm',
  MARK_READY: 'markReady',
  CHECK_OUT: 'checkOut',
  REQUEST_RETURN: 'requestReturn',
  COMPLETE_RETURN: 'completeReturn',
  OPEN_SETTLEMENT: 'openSettlement',
  COMPLETE: 'complete',
  CANCEL: 'cancel',
  REJECT: 'reject',
  EXPIRE: 'expire',
  MARK_NO_SHOW: 'markNoShow',
} as const;

export type BookingCommandValue = (typeof BookingCommand)[keyof typeof BookingCommand];

export interface BookingTransition {
  command: BookingCommandValue;
  from: readonly BookingStatus[];
  to: BookingStatus;
  /** 05-C12: the permission authorizing this command. */
  permission: PermissionValue;
}

export const BOOKING_TRANSITIONS: readonly BookingTransition[] = [
  { command: 'requestConfirmation', from: ['DRAFT', 'HOLD'], to: 'PENDING_CONFIRMATION', permission: Permission.BOOKING_CREATE },
  { command: 'confirm', from: ['PENDING_CONFIRMATION'], to: 'CONFIRMED', permission: Permission.BOOKING_CONFIRM },
  { command: 'markReady', from: ['CONFIRMED'], to: 'READY_FOR_PICKUP', permission: Permission.BOOKING_CONFIRM },
  { command: 'checkOut', from: ['READY_FOR_PICKUP'], to: 'ACTIVE', permission: Permission.BOOKING_CONFIRM },
  { command: 'requestReturn', from: ['ACTIVE'], to: 'RETURN_PENDING', permission: Permission.BOOKING_RETURN },
  { command: 'completeReturn', from: ['RETURN_PENDING'], to: 'RETURNED', permission: Permission.BOOKING_RETURN },
  { command: 'openSettlement', from: ['RETURNED'], to: 'SETTLEMENT_PENDING', permission: Permission.BOOKING_RETURN },
  { command: 'complete', from: ['SETTLEMENT_PENDING'], to: 'COMPLETED', permission: Permission.BOOKING_RETURN },
  { command: 'cancel', from: ['DRAFT', 'HOLD', 'PENDING_CONFIRMATION', 'CONFIRMED', 'READY_FOR_PICKUP'], to: 'CANCELLED', permission: Permission.BOOKING_CANCEL },
  { command: 'reject', from: ['PENDING_CONFIRMATION'], to: 'REJECTED', permission: Permission.BOOKING_CONFIRM },
  { command: 'expire', from: ['HOLD'], to: 'EXPIRED', permission: Permission.BOOKING_CANCEL },
  { command: 'markNoShow', from: ['READY_FOR_PICKUP'], to: 'NO_SHOW', permission: Permission.BOOKING_CONFIRM },
  // 05-D05: an extension keeps the booking ACTIVE; the decision is recorded
  // on the extension row (REQUESTED→APPROVED/REJECTED), never as a state.
  { command: 'requestExtension', from: ['ACTIVE'], to: 'ACTIVE', permission: Permission.BOOKING_EXTEND },
];

const TRANSITION_BY_COMMAND = new Map<string, BookingTransition>(
  BOOKING_TRANSITIONS.map((t) => [t.command, t]),
);

/** The permission required for a command (05-C12). */
export function bookingCommandPermission(command: string): PermissionValue | undefined {
  return TRANSITION_BY_COMMAND.get(command)?.permission;
}

/** Structured error for every disallowed move (05-C12). */
export class InvalidTransitionError extends Error {
  readonly code = BookingErrorCode.BOOKING_INVALID_TRANSITION;
  readonly from: BookingStatus;
  readonly to: BookingStatus;
  readonly allowedFrom: readonly BookingStatus[];

  constructor(command: string, current: BookingStatus, transition: BookingTransition) {
    super(`Cannot ${command} from ${current} (allowed: ${transition.from.join(', ')}).`);
    this.name = 'InvalidTransitionError';
    this.from = current;
    this.to = transition.to;
    this.allowedFrom = transition.from;
  }
}

/**
 * Resolves a command against the current status; throws a structured
 * {@link InvalidTransitionError} for every disallowed move.
 */
export function resolveTransition(current: BookingStatus, command: string): BookingTransition {
  const transition = TRANSITION_BY_COMMAND.get(command);
  if (!transition) {
    throw new Error(`Unknown booking command: ${command}`);
  }
  if (!(transition.from as readonly string[]).includes(current)) {
    throw new InvalidTransitionError(command, current, transition);
  }
  return transition;
}
