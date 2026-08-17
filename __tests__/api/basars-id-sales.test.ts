import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dec } from '../helpers/decimal';
import { adminToken, sellerToken, cashierToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  basar: { findUnique: vi.fn() },
  article: { findMany: vi.fn(), updateManyAndReturn: vi.fn() },
  sale: { findMany: vi.fn(), createManyAndReturn: vi.fn() },
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

/** Artikel, die die Auflösungs-Query zurückliefert (per qrCode wie per id). */
function mockArticles(articles: object[]) {
  prismaMock.article.findMany.mockResolvedValue(articles);
}

/**
 * Ergebnis des bedingten Updates: genau diese Artikel-IDs waren noch AVAILABLE und wurden
 * auf SOLD umgestellt. Alle übrigen übergebenen Artikel gelten damit als bereits verkauft.
 * createManyAndReturn spiegelt die geschriebenen Zeilen, damit die Argumentprüfung greift.
 */
function mockSold(soldIds: string[], salePrefix = 'sale') {
  prismaMock.article.updateManyAndReturn.mockResolvedValue(soldIds.map((id) => ({ id })));
  prismaMock.sale.createManyAndReturn.mockImplementation(async (args: any) =>
    args.data.map((d: any) => ({ id: `${salePrefix}-${d.articleId}`, articleId: d.articleId }))
  );
}

/** Die tatsächlich in Sale geschriebenen Datensätze (Argumente von createManyAndReturn). */
function writtenSales(): any[] {
  return prismaMock.sale.createManyAndReturn.mock.calls[0]?.[0]?.data ?? [];
}

// Interactive transaction: prisma.$transaction(async (tx) => {...}). The mocked tx client
// reuses the same model mocks as the top-level prismaMock.
function mockTransactionSuccess() {
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
}

describe('POST /api/basars/[id]/sales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionSuccess();
    prismaMock.article.findMany.mockResolvedValue([]);
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

  it('sells article by articleId → 200, uses conditional updateManyAndReturn', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    mockArticles([availableArticle]);
    mockSold(['art-1']);
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1' }] }), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].success).toBe(true);
    expect(data.results[0].salePrice).toBe(3.0);
    expect(prismaMock.article.updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['art-1'] }, status: 'AVAILABLE' },
        data: expect.objectContaining({ status: 'SOLD' }),
      })
    );
  });

  // Ohne Preisangabe fällt die Route auf den Artikelpreis zurück. Der kommt aus einer
  // Decimal-Spalte und muss vor dem Schreiben in eine Zahl umgewandelt werden – sonst landet
  // eine Zeichenkette in Sale.salePrice und die Abrechnung summiert später Text statt Beträge.
  // Geprüft wird deshalb der *geschriebene* Wert, nicht nur der in der Antwort.
  it('schreibt den Verkaufspreis als Zahl in die Datenbank, nicht als Decimal', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    mockArticles([availableArticle]); // price: dec(3.0)
    mockSold(['art-1']);

    await POST(makePostRequest({ items: [{ articleId: 'art-1' }] }), makeContext());

    expect(writtenSales()[0].salePrice).toBe(3.0);
    expect(typeof writtenSales()[0].salePrice).toBe('number');
  });

  it('storno-then-resell: a Sale is written even though a cancelled sale already exists for the article', async () => {
    // The route only cares about the article's current status (AVAILABLE), not about
    // any pre-existing cancelled Sale rows – Sale.articleId is no longer unique.
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    mockArticles([availableArticle]); // reset to AVAILABLE by storno
    mockSold(['art-1'], 'sale-new');
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1' }] }), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].success).toBe(true);
    expect(data.results[0].saleId).toBe('sale-new-art-1');
    expect(writtenSales()).toHaveLength(1);
  });

  it('skips article that is no longer AVAILABLE (concurrent sale / already sold) with error in results', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(5555) });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    mockArticles([{ ...availableArticle, status: 'SOLD' }]);
    mockSold([]); // conditional update matched nothing
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1' }] }), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].error).toMatch(/verkauft/i);
    expect(prismaMock.sale.createManyAndReturn).not.toHaveBeenCalled();
  });

  // Zwei Kassen scannen denselben Artikel: nur eine darf ihn verkaufen. Geprüft wird, dass für
  // den nicht umgestellten Artikel *kein* Sale geschrieben wird – der Statuscode ist bei einem
  // Teilerfolg in beiden Fällen 200.
  it('schreibt in einem gemischten Batch nur für tatsächlich umgestellte Artikel einen Sale', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    mockArticles([availableArticle, { id: 'art-2', status: 'SOLD', price: dec(5.0), qrCode: 'QR2' }]);
    mockSold(['art-1']); // art-2 war schon weg
    const res = await POST(
      makePostRequest({ items: [{ articleId: 'art-1' }, { articleId: 'art-2' }] }),
      makeContext()
    );
    const data = await res.json();
    expect(data.results[0].success).toBe(true);
    expect(data.results[1].error).toMatch(/verkauft/i);
    expect(writtenSales()).toHaveLength(1);
    expect(writtenSales()[0].articleId).toBe('art-1');
  });

  // Derselbe Artikel zweimal im selben Warenkorb darf nur einmal kassiert werden – sonst
  // stünden zwei Sale-Zeilen für einen physisch einmal verkauften Artikel in der Abrechnung.
  it('kassiert einen doppelt übergebenen Artikel nur einmal', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    mockArticles([availableArticle]);
    mockSold(['art-1']);
    const res = await POST(makePostRequest({ items: [{ qrCode: 'QR1' }, { qrCode: 'QR1' }] }), makeContext());
    const data = await res.json();
    expect(data.results[0].success).toBe(true);
    expect(data.results[1].error).toMatch(/verkauft/i);
    expect(writtenSales()).toHaveLength(1);
  });

  it('returns error result when article not found', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    mockArticles([]);
    const res = await POST(makePostRequest({ articleId: 'not-found' }), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].error).toBeDefined();
  });

  it('looks up article by qrCode, scoped to this basar', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    mockArticles([availableArticle]);
    mockSold(['art-1']);
    const res = await POST(makePostRequest({ items: [{ qrCode: 'QR1' }] }), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].success).toBe(true);
    // qrCode ist über Basare hinweg nicht eindeutig – ohne die basarSeller-Einschränkung
    // könnte der Artikel eines fremden Basars kassiert werden.
    expect(prismaMock.article.findMany).toHaveBeenCalledWith({
      where: { qrCode: { in: ['QR1'] }, basarSeller: { basarId: 'basar-1' } },
    });
  });

  it('admin checkout creates Sale with cashierId null', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    mockArticles([availableArticle]);
    mockSold(['art-1']);
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1' }] }), makeContext());
    expect(res.status).toBe(200);
    expect(writtenSales()[0].cashierId).toBeNull();
  });

  it('cashier checkout creates Sale with cashierId set from token', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(5555) });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    mockArticles([availableArticle]);
    mockSold(['art-1']);
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1' }] }), makeContext());
    expect(res.status).toBe(200);
    expect(writtenSales()[0].cashierId).toBe(5555);
  });

  it('persists clientTxId on every written Sale', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    mockArticles([availableArticle]);
    mockSold(['art-1']);
    await POST(makePostRequest({ items: [{ articleId: 'art-1' }], clientTxId: 'tx-42' }), makeContext());
    expect(writtenSales()[0].clientTxId).toBe('tx-42');
  });

  // NaN/Infinity can't round-trip through JSON.stringify, so they're represented as
  // strings here (mirrors what a malformed client payload would actually send).
  it.each([0, -1, 1001, 'not-a-number', 'Infinity'])('rejects invalid salePrice %p with per-item error, does not 500 the batch', async (badPrice) => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    mockArticles([availableArticle]);
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1', salePrice: badPrice }] }), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].error).toMatch(/ungültig/i);
    expect(prismaMock.article.updateManyAndReturn).not.toHaveBeenCalled();
  });

  it('rounds a valid salePrice to 2 decimals', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    mockArticles([availableArticle]);
    mockSold(['art-1']);
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1', salePrice: 2.999 }] }), makeContext());
    const data = await res.json();
    expect(data.results[0].salePrice).toBe(3.0);
    expect(writtenSales()[0].salePrice).toBe(3.0);
  });

  it('one failing item does not 500 the whole batch', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    mockArticles([availableArticle]); // 'missing' liefert die Query nicht zurück
    mockSold(['art-1']);
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

  // Der Warenkorb an der Kasse hat regelmäßig 20+ Artikel. Löst die Route jeden Artikel
  // einzeln auf und schreibt ihn in einer eigenen Transaktion, wächst die Antwortzeit linear
  // bis ins Function-Timeout – die Kasse steht dann mitten im Verkauf. Die Zahl der
  // DB-Aufrufe muss deshalb unabhängig von der Warenkorbgröße sein.
  it('braucht für 25 Artikel genauso viele DB-Aufrufe wie für einen', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    const many = Array.from({ length: 25 }, (_, i) => ({
      id: `art-${i}`, status: 'AVAILABLE', price: dec(2.0), qrCode: `QR-${i}`,
    }));
    mockArticles(many);
    mockSold(many.map((a) => a.id));
    const res = await POST(makePostRequest({ items: many.map((a) => ({ qrCode: a.qrCode })) }), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).results.filter((r: any) => r.success)).toHaveLength(25);
    expect(prismaMock.article.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.article.updateManyAndReturn).toHaveBeenCalledTimes(1);
    expect(prismaMock.sale.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(writtenSales()).toHaveLength(25);
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
