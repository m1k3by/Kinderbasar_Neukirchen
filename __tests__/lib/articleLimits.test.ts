import { describe, it, expect } from 'vitest';
import { maxArticlesFor } from '@/app/lib/articleLimits';

const seller = { isEmployee: false };
const employee = { isEmployee: true };

describe('maxArticlesFor', () => {
  const basar = { maxArticlesPerSeller: 50, maxArticlesPerEmployee: 80 };

  it('gibt Verkäufern das Verkäuferlimit', () => {
    expect(maxArticlesFor(basar, seller)).toBe(50);
  });

  it('gibt Mitarbeitern das Mitarbeiterlimit', () => {
    expect(maxArticlesFor(basar, employee)).toBe(80);
  });

  // Der Kern der Rückwärtskompatibilität: Bestandsbasare haben kein Mitarbeiterlimit.
  // Ein Vorgabewert an dieser Stelle hätte bei einem Basar mit 80 Artikeln pro Verkäufer
  // das Mitarbeiterlimit stillschweigend abgesenkt.
  it('fällt ohne Mitarbeiterlimit auf das Verkäuferlimit zurück', () => {
    expect(maxArticlesFor({ maxArticlesPerSeller: 80 }, employee)).toBe(80);
    expect(maxArticlesFor({ maxArticlesPerSeller: 80, maxArticlesPerEmployee: null }, employee)).toBe(80);
    expect(maxArticlesFor({ maxArticlesPerSeller: 80, maxArticlesPerEmployee: undefined }, employee)).toBe(80);
  });

  it('erlaubt ein kleineres Mitarbeiterlimit als das Verkäuferlimit', () => {
    expect(maxArticlesFor({ maxArticlesPerSeller: 50, maxArticlesPerEmployee: 20 }, employee)).toBe(20);
  });

  describe('Einzelfall-Ausnahme (BasarSeller.maxArticlesOverride)', () => {
    it('sticht das Gruppenlimit bei beiden Gruppen', () => {
      expect(maxArticlesFor(basar, seller, 5)).toBe(5);
      expect(maxArticlesFor(basar, employee, 5)).toBe(5);
    });

    // Die Ausnahme wird pro Person bewusst gesetzt – auch nach unten. Würde hier das
    // Gruppenlimit gewinnen, ließe sich niemand mehr gezielt begrenzen.
    it('gilt auch, wenn sie niedriger ist als das Gruppenlimit', () => {
      expect(maxArticlesFor(basar, employee, 1)).toBe(1);
    });

    it('greift nicht, wenn sie nicht gesetzt ist', () => {
      expect(maxArticlesFor(basar, employee, null)).toBe(80);
      expect(maxArticlesFor(basar, employee, undefined)).toBe(80);
    });

    // 0 ist ein gültiger Wert: "darf gar keine Artikel einstellen". Eine Prüfung auf
    // Wahrheitswert statt auf null/undefined würde daraus stillschweigend 80 machen.
    it('behandelt 0 als echte Ausnahme, nicht als "nicht gesetzt"', () => {
      expect(maxArticlesFor(basar, employee, 0)).toBe(0);
      expect(maxArticlesFor(basar, seller, 0)).toBe(0);
    });
  });
});
