import { localDate, localMinutes, isoWeekday, parseHHmm, addDays } from '../../src/utils/dates.js';

describe('dates (Asia/Vientiane)', () => {
  it('maps a late-UTC instant to the next local day', () => {
    expect(localDate(new Date('2026-11-02T23:30:00Z'))).toBe('2026-11-03');
  });
  it('computes minutes since local midnight', () => {
    expect(localMinutes(new Date('2026-11-03T01:20:00Z'))).toBe(500);
  });
  it('returns ISO weekday with Sunday = 7', () => {
    expect(isoWeekday('2026-11-08')).toBe(7);
    expect(isoWeekday('2026-11-09')).toBe(1);
  });
  it('parses HH:mm', () => {
    expect(parseHHmm('08:15')).toBe(495);
  });
  it('adds days to a date string', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
