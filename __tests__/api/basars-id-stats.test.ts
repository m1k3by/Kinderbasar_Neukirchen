import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';
import { dec } from '../helpers/decimal';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  sale: { groupBy: vi.fn(), count: vi.fn() },
  article: { count: vi.fn(), groupBy: vi.fn() },
  basarSeller: { count: vi.fn() },
  seller: { findMany: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/basars/[id]/stats/route';

function makeContext(id = 'basar-1') {
  return { params: Promise.resolve({ id }) };
}
function makeRequest() {
  return new Request('http://localhost/api/basars/basar-1/stats');
}

// Default-Mocks für die vier reinen Zähl-Queries, die mit den cashier-fokussierten Tests
// nichts zu tun haben.
function mockCountQueries(overrides: Partial<{ cancelled: number; offered: number; sold: number; active: number }> = {}) {
  prismaMock.sale.count.mockResolvedValue(overrides.cancelled ?? 0);
  prismaMock.article.count
    .mockResolvedValueOnce(overrides.offered ?? 0)
    .mockResolvedValueOnce(overrides.sold ?? 0);
  prismaMock.basarSeller.count.mockResolvedValue(overrides.active ?? 0);
}

// article.groupBy wird zweimal mit unterschiedlichem `by` aufgerufen (Preisbänder, Größen).
// Der Mock unterscheidet anhand von `args.by`, welche Rohdaten er liefert.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockArticleGroupBy(priceGroups: any[] = [], sizeGroups: any[] = []) {
  prismaMock.article.groupBy.mockImplementation((args: { by: string[] }) => {
    if (args.by.includes('price')) return Promise.resolve(priceGroups);
    return Promise.resolve(sizeGroups);
  });
}

describe('GET /api/basars/[id]/stats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.groupBy.mockRejectedValue(new Error('DB'));
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(500);
  });

  it('aggregiert korrekt, sortiert absteigend nach salesCount und behandelt cashierId:null als "Ohne Zuordnung"', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    // cashier 42 hat weniger Scans als cashier null – erwartete Ausgabe-Reihenfolge ist
    // deshalb umgekehrt zur groupBy-Reihenfolge, das belegt die Sortierung.
    prismaMock.sale.groupBy.mockResolvedValue([
      {
        cashierId: 42,
        _count: { _all: 2 },
        _sum: { salePrice: dec('7.50') },
        _min: { soldAt: new Date('2026-08-16T09:00:00Z') },
        _max: { soldAt: new Date('2026-08-16T09:30:00Z') },
      },
      {
        cashierId: null,
        _count: { _all: 5 },
        _sum: { salePrice: dec('20.00') },
        _min: { soldAt: new Date('2026-08-16T10:00:00Z') },
        _max: { soldAt: new Date('2026-08-16T12:15:00Z') },
      },
    ]);
    mockCountQueries({ cancelled: 3, offered: 10, sold: 7, active: 4 });
    mockArticleGroupBy();
    prismaMock.seller.findMany.mockResolvedValue([
      { sellerId: 42, firstName: 'Anna', lastName: 'Kassiererin' },
    ]);

    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();

    // Nur die tatsächlich referenzierten cashierIds werden nachgeladen – kein N+1 über alle
    // Seller.
    expect(prismaMock.seller.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sellerId: { in: [42] } } })
    );

    expect(data.totals).toEqual({
      salesCount: 7,
      revenue: 27.5,
      cancelledCount: 3,
      articlesOffered: 10,
      articlesSold: 7,
      activeSellers: 4,
    });

    expect(data.cashiers).toHaveLength(2);
    expect(data.cashiers[0]).toMatchObject({ cashierId: null, name: 'Ohne Zuordnung', salesCount: 5, revenue: 20 });
    expect(data.cashiers[1]).toMatchObject({ cashierId: 42, name: 'Anna Kassiererin', salesCount: 2, revenue: 7.5 });
    expect(typeof data.cashiers[0].revenue).toBe('number'); // nicht Decimal-String
  });

  it('groupBy filtert bereits nach isCancelled:false – Stornos zählen nur in cancelledCount', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.groupBy.mockResolvedValue([]);
    mockCountQueries({ cancelled: 9, offered: 0, sold: 0, active: 0 });
    mockArticleGroupBy();
    prismaMock.seller.findMany.mockResolvedValue([]);

    const res = await GET(makeRequest(), makeContext());
    const data = await res.json();

    expect(prismaMock.sale.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isCancelled: false }) })
    );
    expect(data.totals.salesCount).toBe(0);
    expect(data.totals.revenue).toBe(0);
    expect(data.totals.cancelledCount).toBe(9);
  });

  it('leere groupBy-Liste ergibt leere Kassiererliste ohne Absturz', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.groupBy.mockResolvedValue([]);
    mockCountQueries();
    mockArticleGroupBy();
    prismaMock.seller.findMany.mockResolvedValue([]);

    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.cashiers).toEqual([]);
    expect(prismaMock.seller.findMany).not.toHaveBeenCalled();
  });

  describe('Preisverteilung', () => {
    it('ordnet Grenzfälle 2,00 € und 2,50 € den richtigen Bändern zu, Artikel über 20 € landen im letzten Band', async () => {
      cookiesGetMock.mockReturnValue({ value: adminToken() });
      prismaMock.sale.groupBy.mockResolvedValue([]);
      mockCountQueries({ offered: 3, sold: 1 });
      mockArticleGroupBy([
        { price: dec('2.00'), status: 'SOLD', _count: { _all: 1 } },
        { price: dec('2.50'), status: 'AVAILABLE', _count: { _all: 1 } },
        { price: dec('25.00'), status: 'AVAILABLE', _count: { _all: 1 } },
      ]);
      prismaMock.seller.findMany.mockResolvedValue([]);

      const res = await GET(makeRequest(), makeContext());
      const data = await res.json();

      expect(data.priceBands).toHaveLength(5);
      expect(data.priceBands[0]).toMatchObject({ label: '0,50–2,00 €', offered: 1, sold: 1 });
      expect(data.priceBands[1]).toMatchObject({ label: '2,50–5,00 €', offered: 1, sold: 0 });
      expect(data.priceBands[2]).toMatchObject({ offered: 0, sold: 0 });
      expect(data.priceBands[3]).toMatchObject({ offered: 0, sold: 0 });
      expect(data.priceBands[4]).toMatchObject({ label: 'über 20,00 €', offered: 1, sold: 0 });
    });

    it('gibt auch leere Bänder mit 0 aus, damit die Tabelle stabil bleibt', async () => {
      cookiesGetMock.mockReturnValue({ value: adminToken() });
      prismaMock.sale.groupBy.mockResolvedValue([]);
      mockCountQueries();
      mockArticleGroupBy([]);
      prismaMock.seller.findMany.mockResolvedValue([]);

      const res = await GET(makeRequest(), makeContext());
      const data = await res.json();
      expect(data.priceBands).toHaveLength(5);
      expect(data.priceBands.every((b: { offered: number; sold: number }) => b.offered === 0 && b.sold === 0)).toBe(true);
    });
  });

  describe('Kategorien & Größen', () => {
    it('Artikel ohne sizeLabel und ohne gender zählt als "Keine Kleidung"', async () => {
      cookiesGetMock.mockReturnValue({ value: adminToken() });
      prismaMock.sale.groupBy.mockResolvedValue([]);
      mockCountQueries({ offered: 1, sold: 0 });
      mockArticleGroupBy(
        [],
        [{ sizeLabel: null, gender: null, status: 'AVAILABLE', _count: { _all: 1 } }]
      );
      prismaMock.seller.findMany.mockResolvedValue([]);

      const res = await GET(makeRequest(), makeContext());
      const data = await res.json();

      const kleidung = data.categories.find((c: { label: string }) => c.label === 'Kleidung');
      const keineKleidung = data.categories.find((c: { label: string }) => c.label === 'Keine Kleidung');
      expect(keineKleidung).toMatchObject({ offered: 1, sold: 0 });
      expect(kleidung).toMatchObject({ offered: 0, sold: 0 });
      expect(data.sizes).toEqual([]);
    });

    it('Artikel mit nur gender (ohne Größe) zählt als "Kleidung" unter "ohne Größe"', async () => {
      cookiesGetMock.mockReturnValue({ value: adminToken() });
      prismaMock.sale.groupBy.mockResolvedValue([]);
      mockCountQueries({ offered: 1, sold: 1 });
      mockArticleGroupBy(
        [],
        [{ sizeLabel: null, gender: 'Mädchen', status: 'SOLD', _count: { _all: 1 } }]
      );
      prismaMock.seller.findMany.mockResolvedValue([]);

      const res = await GET(makeRequest(), makeContext());
      const data = await res.json();

      const kleidung = data.categories.find((c: { label: string }) => c.label === 'Kleidung');
      expect(kleidung).toMatchObject({ offered: 1, sold: 1 });
      expect(data.sizes).toEqual([{ label: 'ohne Größe', offered: 1, sold: 1 }]);
    });

    it('begrenzt Größen auf Top 15 und fasst den Rest in "Sonstige" zusammen', async () => {
      cookiesGetMock.mockReturnValue({ value: adminToken() });
      prismaMock.sale.groupBy.mockResolvedValue([]);
      mockCountQueries({ offered: 17, sold: 0 });
      const sizeGroups = Array.from({ length: 17 }, (_, i) => ({
        sizeLabel: `Größe ${i}`,
        gender: null,
        status: 'AVAILABLE',
        // absteigend nach offered gestaffelt, damit die Sortierung eindeutig ist
        _count: { _all: 17 - i },
      }));
      mockArticleGroupBy([], sizeGroups);
      prismaMock.seller.findMany.mockResolvedValue([]);

      const res = await GET(makeRequest(), makeContext());
      const data = await res.json();

      expect(data.sizes).toHaveLength(16); // 15 Top-Größen + "Sonstige"
      expect(data.sizes[15]).toMatchObject({ label: 'Sonstige', offered: 3, sold: 0 }); // Größe 15 (offered 2) + Größe 16 (offered 1)
    });

    it('Verkaufsquote ist 0 bei 0 angebotenen Artikeln, keine Division durch null', async () => {
      cookiesGetMock.mockReturnValue({ value: adminToken() });
      prismaMock.sale.groupBy.mockResolvedValue([]);
      mockCountQueries();
      mockArticleGroupBy([], []);
      prismaMock.seller.findMany.mockResolvedValue([]);

      const res = await GET(makeRequest(), makeContext());
      const data = await res.json();
      expect(data.categories.every((c: { offered: number }) => c.offered === 0)).toBe(true);
      expect(data.sizes).toEqual([]);
    });
  });
});
