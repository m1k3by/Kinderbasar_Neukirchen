import { describe, it, expect } from 'vitest';
import { roundPayout, settlementAmounts } from '@/app/lib/payout';

describe('roundPayout', () => {
  // Die drei Beispiele, mit denen die Orga die Regel beschrieben hat.
  it.each([
    [17.78, 17.8],
    [32.14, 32.1],
    [145.15, 145.2],
  ])('%p € → %p €', (ein, aus) => {
    expect(roundPayout(ein)).toBe(aus);
  });

  it('rundet bei exakt 5 Cent aufwärts', () => {
    expect(roundPayout(145.15)).toBe(145.2);
    expect(roundPayout(17.75)).toBe(17.8);
    expect(roundPayout(0.05)).toBe(0.1);
  });

  it('lässt glatte Beträge unverändert', () => {
    for (const n of [0, 0.1, 17.8, 53.6, 162.8, 1000]) {
      expect(roundPayout(n)).toBe(n);
    }
  });

  it('rundet unterhalb von 5 Cent ab', () => {
    expect(roundPayout(17.74)).toBe(17.7);
    expect(roundPayout(0.04)).toBe(0);
    expect(roundPayout(99.91)).toBe(99.9);
  });

  it('liefert für jeden Cent-Betrag ein Vielfaches von 10 Cent, höchstens 5 Cent daneben', () => {
    // Verstoesse sammeln statt 400 000 einzelne expect-Aufrufe – die brauchten laenger
    // als das Zeitlimit, und eine Liste nennt im Fehlerfall den konkreten Betrag.
    const verstoesse: string[] = [];
    for (let cents = 0; cents <= 200_000; cents++) {
      const betrag = cents / 100;
      const gerundet = roundPayout(betrag);
      if (Math.round(gerundet * 100) % 10 !== 0) verstoesse.push(`${betrag} -> ${gerundet} (kein 10er)`);
      if (Math.abs(gerundet - betrag) > 0.05 + 1e-9) verstoesse.push(`${betrag} -> ${gerundet} (zu weit)`);
    }
    expect(verstoesse.slice(0, 5)).toEqual([]);
  });

  // Dokumentiert, warum über Cent gerechnet wird und nicht `Math.round(x * 10) / 10`:
  // für positive Beträge sind beide gleich, bei negativen 5 Cent laufen sie auseinander.
  it('rundet negative Beträge vom Nullpunkt weg, anders als Math.round', () => {
    expect(Math.round(-17.75 * 10) / 10).toBe(-17.7);
    expect(roundPayout(-17.75)).toBe(-17.8);
    expect(roundPayout(-32.14)).toBe(-32.1);
  });
});

describe('settlementAmounts', () => {
  // Vorschau auf der Verkäuferseite und Abrechnung rechnen mit dieser einen Funktion. Jeder
  // Fall hier ist einer, den „Erlös minus Provision" allein falsch beantworten würde.

  it('rundet die Auszahlung auf 10 Cent, die Provision nicht', () => {
    // 7,72 € bei 20 %: Provision 1,544 → 1,54; Ergebnis 6,18 → Auszahlung 6,20.
    expect(settlementAmounts(7.72, 20, 0)).toEqual({ commissionAmount: 1.54, netPayout: 6.2 });
  });

  it('zieht die Teilnahmegebühr ab', () => {
    // 15 % von 40 € = 6 €, dazu 3 € Gebühr → 31 €, nicht 34 €.
    expect(settlementAmounts(40, 15, 3)).toEqual({ commissionAmount: 6, netPayout: 31 });
  });

  it('zahlt nie einen negativen Betrag aus', () => {
    // 2 € Erlös, 15 % = 0,30 €, 5 € Gebühr → wäre −3,30 €.
    expect(settlementAmounts(2, 15, 5).netPayout).toBe(0);
  });

  it('nimmt den übergebenen Satz – auch einen persönlichen Sondersatz', () => {
    expect(settlementAmounts(100, 0, 0)).toEqual({ commissionAmount: 0, netPayout: 100 });
    expect(settlementAmounts(100, 10, 0)).toEqual({ commissionAmount: 10, netPayout: 90 });
  });

  it('liefert für einen Verkäufer ohne Verkäufe 0', () => {
    expect(settlementAmounts(0, 15, 0)).toEqual({ commissionAmount: 0, netPayout: 0 });
  });

  it('rechnet den laufenden Basar richtig (15 %, keine Gebühr)', () => {
    // 12,50 € Erlös: Provision 1,875 → 1,88; Ergebnis 10,62 → Auszahlung 10,60.
    expect(settlementAmounts(12.5, 15, 0)).toEqual({ commissionAmount: 1.88, netPayout: 10.6 });
  });
});
