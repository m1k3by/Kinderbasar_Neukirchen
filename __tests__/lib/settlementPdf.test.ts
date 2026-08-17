import { describe, it, expect } from 'vitest';
import zlib from 'zlib';
import {
  buildSettlementPdf,
  summarizeArticles,
  type SettlementPdfArticle,
  type SettlementPdfData,
} from '@/app/lib/settlementPdf';

function article(overrides: Partial<SettlementPdfArticle> = {}): SettlementPdfArticle {
  return {
    title: 'Jeans blau',
    sizeLabel: '110',
    price: 2.5,
    status: 'AVAILABLE',
    soldAt: null,
    ...overrides,
  };
}

describe('summarizeArticles', () => {
  it('leere Liste: alle drei Gruppen sind leer', () => {
    const result = summarizeArticles([]);
    expect(result.offered).toEqual({ count: 0, sum: 0 });
    expect(result.sold.summary).toEqual({ count: 0, sum: 0 });
    expect(result.archive.summary).toEqual({ count: 0, sum: 0 });
  });

  it('nur verkaufte Artikel: Archiv bleibt leer, angeboten = verkauft', () => {
    const articles = [
      article({ status: 'SOLD', price: 2 }),
      article({ status: 'SOLD', price: 3.5 }),
    ];
    const result = summarizeArticles(articles);
    expect(result.offered).toEqual({ count: 2, sum: 5.5 });
    expect(result.sold.summary).toEqual({ count: 2, sum: 5.5 });
    expect(result.archive.summary).toEqual({ count: 0, sum: 0 });
  });

  it('nur unverkaufte Artikel: Verkauft bleibt leer, angeboten = Archiv', () => {
    const articles = [
      article({ status: 'AVAILABLE', price: 4 }),
      article({ status: 'RETURNED', price: 1 }),
    ];
    const result = summarizeArticles(articles);
    expect(result.offered).toEqual({ count: 2, sum: 5 });
    expect(result.sold.summary).toEqual({ count: 0, sum: 0 });
    expect(result.archive.summary).toEqual({ count: 2, sum: 5 });
  });

  it('gemischt: angeboten = verkauft + Archiv, RETURNED zählt zum Archiv wie AVAILABLE', () => {
    const articles = [
      article({ status: 'SOLD', price: 3 }),
      article({ status: 'AVAILABLE', price: 2 }),
      article({ status: 'RETURNED', price: 1.5 }),
      article({ status: 'SOLD', price: 4 }),
    ];
    const result = summarizeArticles(articles);
    expect(result.offered).toEqual({ count: 4, sum: 10.5 });
    expect(result.sold.summary).toEqual({ count: 2, sum: 7 });
    expect(result.archive.summary).toEqual({ count: 2, sum: 3.5 });
    // Konsistenzregel: angeboten = verkauft + Archiv
    expect(result.offered.count).toBe(result.sold.summary.count + result.archive.summary.count);
    expect(result.offered.sum).toBeCloseTo(result.sold.summary.sum + result.archive.summary.sum, 6);
    // RETURNED landet im Archiv-Array, nicht in einer eigenen Gruppe
    expect(result.archive.articles.map(a => a.status).sort()).toEqual(['AVAILABLE', 'RETURNED']);
  });
});

function baseData(overrides: Partial<SettlementPdfData> = {}): SettlementPdfData {
  return {
    basarTitle: 'Frühjahrsbasar 2026',
    commissionPercent: 20,
    sellerNr: 9001,
    sellerName: 'Max Muster',
    generatedAt: '2026-08-16T10:00:00.000Z',
    grossRevenue: 7,
    commissionAmount: 1.4,
    entryFeeAmount: 2,
    netPayout: 3.6,
    articles: [
      article({ status: 'SOLD', price: 3, title: 'Jeans blau', sizeLabel: '110', soldAt: '2026-08-16T09:15:00.000Z' }),
      article({ status: 'SOLD', price: 4, title: 'Pullover rot', sizeLabel: '116', soldAt: '2026-08-16T09:30:00.000Z' }),
      article({ status: 'AVAILABLE', price: 2, title: 'Schuhe', sizeLabel: '28' }),
      article({ status: 'RETURNED', price: 1.5, title: 'Mütze', sizeLabel: null }),
    ],
    ...overrides,
  };
}

async function pdfBuffer(doc: ReturnType<typeof buildSettlementPdf>) {
  return Buffer.from(doc.output('arraybuffer'));
}

/** Alle Text-Anzeigeoperationen aus allen Content-Streams zusammengefasst. */
function allContent(buf: Buffer): string {
  const re = /stream\r?\n/g;
  const raw = buf.toString('latin1');
  let m: RegExpExecArray | null;
  let out = '';
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      out += zlib.inflateSync(buf.subarray(start, end)).toString('latin1');
    } catch {
      /* kein Flate-Stream */
    }
  }
  return out;
}

describe('buildSettlementPdf – Struktur', () => {
  it('ist ein A4-PDF', async () => {
    const doc = buildSettlementPdf(baseData());
    const buf = await pdfBuffer(doc);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const mediaBox = buf.toString('latin1').match(/\/MediaBox\s*\[([^\]]*)\]/)![1];
    const [, , w, h] = mediaBox.trim().split(/\s+/).map(Number);
    expect(w).toBeCloseTo(595.2756, 1);
    expect(h).toBeCloseTo(841.8898, 1);
  });

  it('setzt /PrintScaling /None', async () => {
    const buf = await pdfBuffer(buildSettlementPdf(baseData()));
    expect(buf.toString('latin1')).toContain('/PrintScaling /None');
  });

  it('nutzt nur Helvetica, keine eingebetteten Fonts', async () => {
    const buf = await pdfBuffer(buildSettlementPdf(baseData()));
    const raw = buf.toString('latin1');
    expect(raw).not.toMatch(/\/FontFile\d?/);
    expect(raw).toContain('/Helvetica');
  });
});

describe('buildSettlementPdf – Inhalt', () => {
  it('enthält die Übersichtszahlen: angeboten = verkauft + Archiv', async () => {
    const data = baseData();
    const buf = await pdfBuffer(buildSettlementPdf(data));
    const content = allContent(buf);
    // 4 angeboten, 2 verkauft (7 €), 2 Archiv (3,50 €)
    expect(content).toContain('Angeboten: 4 Artikel');
    expect(content).toContain('Verkauft: 2 Artikel');
    expect(content).toContain('Zurück ins Archiv: 2 Artikel');
    expect(content).toContain('7,00 \x80'); // WinAnsi € = 0x80, Summe der verkauften Artikel
    expect(content).toContain('3,50 \x80'); // Summe der Archiv-Artikel
  });

  it('zeigt Kopf, Zusammenfassung und beide Tabellenüberschriften', async () => {
    const data = baseData();
    const buf = await pdfBuffer(buildSettlementPdf(data));
    const content = allContent(buf);
    expect(content).toContain('Abrechnung Kinderbasar');
    expect(content).toContain(data.basarTitle);
    expect(content).toContain(`Verk\xe4ufer: ${data.sellerName}`);
    expect(content).toContain('VERK\xc4UFERNUMMER');
    expect(content).toContain(`#${data.sellerNr}`);
    expect(content).toContain('ZUSAMMENFASSUNG');
    expect(content).toContain('\xdcBERSICHT');
    // jsPDF escaped runde Klammern im PDF-Textstring als \( \)
    expect(content).toContain('VERKAUFTE ARTIKEL \\(2\\)');
    expect(content).toContain('ZUR\xdcCK INS ARCHIV \\(2\\)');
    expect(content).toContain('Netto-Auszahlung:');
    expect(content).toContain('3,60 \x80');
  });

  it('leere Artikellisten zeigen die Hinweistexte', async () => {
    const data = baseData({ articles: [] });
    const buf = await pdfBuffer(buildSettlementPdf(data));
    const content = allContent(buf);
    expect(content).toContain('Keine Artikel verkauft.');
    expect(content).toContain('Keine Artikel gehen zur\xfcck ins Archiv.');
    expect(content).toContain('Angeboten: 0 Artikel');
  });

  it('kürzt lange Artikeltitel wie im bisherigen Verkäufer-PDF', async () => {
    const longTitle = 'Ein sehr sehr sehr sehr sehr sehr sehr langer Artikeltitel';
    const data = baseData({
      articles: [article({ status: 'SOLD', title: longTitle, price: 1 })],
    });
    const buf = await pdfBuffer(buildSettlementPdf(data));
    const content = allContent(buf);
    expect(content).toContain(longTitle.substring(0, 38) + '\x85');
    expect(content).not.toContain(longTitle);
  });

  it('wiederholt die Tabellenkopfzeile bei Seitenumbruch innerhalb einer Tabelle', async () => {
    const manySold: SettlementPdfArticle[] = Array.from({ length: 40 }, (_, i) =>
      article({ status: 'SOLD', title: `Artikel ${i}`, price: 1, soldAt: '2026-08-16T09:00:00.000Z' })
    );
    const data = baseData({ articles: manySold });
    const buf = await pdfBuffer(buildSettlementPdf(data));
    const raw = buf.toString('latin1');
    // Mehrere Seiten erzeugt
    expect((raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThan(1);
    const content = allContent(buf);
    // Die Spaltenkopf-Beschriftung "Beschreibung" muss mehrfach vorkommen – einmal pro Seite
    // mit fortgesetzter Tabelle.
    const occurrences = content.split('Beschreibung').length - 1;
    expect(occurrences).toBeGreaterThan(1);
  });

  it('schreibt Uhrzeiten für verkaufte Artikel', async () => {
    const data = baseData();
    const buf = await pdfBuffer(buildSettlementPdf(data));
    const content = allContent(buf);
    // Keine feste Zeitzone annehmen (CI kann von der lokalen Maschine abweichen) – dieselbe
    // Umrechnung wie im Produktivcode verwenden, statt einen Offset zu raten.
    const expectedTime = new Date(data.articles[0].soldAt!).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(content).toContain(expectedTime);
  });
});
