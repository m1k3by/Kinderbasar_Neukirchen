import { describe, it, expect } from 'vitest';
import {
  isWindowOpen,
  isRegistrationOpen,
  isActivationOpen,
  deriveEventDate,
  dateForWeekday,
} from '@/app/lib/basarWindows';

describe('isWindowOpen', () => {
  it('is open when start and end are both missing', () => {
    expect(isWindowOpen(null, null)).toBe(true);
    expect(isWindowOpen(undefined, undefined)).toBe(true);
  });

  it('is open when only one bound is set (incomplete window = no restriction)', () => {
    expect(isWindowOpen('2025-01-01T00:00:00Z', null)).toBe(true);
    expect(isWindowOpen(null, '2025-01-01T00:00:00Z')).toBe(true);
  });

  it('is open when now is within the window', () => {
    const now = new Date('2025-06-15T12:00:00Z');
    expect(isWindowOpen('2025-06-01T00:00:00Z', '2025-06-30T00:00:00Z', now)).toBe(true);
  });

  it('is closed before the window starts', () => {
    const now = new Date('2025-05-01T00:00:00Z');
    expect(isWindowOpen('2025-06-01T00:00:00Z', '2025-06-30T00:00:00Z', now)).toBe(false);
  });

  it('is closed after the window ends', () => {
    const now = new Date('2025-07-01T00:00:00Z');
    expect(isWindowOpen('2025-06-01T00:00:00Z', '2025-06-30T00:00:00Z', now)).toBe(false);
  });

  it('accepts Date instances directly', () => {
    const now = new Date('2025-06-15T00:00:00Z');
    expect(isWindowOpen(new Date('2025-06-01T00:00:00Z'), new Date('2025-06-30T00:00:00Z'), now)).toBe(true);
  });

  it('treats an unparseable value as missing (open)', () => {
    expect(isWindowOpen('not-a-date', '2025-06-30T00:00:00Z')).toBe(true);
  });
});

describe('isRegistrationOpen / isActivationOpen', () => {
  const now = new Date('2025-06-15T12:00:00Z');

  it('reads the seller window for non-employees', () => {
    const basar = {
      registrationSellerStart: '2025-01-01T00:00:00Z',
      registrationSellerEnd: '2025-01-02T00:00:00Z', // closed by "now"
      registrationEmployeeStart: null,
      registrationEmployeeEnd: null,
    };
    expect(isRegistrationOpen(basar, false, now)).toBe(false);
    expect(isRegistrationOpen(basar, true, now)).toBe(true); // employee window unset → open
  });

  it('reads the employee window for employees', () => {
    const basar = {
      registrationSellerStart: null,
      registrationSellerEnd: null,
      registrationEmployeeStart: '2025-01-01T00:00:00Z',
      registrationEmployeeEnd: '2025-01-02T00:00:00Z',
    };
    expect(isRegistrationOpen(basar, true, now)).toBe(false);
    expect(isRegistrationOpen(basar, false, now)).toBe(true);
  });

  it('isActivationOpen mirrors the same seller/employee split', () => {
    const basar = {
      activationSellerStart: '2025-06-01T00:00:00Z',
      activationSellerEnd: '2025-06-30T00:00:00Z',
      activationEmployeeStart: '2025-01-01T00:00:00Z',
      activationEmployeeEnd: '2025-01-02T00:00:00Z',
    };
    expect(isActivationOpen(basar, false, now)).toBe(true);
    expect(isActivationOpen(basar, true, now)).toBe(false);
  });
});

describe('deriveEventDate', () => {
  it('returns null when no day is set', () => {
    expect(deriveEventDate({})).toBeNull();
    expect(deriveEventDate({ dateFriday: null, dateSaturday: null, dateSunday: null })).toBeNull();
  });

  it('returns the single set day', () => {
    const d = deriveEventDate({ dateSaturday: '2025-06-14T00:00:00Z' });
    expect(d?.toISOString()).toBe('2025-06-14T00:00:00.000Z');
  });

  it('returns the earliest of multiple set days, regardless of field order', () => {
    const d = deriveEventDate({
      dateSunday: '2025-06-15T00:00:00Z',
      dateFriday: '2025-06-13T00:00:00Z',
      dateSaturday: '2025-06-14T00:00:00Z',
    });
    expect(d?.toISOString()).toBe('2025-06-13T00:00:00.000Z');
  });
});

describe('dateForWeekday', () => {
  const basar = {
    dateFriday: '2025-06-13T00:00:00Z',
    dateSaturday: '2025-06-14T00:00:00Z',
    dateSunday: '2025-06-15T00:00:00Z',
  };

  it('maps German weekday names to the matching field', () => {
    expect(dateForWeekday(basar, 'Freitag')?.toISOString()).toBe('2025-06-13T00:00:00.000Z');
    expect(dateForWeekday(basar, 'Samstag')?.toISOString()).toBe('2025-06-14T00:00:00.000Z');
    expect(dateForWeekday(basar, 'Sonntag')?.toISOString()).toBe('2025-06-15T00:00:00.000Z');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(dateForWeekday(basar, ' freitag ')?.toISOString()).toBe('2025-06-13T00:00:00.000Z');
  });

  it('returns null for an unknown day or an unset field', () => {
    expect(dateForWeekday(basar, 'Montag')).toBeNull();
    expect(dateForWeekday({ dateFriday: null }, 'Freitag')).toBeNull();
  });
});
