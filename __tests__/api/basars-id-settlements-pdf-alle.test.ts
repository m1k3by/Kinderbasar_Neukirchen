import { describe, it, expect, vi, beforeEach } from 'vitest';
import zlib from 'zlib';
import { dec } from '../helpers/decimal';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  basar: { findUnique: vi.fn() },
  basarSeller: { findMany: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/basars/[id]/settlements/abrechnungen.pdf/route';

function makeContext(id = 'basar-1') {
  return { params: Promise.resolve({ id }) };
}
function makeRequest() {
  return new Request('http://localhost/api/basars/basar-1/settlements/abrechnungen.pdf');
}

const fakeBasar = { title: 'Frühjahrsbasar 2026', commissionPercent: dec(20) };

function fakeSeller(sellerId: number, gross = 7) {
  return {
    id: `bs-${sellerId}`,
    sellerId,
    seller: { firstName: 'Max', lastName: `Muster${sellerId}`, sellerId },
    settlement: {
      grossRevenue: dec(gross),
      commissionAmount: dec(gross * 0.2),
      entryFeeAmount: dec(2),
      netPayout: dec(gross * 0.8 - 2),
      generatedAt: new Date('2026-08-16T10:00:00.000Z'),
    },
    articles: [
      { title: `Jeans ${sellerId}`, sizeLabel: '110', price: dec(3), status: 'SOLD', soldAt: new Date('2026-08-16T09:15:00.000Z') },
      { title: `Schuhe ${sellerId}`, sizeLabel: '28', price: dec(2), status: 'AVAILABLE', soldAt: null },
    ],
  };
}

/**
 * Bildet die zweistufige Abfrage der Route nach: erst die Schlüssel (id + sellerId), dann
 * blockweise die Details per `id: { in: [...] }`. Der Detail-Mock liefert nur die
 * angefragten IDs zurück – sonst würde ein fehlerhaftes Blocken (z. B. immer derselbe
 * Block) im Test unbemerkt bleiben.
 */
type FindManyArgs = { select?: unknown; where: { id: { in: string[] } } };

function mockSellers(sellers: object[]) {
  prismaMock.basar.findUnique.mockResolvedValue(fakeBasar);
  prismaMock.basarSeller.findMany.mockImplementation(async (args: FindManyArgs) => {
    const rows = sellers as { id: string; sellerId: number }[];
    if (args.select) return rows.map(s => ({ id: s.id, sellerId: s.sellerId }));
    const wanted = args.where.id.in;
    return rows.filter(s => wanted.includes(s.id));
  });
}

/** Argumente der Detailabfragen (die ohne `select`, also die blockweisen Ladevorgänge). */
function detailCalls(): FindManyArgs[] {
  return prismaMock.basarSeller.findMany.mock.calls
    .map((c: FindManyArgs[]) => c[0])
    .filter(a => !a.select);
}

async function pdfBuffer(res: Response) {
  return Buffer.from(await res.arrayBuffer());
}

/** Entpackt alle Content-Streams zusammen – dort stehen Text- und Zeichenoperationen. */
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

/** Zählt die Seitenobjekte des PDFs. */
function pageCount(buf: Buffer): number {
  return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe('GET /api/basars/[id]/settlements/abrechnungen.pdf – Auth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 ohne Token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  // Die Sammelabrechnung enthält die Beträge *aller* Verkäufer. Ein Verkäufer, der die
  // eigene Abrechnung sehen darf, darf sie deshalb nicht bekommen – und die Route darf
  // erst gar nicht in die Datenbank gehen.
  it('403 für Verkäufer – anders als bei der Einzelabrechnung', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(403);
    expect(prismaMock.basar.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.basarSeller.findMany).not.toHaveBeenCalled();
  });

  it('404 wenn der Basar nicht existiert', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('409 wenn noch keine Abrechnung erzeugt wurde', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    mockSellers([]);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Abrechnung/);
  });

  it('500 bei Datenbankfehler', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockRejectedValue(new Error('db weg'));
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});

describe('GET /api/basars/[id]/settlements/abrechnungen.pdf – Inhalt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesGetMock.mockReturnValue({ value: adminToken() });
  });

  it('liefert ein PDF mit ASCII-Dateinamen und Verkäuferzahl', async () => {
    mockSellers([fakeSeller(9001), fakeSeller(9002)]);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    const cd = res.headers.get('Content-Disposition')!;
    expect(cd).toBe('attachment; filename="abrechnungen-fruehjahrsbasar-2026-2-verkaeufer.pdf"');
    expect(cd).toMatch(/^[\x20-\x7E]+$/);
    expect((await pdfBuffer(res)).subarray(0, 5).toString()).toBe('%PDF-');
  });

  // Kern der Anforderung: *eine* Datei, in der jeder Verkäufer vorkommt. Ein Statuscode-
  // Check würde nicht bemerken, wenn nur der erste Verkäufer gerendert wird.
  it('enthält jeden Verkäufer genau einmal, sortiert nach Verkäufernummer', async () => {
    mockSellers([fakeSeller(9001), fakeSeller(9002), fakeSeller(9003)]);
    const res = await GET(makeRequest(), makeContext());
    const content = allContent(await pdfBuffer(res));
    expect(content).not.toContain('NaN');
    for (const nr of [9001, 9002, 9003]) {
      // Verkäufernummer steht groß im Kopf jeder Abrechnung – genau einmal je Verkäufer.
      expect(content.match(new RegExp(`#${nr}`, 'g')) ?? []).toHaveLength(1);
      expect(content.match(new RegExp(`Muster${nr}`, 'g')) ?? []).toHaveLength(1);
    }
    expect(content.indexOf('Muster9001')).toBeLessThan(content.indexOf('Muster9002'));
    expect(content.indexOf('Muster9002')).toBeLessThan(content.indexOf('Muster9003'));
  });

  // Jede Abrechnung muss auf einer eigenen Seite anfangen – sonst würde die zweite über die
  // letzte Seite der ersten gemalt und der Stapel wäre nicht trennbar.
  it('beginnt jede Abrechnung auf einer neuen Seite und hängt keine Leerseite an', async () => {
    mockSellers([fakeSeller(9001)]);
    const pagesOne = pageCount(await pdfBuffer(await GET(makeRequest(), makeContext())));
    expect(pagesOne).toBeGreaterThan(0);

    mockSellers([fakeSeller(9001), fakeSeller(9002), fakeSeller(9003)]);
    const pagesThree = pageCount(await pdfBuffer(await GET(makeRequest(), makeContext())));
    expect(pagesThree).toBe(pagesOne * 3);
  });

  // 2000 Verkäufer dürfen nicht in einer einzigen Abfrage mit allen Artikeln landen.
  it('lädt die Verkäufer blockweise statt alle Artikel auf einmal', async () => {
    const many = Array.from({ length: 120 }, (_, i) => fakeSeller(9000 + i));
    mockSellers(many);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    // 1 Schlüsselabfrage + 3 Detailblöcke à 50
    expect(detailCalls()).toHaveLength(3);
    expect(detailCalls().every(a => a.where.id.in.length <= 50)).toBe(true);
  });

  // Wird parallel "Neu berechnen" gedrückt, kann eine Settlement-Zeile zwischen Schlüssel-
  // und Detailabfrage verschwinden. Das darf den ganzen Stapel nicht scheitern lassen.
  it('überspringt Verkäufer, deren Abrechnung zwischenzeitlich verschwunden ist', async () => {
    const gone = { ...fakeSeller(9002), settlement: null };
    mockSellers([fakeSeller(9001), gone, fakeSeller(9003)]);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('2-verkaeufer');
    const content = allContent(await pdfBuffer(res));
    expect(content).toContain('Muster9001');
    expect(content).not.toContain('Muster9002');
    expect(content).toContain('Muster9003');
  });

  it('konvertiert Decimal-Werte korrekt (kein String-Concat-Bug)', async () => {
    mockSellers([fakeSeller(9001, 7)]);
    const res = await GET(makeRequest(), makeContext());
    const content = allContent(await pdfBuffer(res));
    expect(content).toContain('7,00 \x80'); // Brutto-Erlös
    expect(content).toContain('1,40 \x80'); // Provision (20 %)
    expect(content).toContain('3,60 \x80'); // Netto-Auszahlung
    expect(content).toContain('Provision \\(20%\\):');
  });
});
