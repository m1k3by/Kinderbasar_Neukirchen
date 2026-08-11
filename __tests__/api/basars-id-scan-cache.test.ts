import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dec, decJson } from '../helpers/decimal';
import { adminToken, sellerToken, cashierToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  article: { aggregate: vi.fn(), findMany: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/basars/[id]/scan-cache/route';

function makeContext(id = 'basar-1') {
  return { params: Promise.resolve({ id }) };
}
function makeRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/basars/basar-1/scan-cache', { headers });
}

const emptyAgg = { _count: { _all: 0 }, _max: { createdAt: null, soldAt: null } };
const fakeArticleRow = {
  id: 'art-1',
  title: 'Shirt',
  sizeLabel: '104',
  price: dec(3.5),
  qrCode: 'QR1',
  status: 'AVAILABLE',
  basarSeller: { seller: { sellerId: 1234, firstName: 'Max', lastName: 'Muster' } },
};

describe('GET /api/basars/[id]/scan-cache', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 403 for a seller who is not a cashier', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(403);
    expect(prismaMock.article.aggregate).not.toHaveBeenCalled();
  });

  it('allows a cashier (isCashier true, non-admin role)', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(5555) });
    prismaMock.article.aggregate.mockResolvedValue(emptyAgg);
    prismaMock.article.findMany.mockResolvedValue([]);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
  });

  it('allows admin', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.article.aggregate.mockResolvedValue(emptyAgg);
    prismaMock.article.findMany.mockResolvedValue([]);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
  });

  it('projects id/title/sizeLabel/price/qrCode/status/sellerId/sellerName – same shape for admin and cashier', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(5555) });
    prismaMock.article.aggregate.mockResolvedValue({ _count: { _all: 1 }, _max: { createdAt: new Date(), soldAt: null } });
    prismaMock.article.findMany.mockResolvedValue([fakeArticleRow]);
    const res = await GET(makeRequest(), makeContext());
    const data = await res.json();
    expect(data.articles).toEqual([
      {
        id: 'art-1', title: 'Shirt', sizeLabel: '104', price: decJson(3.5), qrCode: 'QR1', status: 'AVAILABLE',
        sellerId: 1234, sellerName: 'Max Muster',
      },
    ]);
  });

  // Diese Route reicht die Decimal-Spalte unverändert durch, deshalb kommt der Preis als
  // **String** beim Client an – Prisma.Decimal serialisiert über toJSON() zur Zeichenkette.
  // Die Kasse muss ihn folglich mit Number() einlesen (siehe kasse/page.tsx, Aufbau des
  // Offline-Caches). Würde sie den Wert direkt in den Warenkorb legen, ergäbe die Summe eine
  // Verkettung statt eines Betrags. Der Test hält den Vertrag fest, damit niemand ihn
  // versehentlich ändert.
  it('liefert den Preis als String – Verbraucher müssen Number() anwenden', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(5555) });
    prismaMock.article.aggregate.mockResolvedValue({ _count: { _all: 1 }, _max: { createdAt: new Date(), soldAt: null } });
    prismaMock.article.findMany.mockResolvedValue([fakeArticleRow]);

    const data = await (await GET(makeRequest(), makeContext())).json();

    expect(typeof data.articles[0].price).toBe('string');
    expect(Number(data.articles[0].price)).toBe(3.5);
  });

  it('scopes to AVAILABLE and SOLD articles only (excludes RETURNED) for this basar', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.article.aggregate.mockResolvedValue(emptyAgg);
    prismaMock.article.findMany.mockResolvedValue([]);
    await GET(makeRequest(), makeContext());
    const where = prismaMock.article.findMany.mock.calls[0][0].where;
    expect(where.basarSeller).toEqual({ basarId: 'basar-1' });
    expect(where.status).toEqual({ in: ['AVAILABLE', 'SOLD'] });
  });

  it('sets an ETag header on a fresh 200 response', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.article.aggregate.mockResolvedValue({ _count: { _all: 2 }, _max: { createdAt: new Date('2026-01-01'), soldAt: null } });
    prismaMock.article.findMany.mockResolvedValue([fakeArticleRow]);
    const res = await GET(makeRequest(), makeContext());
    expect(res.headers.get('etag')).toBeTruthy();
  });

  it('returns 304 with a matching If-None-Match and does not query the article rows', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const agg = { _count: { _all: 2 }, _max: { createdAt: new Date('2026-01-01T00:00:00Z'), soldAt: null } };
    prismaMock.article.aggregate.mockResolvedValue(agg);

    // First request to learn the current ETag
    prismaMock.article.findMany.mockResolvedValue([fakeArticleRow]);
    const first = await GET(makeRequest(), makeContext());
    const etag = first.headers.get('etag')!;
    expect(etag).toBeTruthy();

    // Second request with that ETag as If-None-Match, aggregate unchanged → 304
    prismaMock.article.findMany.mockClear();
    const second = await GET(makeRequest({ 'If-None-Match': etag }), makeContext());
    expect(second.status).toBe(304);
    expect(prismaMock.article.findMany).not.toHaveBeenCalled();
  });

  it('returns a fresh 200 (different ETag) when the aggregate changed since the stored ETag', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.article.aggregate.mockResolvedValueOnce({ _count: { _all: 2 }, _max: { createdAt: new Date('2026-01-01T00:00:00Z'), soldAt: null } });
    prismaMock.article.findMany.mockResolvedValue([fakeArticleRow]);
    const first = await GET(makeRequest(), makeContext());
    const oldEtag = first.headers.get('etag')!;

    // Simulate a new sale changing the aggregate (soldAt advances)
    prismaMock.article.aggregate.mockResolvedValueOnce({ _count: { _all: 2 }, _max: { createdAt: new Date('2026-01-01T00:00:00Z'), soldAt: new Date('2026-01-02T00:00:00Z') } });
    const second = await GET(makeRequest({ 'If-None-Match': oldEtag }), makeContext());
    expect(second.status).toBe(200);
    expect(second.headers.get('etag')).not.toBe(oldEtag);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.article.aggregate.mockRejectedValue(new Error('DB error'));
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});
