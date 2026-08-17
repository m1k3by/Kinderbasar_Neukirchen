import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken, cashierToken } from '../helpers/tokens';
import { dec } from '../helpers/decimal';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  sale: { findMany: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/basars/[id]/cancellations/route';

function makeContext(id = 'basar-1') {
  return { params: Promise.resolve({ id }) };
}
function makeRequest() {
  return new Request('http://localhost/api/basars/basar-1/cancellations');
}

const article = {
  title: 'Strickpullover',
  sizeLabel: '134',
  qrCode: 'QR1',
  status: 'AVAILABLE',
  basarSeller: { sellerId: 9002, seller: { firstName: 'Klaus', lastName: 'Beispiel' } },
};

function cancelledSale(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    salePrice: dec(3.5),
    soldAt: new Date('2026-08-16T17:55:00Z'),
    cancelledAt: new Date('2026-08-16T18:10:00Z'),
    cancelledById: 9004,
    cashier: { sellerId: 9004, firstName: 'Hans', lastName: 'Kasse' },
    cancelledBy: { sellerId: 9004, firstName: 'Hans', lastName: 'Kasse' },
    article,
    ...overrides,
  };
}

describe('GET /api/basars/[id]/cancellations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 ohne Token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    expect((await GET(makeRequest(), makeContext())).status).toBe(401);
  });

  it('returns 403 für Kassierer ohne Admin-Rolle', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(9004) });
    expect((await GET(makeRequest(), makeContext())).status).toBe(403);
  });

  it('returns 403 für regulären Verkäufer', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9002) });
    expect((await GET(makeRequest(), makeContext())).status).toBe(403);
  });

  // Die Liste beantwortet drei Fragen pro Storno: wer hat angeboten, wer hat gescannt,
  // wer hat storniert. Fehlt eine davon, ist der Vorgang nicht mehr nachvollziehbar.
  it('liefert Verkäufer, Kassierer und Stornierenden je Storno', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([cancelledSale()]);

    const data = await (await GET(makeRequest(), makeContext())).json();

    expect(data.cancellations[0]).toMatchObject({
      articleTitle: 'Strickpullover',
      sizeLabel: '134',
      qrCode: 'QR1',
      salePrice: 3.5,
      sellerId: 9002,
      sellerName: 'Klaus Beispiel',
      cashierId: 9004,
      cashierName: 'Hans Kasse',
      cancelledById: 9004,
      cancelledByName: 'Hans Kasse',
      articleStatus: 'AVAILABLE',
    });
    expect(data.count).toBe(1);
    expect(data.total).toBe(3.5);
  });

  // Nur stornierte Verkäufe des angefragten Basars – sonst stünde in der Liste eines
  // Basars auch das Storno eines anderen.
  it('fragt nur stornierte Verkäufe dieses Basars ab, neueste zuerst', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([]);

    await GET(makeRequest(), makeContext('basar-42'));

    const args = prismaMock.sale.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ basarId: 'basar-42', isCancelled: true });
    expect(args.orderBy).toEqual([{ cancelledAt: 'desc' }, { soldAt: 'desc' }]);
  });

  // cancelledById null + cancelledAt gesetzt = Admin. Beides null = Altbestand von vor der
  // Protokollierung. Diese beiden Fälle dürfen nicht gleich aussehen, sonst wird jedem
  // alten Storno ein Admin untergeschoben.
  it('weist Admin-Storno und nicht protokollierten Altbestand unterschiedlich aus', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([
      cancelledSale({ id: 'admin-storno', cancelledById: null, cancelledBy: null }),
      cancelledSale({ id: 'alt', cancelledById: null, cancelledBy: null, cancelledAt: null }),
    ]);

    const data = await (await GET(makeRequest(), makeContext())).json();

    expect(data.cancellations[0]).toMatchObject({ cancelledByName: 'Admin', cancelledById: null });
    expect(data.cancellations[1]).toMatchObject({ cancelledByName: null, cancelledAt: null });
  });

  it('markiert erneut verkaufte Artikel über articleStatus', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([
      cancelledSale({ article: { ...article, status: 'SOLD' } }),
    ]);

    const data = await (await GET(makeRequest(), makeContext())).json();
    expect(data.cancellations[0].articleStatus).toBe('SOLD');
  });

  it('kommt ohne Kassiererzuordnung klar', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([cancelledSale({ cashier: null })]);

    const data = await (await GET(makeRequest(), makeContext())).json();
    expect(data.cancellations[0]).toMatchObject({ cashierId: null, cashierName: null });
  });

  // Decimal-Spalte: salePrice kommt als Prisma.Decimal. Ohne Number() summiert sich total
  // zu einem String – siehe __tests__/helpers/decimal.ts.
  it('summiert mehrere Stornos als Zahl, nicht als String', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([
      cancelledSale({ id: 's1', salePrice: dec(2.5) }),
      cancelledSale({ id: 's2', salePrice: dec(3.0) }),
    ]);

    const data = await (await GET(makeRequest(), makeContext())).json();
    expect(data.total).toBe(5.5);
    expect(data.count).toBe(2);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockRejectedValue(new Error('DB error'));
    expect((await GET(makeRequest(), makeContext())).status).toBe(500);
  });
});
