import { describe, it, expect } from 'vitest';
import { TERMS_VERSION, PRIVACY_VERSION, legalVersionLabel, consentSummary } from '@/app/lib/legalDocs';

describe('Fassungskonstanten', () => {
  // Die Konstanten landen als Nachweis in der Datenbank und werden auf den Rechtsseiten
  // als „Stand" angezeigt. Ein unsortierbares oder kaputtes Format macht beides wertlos.
  it('sind sortierbare ISO-Daten', () => {
    for (const version of [TERMS_VERSION, PRIVACY_VERSION]) {
      expect(version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(isNaN(new Date(`${version}T00:00:00Z`).getTime())).toBe(false);
    }
  });
});

describe('legalVersionLabel', () => {
  it('formatiert ein Fassungsdatum deutsch aus', () => {
    expect(legalVersionLabel('2025-11-01')).toBe('1. November 2025');
  });

  // Die Fassung wird als UTC gelesen. Ohne feste Zeitzone läge „2025-11-01" in westlichen
  // Zeitzonen auf dem 31. Oktober – der angezeigte Stand wiche dann vom gespeicherten ab.
  it('verschiebt das Datum nicht über die Zeitzone', () => {
    expect(legalVersionLabel('2025-01-01')).toBe('1. Januar 2025');
    expect(legalVersionLabel('2025-12-31')).toBe('31. Dezember 2025');
  });

  it('gibt unlesbare Werte unverändert zurück, statt „Invalid Date" anzuzeigen', () => {
    expect(legalVersionLabel('irgendwas')).toBe('irgendwas');
  });
});

describe('consentSummary', () => {
  // Der wichtigste Fall: keine Zustimmung darf niemals wie eine Zustimmung aussehen.
  it('meldet fehlende Zustimmung eindeutig', () => {
    expect(consentSummary(null)).toBe('Keine dokumentierte Zustimmung');
    expect(consentSummary(undefined)).toBe('Keine dokumentierte Zustimmung');
    expect(consentSummary({ termsAcceptedAt: null })).toBe('Keine dokumentierte Zustimmung');
    expect(consentSummary({ termsAcceptedAt: null, termsVersion: '2025-11-01' }))
      .toBe('Keine dokumentierte Zustimmung');
  });

  it('nennt Zeitpunkt und beide Fassungen', () => {
    const text = consentSummary({
      termsAcceptedAt: '2026-08-17T18:34:00.000Z',
      termsVersion: '2025-11-01',
      privacyVersion: '2025-11-01',
    });
    expect(text).toContain('17.08.2026'); // Europe/Berlin, nicht UTC-Datum verschoben
    expect(text).toContain('20:34');      // 18:34 UTC = 20:34 MESZ
    expect(text).toContain('AGB: Fassung 1. November 2025');
    expect(text).toContain('Datenschutzerklärung: Fassung 1. November 2025');
  });

  // Zeilen aus der Zeit vor der Versionierung haben einen Zeitstempel, aber keine Fassung.
  // Die Oberfläche darf dort nicht stillschweigend die aktuelle Fassung unterstellen –
  // das wäre ein behaupteter Nachweis, den es nicht gibt.
  it('weist eine fehlende Fassung als unbekannt aus, statt die aktuelle zu unterstellen', () => {
    const text = consentSummary({ termsAcceptedAt: '2026-08-17T18:34:00.000Z' });
    expect(text).toContain('AGB: Fassung unbekannt');
    expect(text).toContain('Datenschutzerklärung: Fassung unbekannt');
    expect(text).not.toContain(legalVersionLabel(TERMS_VERSION));
  });

  it('kommt mit einem kaputten Zeitstempel klar', () => {
    expect(consentSummary({ termsAcceptedAt: 'kein-datum' })).toContain('unbekanntem Zeitpunkt');
  });

  it('akzeptiert Date wie ISO-String', () => {
    const asDate = consentSummary({ termsAcceptedAt: new Date('2026-08-17T18:34:00.000Z') });
    const asString = consentSummary({ termsAcceptedAt: '2026-08-17T18:34:00.000Z' });
    expect(asDate).toBe(asString);
  });
});
