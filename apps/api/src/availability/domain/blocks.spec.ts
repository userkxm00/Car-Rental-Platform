import {
  BLOCK_STATUSES,
  BLOCK_TYPES,
  blockRemovesAvailability,
  isValidBlockStatus,
  isValidBlockType,
  validateVehicleBlock,
} from './blocks';

/**
 * Operational block interval semantics (04-A02): the block vocabulary from
 * architecture/database-schema-v1.md plus the shared half-open interval
 * contract.
 */
const start = new Date('2026-09-01T08:00:00Z');
const end = new Date('2026-09-02T08:00:00Z');

describe('block vocabulary', () => {
  it('matches the schema block types', () => {
    expect(BLOCK_TYPES).toEqual([
      'MAINTENANCE',
      'INSPECTION',
      'DAMAGE',
      'TRANSFER',
      'MANUAL',
      'CLEANING',
      'OTHER',
    ]);
  });

  it('accepts only known block types and statuses', () => {
    expect(isValidBlockType('MAINTENANCE')).toBe(true);
    expect(isValidBlockType('weird')).toBe(false);
    expect(isValidBlockStatus('SCHEDULED')).toBe(true);
    expect(isValidBlockStatus('weird')).toBe(false);
  });
});

describe('validateVehicleBlock', () => {
  it('accepts a valid block', () => {
    expect(validateVehicleBlock(start, end, 'MAINTENANCE', 'SCHEDULED')).toEqual([]);
  });

  it('rejects unknown block types and statuses with field-level failures', () => {
    const failures = validateVehicleBlock(start, end, 'PAINTING', 'FUTURE');
    expect(failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'blockType' }),
        expect.objectContaining({ field: 'status' }),
      ]),
    );
  });

  it('rejects intervals that violate the shared interval contract', () => {
    const failures = validateVehicleBlock(end, start, 'CLEANING', 'ACTIVE');
    expect(failures).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'interval' })]));
  });
});

describe('availability impact', () => {
  it('treats SCHEDULED and ACTIVE blocks as removing availability', () => {
    expect(blockRemovesAvailability('SCHEDULED')).toBe(true);
    expect(blockRemovesAvailability('ACTIVE')).toBe(true);
  });

  it('treats COMPLETED and CANCELLED blocks as inert', () => {
    expect(blockRemovesAvailability('COMPLETED')).toBe(false);
    expect(blockRemovesAvailability('CANCELLED')).toBe(false);
  });

  it('covers every declared status', () => {
    for (const status of BLOCK_STATUSES) {
      expect(typeof blockRemovesAvailability(status)).toBe('boolean');
    }
  });
});
