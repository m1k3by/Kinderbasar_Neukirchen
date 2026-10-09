import { describe, it, expect } from 'vitest';
import {
  SELLER_EXPORT_COLUMNS,
  activityStatus,
  buildSellerExportRows,
  excelSheetName,
  sellerExportFileName,
  type ExportSeller,
} from '@/app/lib/sellerExport';

function seller(overrides: Partial<ExportSeller> = {}): ExportSeller {
  return {
    sellerId: 9490,
    firstName: 'Erika',
    lastName: 'Musterfrau',
    email: 'erika@example.com',
    isEmployee: false,
    isCashier: false,
    isOrga: false,
    createdAt: '2026-02-14T10:00:00.000Z',
    participation: { isActive: false },
    _count: { taskSignups: 0, cakes: 0 },
    ...overrides,
  };
}

const LABEL = 'Herbst- und Winterbasar 2026 (Anmeldung offen)';

describe('buildSellerExportRows', () => {
  it('schreibt den Basar in jede Zeile', () => {
    const rows = buildSellerExportRows([seller(), seller({ sellerId: 1000 })], LABEL);
    expect(rows.map(r => r.basar)).toEqual([LABEL, LABEL]);
  });

  // Die Liste ist global, die Spalten Teilnahme und AGB/DS sind es nicht. Ohne den Basar
  // an erster Stelle ist die Datei nicht interpretierbar.
  it('führt den Basar als erste Spalte', () => {
    expect(SELLER_EXPORT_COLUMNS[0].key).toBe('basar');
    expect(SELLER_EXPORT_COLUMNS[0].header).toBe('Basar');
  });

  it('übernimmt Rolle, Orga und Kassierer als lesbare Werte', () => {
    const [ma] = buildSellerExportRows(
      [seller({ isEmployee: true, isOrga: true, isCashier: true })],
      LABEL
    );
    expect(ma.rolle).toBe('Mitarbeiter');
    expect(ma.orga).toBe('Ja');
    expect(ma.kassierer).toBe('Ja');

    const [vk] = buildSellerExportRows([seller()], LABEL);
    expect(vk.rolle).toBe('Verkäufer');
    expect(vk.orga).toBe('–');
    expect(vk.kassierer).toBe('–');
  });

  it('bildet die drei Teilnahme-Zustände wie die Tabelle ab', () => {
    const rows = buildSellerExportRows(
      [
        seller({ participation: { isActive: true } }),
        seller({ participation: { isActive: true, viaOrga: true } }),
        seller({ participation: { isActive: false } }),
      ],
      LABEL
    );
    expect(rows.map(r => r.teilnahme)).toEqual(['Aktiv', 'Aktiv (Orga)', 'Inaktiv']);
  });

  it('liefert fehlende AGB-Zustimmung als leere Zelle, nicht als Text', () => {
    const [ohne] = buildSellerExportRows(
      [seller({ participation: { isActive: true, termsAcceptedAt: null } })],
      LABEL
    );
    expect(ohne.agbAkzeptiert).toBeUndefined();

    const [mit] = buildSellerExportRows(
      [seller({ participation: { isActive: true, termsAcceptedAt: '2026-09-18T07:30:00.000Z' } })],
      LABEL
    );
    expect(mit.agbAkzeptiert).toBeInstanceOf(Date);
    expect(mit.agbAkzeptiert?.toISOString()).toBe('2026-09-18T07:30:00.000Z');
  });

  it('macht aus einem unbrauchbaren Datum keine "Invalid Date"-Zelle', () => {
    const [row] = buildSellerExportRows([seller({ createdAt: 'kaputt' })], LABEL);
    expect(row.registriert).toBeUndefined();
  });

  it('zählt Schichten und Kuchen, auch wenn _count fehlt', () => {
    const [mit] = buildSellerExportRows(
      [seller({ _count: { taskSignups: 3, cakes: 2 } })],
      LABEL
    );
    expect([mit.schichten, mit.kuchen]).toEqual([3, 2]);

    const [ohne] = buildSellerExportRows([seller({ _count: undefined })], LABEL);
    expect([ohne.schichten, ohne.kuchen]).toEqual([0, 0]);
  });

  it('übernimmt Name und E-Mail unverändert', () => {
    const [row] = buildSellerExportRows([seller()], LABEL);
    expect([row.nr, row.vorname, row.nachname, row.email]).toEqual([
      9490,
      'Erika',
      'Musterfrau',
      'erika@example.com',
    ]);
  });
});

describe('activityStatus', () => {
  it('gilt nur für Mitarbeiter', () => {
    expect(activityStatus(seller({ isEmployee: false, _count: { taskSignups: 5, cakes: 0 } }))).toBe('–');
    expect(activityStatus(seller({ isEmployee: true, _count: { taskSignups: 1, cakes: 0 } }))).toBe('Aktiv');
    expect(activityStatus(seller({ isEmployee: true, _count: { taskSignups: 0, cakes: 1 } }))).toBe('Aktiv');
    expect(activityStatus(seller({ isEmployee: true, _count: { taskSignups: 0, cakes: 0 } }))).toBe('Inaktiv');
  });
});

describe('SELLER_EXPORT_COLUMNS', () => {
  it('hat zu jeder Spalte Kopf, Breite und einen Schlüssel, den eine Zeile führt', () => {
    const [row] = buildSellerExportRows([seller()], LABEL);
    for (const col of SELLER_EXPORT_COLUMNS) {
      expect(col.header).toBeTruthy();
      expect(col.width).toBeGreaterThan(0);
      expect(Object.hasOwn(row, col.key)).toBe(true);
    }
  });

  it('formatiert Datumsspalten deutsch', () => {
    for (const col of SELLER_EXPORT_COLUMNS.filter(c => c.type === Date)) {
      expect(col.format).toBe('dd.mm.yyyy');
    }
  });
});

describe('sellerExportFileName', () => {
  it('enthält Basar und Datum, ohne Umlaute und Sonderzeichen', () => {
    const name = sellerExportFileName('Herbst- und Winterbasar 2026', new Date('2026-10-09T12:00:00Z'));
    expect(name).toBe('verkaeuferliste-herbst-und-winterbasar-2026-2026-10-09.xlsx');
  });

  it('kommt ohne brauchbaren Titel aus', () => {
    expect(sellerExportFileName('!!!', new Date('2026-10-09T12:00:00Z'))).toBe(
      'verkaeuferliste-2026-10-09.xlsx'
    );
  });
});

describe('excelSheetName', () => {
  // Excel verweigert die Datei bei verbotenen Zeichen oder mehr als 31 Zeichen.
  it('entfernt verbotene Zeichen und kürzt auf 31 Zeichen', () => {
    expect(excelSheetName('Basar: Herbst/Winter [2026]?')).toBe('Basar Herbst Winter 2026');
    const lang = excelSheetName('Ein ausgesprochen langer Basartitel von 2026');
    expect(lang).toHaveLength(31);
  });

  it('fällt auf einen Standardnamen zurück', () => {
    expect(excelSheetName('   ')).toBe('Verkäufer');
  });
});
