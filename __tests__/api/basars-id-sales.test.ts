import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dec } from '../helpers/decimal';
import { adminToken, sellerToken, cashierToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  basar: { findUnique: vi.fn() },
  article: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  sale: { findMany: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { POST, GET } from '@/app/api/basars/[id]/sales/route';

function makeContext(id = 'basar-1') {
  return { params: Promise.resolve({ id }) };
}
function makePostRequest(body: object) {
  return new Request('http://localhost/api/basars/basar-1/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function makeGetRequest() {
  return new Request('http://localhost/api/basars/basar-1/sales');
}

const activeBasar = { id: 'basar-1', status: 'ACTIVE' };
const availableArticle = { id: 'art-1', status: 'AVAILABLE', price: dec(3.0), qrCode: 'QR1' };

// Interactive transaction: prisma.$transaction(async (tx) => {...}). The mocked tx client
// reuses the same model mocks as the top-level prismaMock.
function mockTransactionSuccess() {
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
}

describe('POST /api/basars/[id]/sales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionSuccess();
  });

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST(makePostRequest({ items: [] }), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 403 for regular seller', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(makePostRequest({ items: [] }), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns 404 when basar not found', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(null);
    const res = await POST(makePostRequest({ items: [] }), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 400 when basar not ACTIVE', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'basar-1', status: 'OPEN' });
    const res = await POST(makePostRequest({ items: [] }), makeContext());
    expect(res.status).toBe(400);
  });

  it('sells article by articleId → 200, uses conditional updateMany', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    prismaMock.article.findUnique.mockResolvedValue(availableArticle);
    prismaMock.article.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.sale.create.mockResolvedValue({ id: 'sale-1' });
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1' }] }), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].success).toBe(true);
    expect(data.results[0].salePrice).toBe(3.0);
    expect(prismaMock.article.updateMany).toHaveBeenCalledWith({
      where: { id: 'art-1', status: 'AVAILABLE' },
      data: expect.objectContaining({ status: 'SOLD' }),
    });
  });

  // Ohne Preisangabe fällt die Route auf den Artikelpreis zurück. Der kommt aus einer
  // Decimal-Spalte und muss vor dem Schreiben in eine Zahl umgewandelt werden – sonst landet
  // eine Zeichenkette in Sale.salePrice und die Abrechnung summiert später Text statt Beträge.
  // Geprüft wird deshalb der *geschriebene* Wert, nicht nur der in der Antwort.
  it('schreibt den Verkaufspreis als Zahl in die Datenbank, nicht als Decimal', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    prismaMock.article.findUnique.mockResolvedValue(availableArticle); // price: dec(3.0)
    prismaMock.article.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.sale.create.mockResolvedValue({ id: 'sale-1' });

    await POST(makePostRequest({ items: [{ articleId: 'art-1' }] }), makeContext());

    const [[createArgs]] = prismaMock.sale.create.mock.calls;
    expect(createArgs.data.salePrice).toBe(3.0);
    expect(typeof createArgs.data.salePrice).toBe('number');
  });

  it('storno-then-resell: sale.create is called even though a cancelled sale already exists for the article', async () => {
    // The route only cares about the article's current status (AVAILABLE), not about
    // any pre-existing cancelled Sale rows – Sale.articleId is no longer unique.
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    prismaMock.article.findUnique.mockResolvedValue(availableArticle); // reset to AVAILABLE by storno
    prismaMock.article.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.sale.create.mockResolvedValue({ id: 'sale-new' });
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1' }] }), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].success).toBe(true);
    expect(data.results[0].saleId).toBe('sale-new');
    expect(prismaMock.sale.create).toHaveBeenCalled();
  });

  it('skips article that is no longer AVAILABLE (concurrent sale / already sold) with error in results', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(5555) });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    prismaMock.article.findUnique.mockResolvedValue({ ...availableArticle, status: 'SOLD' });
    prismaMock.article.updateMany.mockResolvedValue({ count: 0 }); // conditional update matched nothing
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1' }] }), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].error).toMatch(/verkauft/i);
    expect(prismaMock.sale.create).not.toHaveBeenCalled();
  });

  it('returns error result when article not found', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    prismaMock.article.findFirst.mockResolvedValue(null);
    prismaMock.article.findUnique.mockResolvedValue(null);
    const res = await POST(makePostRequest({ articleId: 'not-found' }), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].error).toBeDefined();
  });

  it('looks up article by qrCode', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    prismaMock.article.findFirst.mockResolvedValue(availableArticle);
    prismaMock.article.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.sale.create.mockResolvedValue({ id: 'sale-2' });
    const res = await POST(makePostRequest({ items: [{ qrCode: 'QR1' }] }), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].success).toBe(true);
  });

  it('admin checkout creates Sale with cashierId null', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    prismaMock.article.findUnique.mockResolvedValue(availableArticle);
    prismaMock.article.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.sale.create.mockResolvedValue({ id: 'sale-3' });
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1' }] }), makeContext());
    expect(res.status).toBe(200);
    expect(prismaMock.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cashierId: null }) })
    );
  });

  it('cashier checkout creates Sale with cashierId set from token', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(5555) });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    prismaMock.article.findUnique.mockResolvedValue(availableArticle);
    prismaMock.article.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.sale.create.mockResolvedValue({ id: 'sale-4' });
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1' }] }), makeContext());
    expect(res.status).toBe(200);
    expect(prismaMock.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cashierId: 5555 }) })
    );
  });

  // NaN/Infinity can't round-trip through JSON.stringify, so they're represented as
  // strings here (mirrors what a malformed client payload would actually send).
  it.each([0, -1, 1001, 'not-a-number', 'Infinity'])('rejects invalid salePrice %p with per-item error, does not 500 the batch', async (badPrice) => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    prismaMock.article.findUnique.mockResolvedValue(availableArticle);
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1', salePrice: badPrice }] }), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].error).toMatch(/ungültig/i);
    expect(prismaMock.article.updateMany).not.toHaveBeenCalled();
  });

  it('rounds a valid salePrice to 2 decimals', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    prismaMock.article.findUnique.mockResolvedValue(availableArticle);
    prismaMock.article.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.sale.create.mockResolvedValue({ id: 'sale-5' });
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1', salePrice: 2.999 }] }), makeContext());
    const data = await res.json();
    expect(data.results[0].salePrice).toBe(3.0);
  });

  it('one failing item does not 500 the whole batch', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    prismaMock.article.findUnique
      .mockResolvedValueOnce(availableArticle)
      .mockResolvedValueOnce(null);
    prismaMock.article.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.sale.create.mockResolvedValue({ id: 'sale-6' });
    const res = await POST(
      makePostRequest({ items: [{ articleId: 'art-1' }, { articleId: 'missing' }] }),
      makeContext()
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results).toHaveLength(2);
    expect(data.results[0].success).toBe(true);
    expect(data.results[1].error).toBeDefined();
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockRejectedValue(new Error('DB'));
    const res = await POST(makePostRequest({ items: [] }), makeContext());
    expect(res.status).toBe(500);
  });
});

describe('GET /api/basars/[id]/sales', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 403 for regular seller', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns sales list → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([{ id: 'sale-1', salePrice: dec(3.0) }]);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sales).toHaveLength(1);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockRejectedValue(new Error('DB'));
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});
