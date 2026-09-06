import { describe, it, expect } from 'vitest';
import {
  isWindowOpen,
  isActivationOpen,
  deriveEventDate,
  dateForWeekday,
  activationNotice,
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

describe('isActivationOpen', () => {
  // Registration itself has no window at all (account creation is basar-independent and
  // always open) – only participation activation for a specific basar is time-gated.
  const now = new Date('2025-06-15T12:00:00Z');

  it('reads the seller window for non-employees', () => {
    const basar = {
      activationSellerStart: '2025-01-01T00:00:00Z',
      activationSellerEnd: '2025-01-02T00:00:00Z', // closed by "now"
      activationEmployeeStart: null,
      activationEmployeeEnd: null,
    };
    expect(isActivationOpen(basar, false, now)).toBe(false);
    expect(isActivationOpen(basar, true, now)).toBe(true); // employee window unset → open
  });

  it('reads the employee window for employees', () => {
    const basar = {
      activationSellerStart: null,
      activationSellerEnd: null,
      activationEmployeeStart: '2025-01-01T00:00:00Z',
      activationEmployeeEnd: '2025-01-02T00:00:00Z',
    };
    expect(isActivationOpen(basar, true, now)).toBe(false);
    expect(isActivationOpen(basar, false, now)).toBe(true);
  });

  it('mirrors the same seller/employee split with both windows set', () => {
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

// ─── activationNotice ────────────────────────────────────────────────────────
// Anlass: die Karte unter "Meine Basare" bot den Teilnahme-Knopf immer an. Erst der Klick
// brachte vom Server ein rotes "Der Aktivierungszeitraum ist geschlossen" – ohne Termin.
// Geprüft wird deshalb beides: die Ja/Nein-Entscheidung *und* der Text, denn ein gesperrter
// Knopf ohne Begründung wäre keine Verbesserung.
describe('activationNotice', () => {
  // Fenster in deutscher Zeit: 01.09. 18:00 bis 10.09. 20:00 (MESZ = UTC+2).
  const basar = {
    status: 'OPEN',
    isArchived: false,
    activationSellerStart: '2026-09-01T16:00:00.000Z',
    activationSellerEnd: '2026-09-10T18:00:00.000Z',
    activationEmployeeStart: '2026-08-20T16:00:00.000Z',
    activationEmployeeEnd: '2026-08-25T18:00:00.000Z',
  };

  const vorher = new Date('2026-08-30T12:00:00.000Z');
  const mittendrin = new Date('2026-09-05T12:00:00.000Z');
  const danach = new Date('2026-09-15T12:00:00.000Z');

  it('sperrt vor dem Start und nennt den Beginn', () => {
    const n = activationNotice(basar, false, vorher);
    expect(n.canActivate).toBe(false);
    expect(n.message).toBe('Anmeldung für Verkäufer ab 01.09.2026, 18:00 Uhr.');
  });

  it('gibt im offenen Fenster frei und nennt das Ende', () => {
    const n = activationNotice(basar, false, mittendrin);
    expect(n.canActivate).toBe(true);
    expect(n.message).toBe('Anmeldung für Verkäufer noch bis 10.09.2026, 20:00 Uhr.');
  });

  it('sperrt nach dem Ende und nennt den Schluss', () => {
    const n = activationNotice(basar, false, danach);
    expect(n.canActivate).toBe(false);
    expect(n.message).toBe('Die Anmeldung für Verkäufer endete am 10.09.2026, 20:00 Uhr.');
  });

  // Der Kern der Sache: zwei Rollen, zwei Zeiträume. Am selben Tag darf der Verkäufer
  // noch nicht und der Mitarbeiter nicht mehr.
  it('wertet für Mitarbeiter das andere Fenster aus', () => {
    const amDreißigsten = new Date('2026-08-30T12:00:00.000Z');
    expect(activationNotice(basar, false, amDreißigsten)).toEqual({
      canActivate: false,
      message: 'Anmeldung für Verkäufer ab 01.09.2026, 18:00 Uhr.',
    });
    expect(activationNotice(basar, true, amDreißigsten)).toEqual({
      canActivate: false,
      message: 'Die Anmeldung für Mitarbeiter endete am 25.08.2026, 20:00 Uhr.',
    });
  });

  it('lässt den Mitarbeiter in seinem eigenen Fenster durch, den Verkäufer nicht', () => {
    const imMitarbeiterfenster = new Date('2026-08-22T12:00:00.000Z');
    expect(activationNotice(basar, true, imMitarbeiterfenster).canActivate).toBe(true);
    expect(activationNotice(basar, false, imMitarbeiterfenster).canActivate).toBe(false);
  });

  it('stimmt mit isActivationOpen überein', () => {
    // Text und Knopf dürfen nicht auseinanderlaufen: was die Karte freigibt, muss der
    // Server auch akzeptieren – beide entscheiden über dasselbe Fenster.
    for (const now of [vorher, mittendrin, danach, new Date('2026-08-22T12:00:00.000Z')]) {
      for (const isEmployee of [false, true]) {
        expect(activationNotice(basar, isEmployee, now).canActivate)
          .toBe(isActivationOpen(basar, isEmployee, now));
      }
    }
  });

  it.each(['DRAFT', 'CLOSED'])('sperrt bei Status %s unabhängig vom Fenster', (status) => {
    const n = activationNotice({ ...basar, status }, false, mittendrin);
    expect(n.canActivate).toBe(false);
    expect(n.message).toBe('Für diesen Basar ist keine Anmeldung möglich.');
  });

  it('sperrt einen archivierten Basar', () => {
    expect(activationNotice({ ...basar, isArchived: true }, false, mittendrin).canActivate).toBe(false);
  });

  it('gibt bei unvollständigem Fenster frei, ohne einen Termin zu erfinden', () => {
    // Gleiche Regel wie isWindowOpen – sonst liesse ein frisch angelegter Basar ohne
    // gepflegte Fenster niemanden durch.
    const n = activationNotice(
      { status: 'OPEN', activationSellerStart: '2026-09-01T16:00:00.000Z', activationSellerEnd: null },
      false,
      vorher
    );
    expect(n).toEqual({ canActivate: true, message: null });
  });
});
