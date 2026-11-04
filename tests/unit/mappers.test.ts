import { Prisma } from '../../src/generated/prisma/client.js';
import { decimalNumber, decimalString, fromDateString, jsonArray, toDateString } from '../../src/models/mappers.js';

// Review Focus 1: DATE values must not shift when the server clock is not UTC.
describe.each(['Asia/Vientiane', 'America/Los_Angeles'])('mappers in %s', (tz) => {
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = tz;
  });
  afterAll(() => {
    process.env.TZ = original;
  });

  it('round-trips calendar dates', () => {
    expect(toDateString(fromDateString('2026-11-01'))).toBe('2026-11-01');
    expect(toDateString(fromDateString('2028-02-29'))).toBe('2028-02-29');
    expect(toDateString(new Date('2026-02-28T23:30:00Z'))).toBe('2026-02-28');
    expect(toDateString(null)).toBeNull();
  });

  it('turns decimals into the Stage 1 JSON types', () => {
    expect(decimalString(new Prisma.Decimal('5000000'), 2)).toBe('5000000.00');
    expect(decimalString(null, 2)).toBeNull();
    expect(decimalNumber(new Prisma.Decimal('0.5'))).toBe(0.5);
    expect(decimalNumber(new Prisma.Decimal('6000000'))).toBe(6000000);
    expect(decimalNumber(null)).toBeNull();
  });

  it('reads JSON arrays safely', () => {
    expect(jsonArray<number>([1, 2])).toEqual([1, 2]);
    expect(jsonArray(null)).toEqual([]);
    expect(jsonArray({ a: 1 })).toEqual([]);
  });
});
