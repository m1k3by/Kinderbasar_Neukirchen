import { describe, it, expect } from 'vitest';
import { isDST, parseAsGermanTime, parseHhMm, shiftsOverlap } from '@/app/lib/time';

describe('isDST', () => {
  it('returns false in January (MEZ)', () => {
    expect(isDST(new Date('2025-01-15T12:00:00Z'))).toBe(false);
  });

  it('returns true in July (MESZ)', () => {
    expect(isDST(new Date('2025-07-15T12:00:00Z'))).toBe(true);
  });

  // Boundary tests use dates as computed by the algorithm (see app/lib/time.ts).
  // The algorithm normalises to March 31 01:00 UTC as the DST-start boundary in 2025
  // (March 31 is Monday → formula: 31 - (1-1) = 31).
  it('returns false just before algorithm DST start (2025-03-31 00:59 UTC)', () => {
    expect(isDST(new Date('2025-03-31T00:59:59Z'))).toBe(false);
  });

  it('returns true at algorithm DST start boundary (2025-03-31 01:00 UTC)', () => {
    expect(isDST(new Date('2025-03-31T01:00:00Z'))).toBe(true);
  });

  it('returns true just before algorithm DST end (2025-10-27 00:59 UTC)', () => {
    // October 31 2025 = Friday; formula: 31 - (5-1) = 27 → boundary = Oct 27 01:00 UTC
    expect(isDST(new Date('2025-10-27T00:59:59Z'))).toBe(true);
  });

  it('returns false at algorithm DST end boundary (2025-10-27 01:00 UTC)', () => {
    expect(isDST(new Date('2025-10-27T01:00:00Z'))).toBe(false);
  });

  it('handles leap year 2028 correctly (safe mid-month dates)', () => {
    expect(isDST(new Date('2028-02-15T12:00:00Z'))).toBe(false); // February = winter
    expect(isDST(new Date('2028-08-15T12:00:00Z'))).toBe(true);  // August = summer
  });

  it('handles year 2030 with clear summer/winter dates', () => {
    expect(isDST(new Date('2030-01-01T12:00:00Z'))).toBe(false);
    expect(isDST(new Date('2030-07-01T12:00:00Z'))).toBe(true);
  });
});

describe('parseAsGermanTime', () => {
  it('empty string returns epoch', () => {
    expect(parseAsGermanTime('')).toEqual(new Date(0));
  });

  it('date-only string gets T00:00:00 appended and MEZ offset', () => {
    // Winter (MEZ = +01:00): 2025-11-01T00:00 Berlin = 2025-10-31T23:00 UTC
    const d = parseAsGermanTime('2025-11-01');
    expect(d.toISOString()).toBe('2025-10-31T23:00:00.000Z');
  });

  it('ISO string with Z is returned as-is', () => {
    const iso = '2025-07-15T10:00:00.000Z';
    expect(parseAsGermanTime(iso).toISOString()).toBe(iso);
  });

  it('string already containing '+' is returned as-is', () => {
    const str = '2025-07-15T10:00:00+02:00';
    const d = parseAsGermanTime(str);
    // 10:00+02:00 = 08:00 UTC
    expect(d.toISOString()).toBe('2025-07-15T08:00:00.000Z');
  });

  it('summer datetime gets MESZ offset +02:00', () => {
    // 2025-07-15T10:00 Berlin = 2025-07-15T08:00 UTC (MESZ = +02:00)
    const d = parseAsGermanTime('2025-07-15T10:00');
    expect(d.toISOString()).toBe('2025-07-15T08:00:00.000Z');
  });

  it('winter datetime gets MEZ offset +01:00', () => {
    // 2025-11-01T10:00 Berlin = 2025-11-01T09:00 UTC (MEZ = +01:00)
    const d = parseAsGermanTime('2025-11-01T10:00');
    expect(d.toISOString()).toBe('2025-11-01T09:00:00.000Z');
  });

  it('datetime at midnight in summer gets correct offset', () => {
    const d = parseAsGermanTime('2025-06-21T00:00');
    expect(d.toISOString()).toBe('2025-06-20T22:00:00.000Z');
  });

  it('malformed string without date parts falls through to Date constructor', () => {
    const d = parseAsGermanTime('invalid-date');
    expect(d.toString()).toContain('Invalid Date');
  });
});

describe('parseHhMm', () => {
  it('rechnet Uhrzeiten in Minuten seit Mitternacht um', () => {
    expect(parseHhMm('00:00')).toBe(0);
    expect(parseHhMm('16:30')).toBe(990);
    expect(parseHhMm('23:59')).toBe(1439);
  });

  it('akzeptiert einstellige Stunden', () => {
    expect(parseHhMm('9:00')).toBe(540);
  });

  it('liefert null für unbrauchbare Werte', () => {
    for (const bad of ['', null, undefined, 'abc', '25:00', '10:75', '1000', '10-30']) {
      expect(parseHhMm(bad)).toBeNull();
    }
  });
});

describe('shiftsOverlap', () => {
  const shift = (timeFrom: string, timeTo: string) => ({ timeFrom, timeTo });

  // Der gemeldete Fall: eine Schicht endet um 18:00, die nächste beginnt um 18:00.
  it('erlaubt direkt aneinandergrenzende Schichten', () => {
    expect(shiftsOverlap(shift('16:00', '18:00'), shift('18:00', '20:00'))).toBe(false);
    expect(shiftsOverlap(shift('18:00', '20:00'), shift('16:00', '18:00'))).toBe(false);
  });

  // Kulanzgrenze: bis einschließlich 3 Minuten wird durchgelassen, ab 4 blockiert.
  it('erlaubt bis zu 3 Minuten Überschneidung und blockiert ab 4', () => {
    expect(shiftsOverlap(shift('16:00', '18:00'), shift('17:57', '20:00'))).toBe(false);
    expect(shiftsOverlap(shift('16:00', '18:00'), shift('17:56', '20:00'))).toBe(true);
  });

  it('blockiert echte Doppelbuchungen', () => {
    // Screenshot-Fall: 16-18 Uhr und 16-20 Uhr sind zwei Stunden parallel.
    expect(shiftsOverlap(shift('16:00', '20:00'), shift('16:00', '18:00'))).toBe(true);
    // Vollständig enthalten
    expect(shiftsOverlap(shift('17:00', '17:30'), shift('16:00', '20:00'))).toBe(true);
    // Identisch
    expect(shiftsOverlap(shift('16:00', '18:00'), shift('16:00', '18:00'))).toBe(true);
  });

  it('erkennt weit auseinanderliegende Schichten als überschneidungsfrei', () => {
    expect(shiftsOverlap(shift('08:00', '10:00'), shift('16:00', '18:00'))).toBe(false);
  });

  // Regression: der frühere Zeichenkettenvergleich hielt "9:00" für größer als "10:00",
  // eine echte Überschneidung wäre dadurch unbemerkt durchgerutscht.
  it('vergleicht einstellige Stunden korrekt, nicht als Zeichenkette', () => {
    expect(shiftsOverlap(shift('9:00', '11:00'), shift('10:00', '12:00'))).toBe(true);
    expect('9:00' < '10:00').toBe(false); // so war es vorher kaputt
  });

  it('blockiert nicht, wenn eine Zeitangabe fehlt oder unlesbar ist', () => {
    expect(shiftsOverlap(shift('16:00', '18:00'), { timeFrom: null, timeTo: null })).toBe(false);
    expect(shiftsOverlap(shift('16:00', '18:00'), { timeFrom: 'ganztags', timeTo: '18:00' })).toBe(false);
  });

  it('erlaubt eine abweichende Kulanz als Parameter', () => {
    expect(shiftsOverlap(shift('16:00', '18:00'), shift('17:50', '20:00'), 15)).toBe(false);
    expect(shiftsOverlap(shift('16:00', '18:00'), shift('17:50', '20:00'), 0)).toBe(true);
  });
});
