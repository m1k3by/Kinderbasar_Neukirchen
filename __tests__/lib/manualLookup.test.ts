import { describe, it, expect } from 'vitest';
import { lookupSellerArticles, parsePriceCents, type LookupArticle } from '@/app/lib/manualLookup';

function art(overrides: Partial<LookupArticle>): LookupArticle {
  return {
    qrCode: 'qr',
    title: 'Artikel',
    sizeLabel: '116',
    price: 3.5,
    sellerId: 1460,
    sellerName: 'Max Mustermann',
    status: 'AVAILABLE',
    ...overrides,
  };
}

const cache: LookupArticle[] = [
  art({ qrCode: 'a', title: 'Winterjacke blau', sizeLabel: '116', price: 8 }),
  art({ qrCode: 'b', title: 'Jeans', sizeLabel: '110', price: 3.5 }),
  art({ qrCode: 'c', title: 'Winterjacke rot', sizeLabel: '122', price: 8 }),
  art({ qrCode: 'd', title: 'Holzeisenbahn', sizeLabel: undefined, price: 12 }),
  art({ qrCode: 'e', title: 'Mütze', sizeLabel: '116', price: 2, status: 'SOLD' }),
  art({ qrCode: 'g', title: 'Winterjacke blau', sizeLabel: '116', price: 6.5 }),
  art({ qrCode: 'h', title: 'Body', sizeLabel: '86/92', price: 8 }),
  // 18,00 enthält die Ziffer 8 – ein Textvergleich beim Preis würde ihn fälschlich finden.
  art({ qrCode: 'i', title: 'Schneeanzug', sizeLabel: '98', price: 18 }),
  art({ qrCode: 'f', title: 'Fremde Jacke', sizeLabel: '116', price: 8, sellerId: 2000, sellerName: 'Erika Musterfrau' }),
];

const codes = (r: { matches: LookupArticle[] }) => r.matches.map(a => a.qrCode).sort();

describe('lookupSellerArticles – Verkäufer', () => {
  it('zeigt nur Artikel des eingegebenen Verkäufers', () => {
    const r = lookupSellerArticles(cache, 1460);
    expect(codes(r)).not.toContain('f');
    expect(r.sellerName).toBe('Max Mustermann');
  });

  it('lässt verkaufte Artikel weg, zählt sie aber mit', () => {
    const r = lookupSellerArticles(cache, 1460);
    expect(codes(r)).not.toContain('e');
    expect(r.total).toBe(8);
    expect(r.available).toBe(7);
  });

  it('sortiert nach Bezeichnung, bei Gleichstand nach Preis', () => {
    const r = lookupSellerArticles(cache, 1460);
    expect(r.matches.map(a => a.qrCode)).toEqual(['h', 'd', 'b', 'i', 'g', 'a', 'c']);
  });

  it('meldet einen unbekannten Verkäufer als leer statt mit fremden Artikeln', () => {
    expect(lookupSellerArticles(cache, 9999)).toEqual({ sellerName: null, total: 0, available: 0, matches: [] });
  });

  it('unterscheidet „alles verkauft" von „kein Treffer"', () => {
    const alleWeg = lookupSellerArticles([art({ status: 'SOLD' })], 1460);
    expect([alleWeg.total, alleWeg.available]).toEqual([1, 0]);

    const keinTreffer = lookupSellerArticles(cache, 1460, { title: 'gibtsnicht' });
    expect(keinTreffer.available).toBe(7);
    expect(keinTreffer.matches).toEqual([]);
  });
});

describe('lookupSellerArticles – Kombination aus Bezeichnung, Größe und Preis', () => {
  // Der Fall, für den die Suche gebaut ist: zwei gleich bezeichnete Jacken in derselben
  // Größe, erst der Preis macht daraus genau einen Artikel.
  it('grenzt mit allen drei Feldern auf genau einen Artikel ein', () => {
    expect(codes(lookupSellerArticles(cache, 1460, { title: 'jacke', size: '116' }))).toEqual(['a', 'g']);
    expect(codes(lookupSellerArticles(cache, 1460, { title: 'jacke', size: '116', price: '6,50' }))).toEqual(['g']);
  });

  it('verknüpft die Felder mit UND, nicht mit ODER', () => {
    // Jacke in 116 gibt es, Jacke für 3,50 nicht – zusammen also nichts.
    expect(codes(lookupSellerArticles(cache, 1460, { title: 'jacke', price: '3,50' }))).toEqual([]);
  });

  it('leere Felder schränken nicht ein', () => {
    expect(lookupSellerArticles(cache, 1460, { title: '', size: '  ', price: '' }).matches).toHaveLength(7);
  });

  it('Bezeichnung: jedes Wort muss vorkommen, Groß-/Kleinschreibung egal', () => {
    expect(codes(lookupSellerArticles(cache, 1460, { title: 'JACKE ROT' }))).toEqual(['c']);
  });
});

describe('lookupSellerArticles – Größe', () => {
  // Mit einem gemeinsamen Suchfeld traf „8" die Größe 86 und den Preis 8,00 zugleich.
  // Getrennte Felder dürfen sich nicht gegenseitig in die Quere kommen.
  it('vergleicht die Größe nicht mit dem Preis', () => {
    expect(codes(lookupSellerArticles(cache, 1460, { size: '8' }))).toEqual([]);
  });

  it('findet einen Teil einer kombinierten Größe', () => {
    expect(codes(lookupSellerArticles(cache, 1460, { size: '86' }))).toEqual(['h']);
    expect(codes(lookupSellerArticles(cache, 1460, { size: '92' }))).toEqual(['h']);
    expect(codes(lookupSellerArticles(cache, 1460, { size: '86/92' }))).toEqual(['h']);
  });

  it('nimmt keinen Teilstring: „6" findet weder 116 noch 86', () => {
    expect(codes(lookupSellerArticles(cache, 1460, { size: '6' }))).toEqual([]);
    expect(codes(lookupSellerArticles(cache, 1460, { size: '11' }))).toEqual([]);
  });

  it('schließt Artikel ohne Größe aus, sobald eine Größe gesucht wird', () => {
    expect(codes(lookupSellerArticles(cache, 1460, { size: '116' }))).not.toContain('d');
  });
});

describe('lookupSellerArticles – Preis', () => {
  it('vergleicht den Preis als Betrag, nicht als Text', () => {
    // „8" ist 8,00 – nicht 86/92 und nicht 18,00.
    expect(codes(lookupSellerArticles(cache, 1460, { price: '8' }))).toEqual(['a', 'c', 'h']);
  });

  it('akzeptiert Komma, Punkt und verkürzte Schreibweise', () => {
    for (const p of ['3,50', '3.50', '3,5', '3.5', '3,50 €']) {
      expect(codes(lookupSellerArticles(cache, 1460, { price: p }))).toEqual(['b']);
    }
  });

  it('filtert bei unfertiger oder unsinniger Eingabe nicht, statt alles auszublenden', () => {
    expect(lookupSellerArticles(cache, 1460, { price: 'abc' }).matches).toHaveLength(7);
  });
});

describe('parsePriceCents', () => {
  it('rechnet in Cent, ohne Rundungsfehler', () => {
    expect(parsePriceCents('3,50')).toBe(350);
    expect(parsePriceCents('0,10')).toBe(10);
    expect(parsePriceCents('12')).toBe(1200);
    expect(parsePriceCents('6,5')).toBe(650);
  });

  it('lehnt Unsinn ab', () => {
    for (const s of ['', 'abc', '3,555', '-2', '3,5,0']) {
      expect(parsePriceCents(s)).toBeNull();
    }
  });
});
