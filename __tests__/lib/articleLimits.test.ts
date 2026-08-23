import { describe, it, expect } from 'vitest';
import { formatArticleLimit, maxArticlesFor } from '@/app/lib/articleLimits';

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

  // Orga ist ein Zusatzkennzeichen für Mitarbeiter (Seller.isOrga), das der Admin setzt.
  // Diese Leute stellen die Artikel ein, die dem Basar selbst gehören – dafür gibt es keine
  // sinnvolle Obergrenze.
  describe('Orga', () => {
    const orga = { isEmployee: true, isOrga: true };

    it('hat kein Limit', () => {
      expect(maxArticlesFor(basar, orga)).toBe(Infinity);
    });

    // Der eigentliche Zweck: das Mitarbeiterlimit darf Orga nicht ausbremsen.
    it('sticht das Mitarbeiterlimit', () => {
      expect(maxArticlesFor({ maxArticlesPerSeller: 50, maxArticlesPerEmployee: 20 }, orga)).toBe(Infinity);
    });

    // Infinity ist so gewählt, dass die vorhandenen Vergleiche ohne Sonderfall stimmen.
    it('lässt jede Artikelzahl zu, ohne dass Aufrufer einen Sonderfall brauchen', () => {
      expect(5000 >= maxArticlesFor(basar, orga)).toBe(false);
    });

    it('ändert für Nicht-Orga nichts, auch wenn das Feld fehlt oder null ist', () => {
      expect(maxArticlesFor(basar, { isEmployee: true, isOrga: false })).toBe(80);
      expect(maxArticlesFor(basar, { isEmployee: true, isOrga: null })).toBe(80);
      expect(maxArticlesFor(basar, { isEmployee: true })).toBe(80);
      expect(maxArticlesFor(basar, { isEmployee: false, isOrga: false })).toBe(50);
    });

    // Bewusste Entscheidung: die Einzelfall-Ausnahme bleibt das stärkste Mittel. Wer einer
    // Orga-Person doch eine Obergrenze geben will, setzt sie dort – sonst gäbe es dafür
    // gar keine Möglichkeit mehr.
    it('unterliegt weiterhin der Einzelfall-Ausnahme', () => {
      expect(maxArticlesFor(basar, orga, 10)).toBe(10);
      expect(maxArticlesFor(basar, orga, 0)).toBe(0);
    });
  });

  describe('formatArticleLimit', () => {
    it('zeigt endliche Limits als Zahl', () => {
      expect(formatArticleLimit(50)).toBe('50');
      expect(formatArticleLimit(0)).toBe('0');
    });

    // Ohne diese Umformung stünde in der Oberfläche "Max. Infinity Artikel".
    it('zeigt ein unbegrenztes Limit als Wort', () => {
      expect(formatArticleLimit(Infinity)).toBe('unbegrenzt');
      expect(formatArticleLimit(maxArticlesFor(basar, { isEmployee: true, isOrga: true }))).toBe('unbegrenzt');
    });
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
