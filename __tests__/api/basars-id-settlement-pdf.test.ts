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
  basarSeller: { findUnique: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/basars/[id]/settlements/[sellerIdParam]/abrechnung.pdf/route';

function makeContext(id = 'basar-1', sellerIdParam = '9001') {
  return { params: Promise.resolve({ id, sellerIdParam }) };
}
function makeRequest() {
  return new Request('http://localhost/api/basars/basar-1/settlements/9001/abrechnung.pdf');
}

const fakeBasar = { title: 'Frühjahrsbasar 2026', commissionPercent: dec(20) };

const fakeSettlement = {
  grossRevenue: dec(7),
  commissionAmount: dec(1.4),
  entryFeeAmount: dec(2),
  netPayout: dec(3.6),
  generatedAt: new Date('2026-08-16T10:00:00.000Z'),
};

const fakeArticles = [
  { title: 'Jeans blau', sizeLabel: '110', price: dec(3), status: 'SOLD', soldAt: new Date('2026-08-16T09:15:00.000Z') },
  { title: 'Schuhe', sizeLabel: '28', price: dec(2), status: 'AVAILABLE', soldAt: null },
];

function fakeBasarSeller(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bs-1',
    seller: { firstName: 'Max', lastName: 'Muster', sellerId: 9001 },
    settlement: fakeSettlement,
    articles: fakeArticles,
    ...overrides,
  };
}

function happyPath(overrides: Record<string, unknown> = {}) {
  prismaMock.basar.findUnique.mockResolvedValue(fakeBasar);
  prismaMock.basarSeller.findUnique.mockResolvedValue(fakeBasarSeller(overrides));
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

describe('GET /api/basars/[id]/settlements/[sellerIdParam]/abrechnung.pdf – Auth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 ohne Token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('403 wenn ein Verkäufer die Abrechnung eines anderen Verkäufers anfordert', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9002) });
    const res = await GET(makeRequest(), makeContext('basar-1', '9001'));
    expect(res.status).toBe(403);
    expect(prismaMock.basar.findUnique).not.toHaveBeenCalled();
  });

  it('200 für den eigenen Verkäufer', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
    happyPath();
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('200 für Admins, unabhängig von der eigenen sellerId', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    happyPath();
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('404 wenn der Basar nicht existiert', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
    prismaMock.basar.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(404);
    expect(prismaMock.basarSeller.findUnique).not.toHaveBeenCalled();
  });

  it('404 wenn kein basarSeller existiert', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
    prismaMock.basar.findUnique.mockResolvedValue(fakeBasar);
    prismaMock.basarSeller.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('409 wenn noch keine Abrechnung erzeugt wurde', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
    happyPath({ settlement: null });
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/Abrechnung/);
  });

  it('500 bei Datenbankfehler', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
    prismaMock.basar.findUnique.mockRejectedValue(new Error('db weg'));
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});

describe('GET /api/basars/[id]/settlements/[sellerIdParam]/abrechnung.pdf – Inhalt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesGetMock.mockReturnValue({ value: sellerToken(9001) });
  });

  it('liefert ein gültiges PDF mit Download-Dateinamen ohne Umlaute', async () => {
    happyPath();
    const res = await GET(makeRequest(), makeContext());
    const cd = res.headers.get('Content-Disposition')!;
    expect(cd).toBe('attachment; filename="abrechnung-fruehjahrsbasar-2026-vk9001.pdf"');
    expect(cd).toMatch(/^[\x20-\x7E]+$/);
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const buf = await pdfBuffer(res);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('konvertiert Decimal-Werte korrekt (kein String-Concat-Bug)', async () => {
    // Regression: Prisma.Decimal + Prisma.Decimal ergäbe ohne Number()-Konvertierung eine
    // Zeichenkette statt einer Summe (siehe __tests__/helpers/decimal.ts). Ein einfacher
    // Statuscode-Check würde das nicht bemerken – deshalb die Beträge im entpackten PDF-Text
    // prüfen: 20 % Provision auf 7,00 € Brutto muss exakt 1,40 € ergeben, nicht "NaN" oder
    // eine verkettete Decimal-Zeichenkette.
    happyPath();
    const res = await GET(makeRequest(), makeContext());
    const buf = await pdfBuffer(res);
    const content = allContent(buf);
    expect(content).not.toContain('NaN');
    expect(content).toContain('7,00 \x80'); // Brutto-Erlös
    expect(content).toContain('1,40 \x80'); // Provision (20 %)
    expect(content).toContain('3,60 \x80'); // Netto-Auszahlung
    // jsPDF escaped runde Klammern im PDF-Textstring als \( \)
    expect(content).toContain('Provision \\(20%\\):');
  });
});
