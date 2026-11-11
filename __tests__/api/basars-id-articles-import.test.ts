import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dec } from '../helpers/decimal';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  seller: { findUnique: vi.fn() },
  basar: { findUnique: vi.fn() },
  basarSeller: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), upsert: vi.fn() },
  sellerArticle: { findMany: vi.fn() },
  article: { count: vi.fn(), createManyAndReturn: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { POST } from '@/app/api/basars/[id]/articles/import/route';

function makeContext(id = 'basar-1') {
  return { params: Promise.resolve({ id }) };
}
function makePostRequest(body: object) {
  return new Request('http://localhost/api/basars/basar-1/articles/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const openBasar = { id: 'basar-1', status: 'OPEN', maxSellers: 100, maxArticlesPerSeller: 50 };
const fakeBasarSeller = { id: 'bs-1', basarId: 'basar-1', sellerId: 1234, maxArticlesOverride: null, isActive: true };
const archiveItems = [
  { id: 'sa-1', title: 'Shirt', sizeLabel: '80', gender: null, price: dec(2.5), qrCode: 'uuid-1', articles: [] },
];

describe('POST /api/basars/[id]/articles/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Interaktive Transaktion: der tx-Client ist derselbe Mock (wie basars-id-articles.test.ts).
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  });

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 403 for admin', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());
    expect(res.status).toBe(403);
  });

  it('lets a seller WITHOUT an active participation import from the archive', async () => {
    // Die Archivübernahme ist Artikelanlage und damit ebenso von der Teilnahme entkoppelt
    // wie POST /api/basars/[id]/articles. Früher gab es hier ein 403.
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue({ ...fakeBasarSeller, isActive: false });
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.sellerArticle.findMany.mockResolvedValue(archiveItems);
    prismaMock.article.createManyAndReturn.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);

    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());

    expect(res.status).toBe(201);
    expect(prismaMock.article.createManyAndReturn.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ basarSellerId: 'bs-1' }),
    ]);
  });

  it('returns 404 when basar not found', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(null);
    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 400 when basar not OPEN', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue({ ...openBasar, status: 'ACTIVE' });
    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());
    expect(res.status).toBe(400);
  });

  it('returns 400 when empty sellerArticleIds', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(0);
    const res = await POST(makePostRequest({ sellerArticleIds: [] }), makeContext());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/keine Artikel/i);
  });

  it('returns 400 when all articles already in basar', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.sellerArticle.findMany.mockResolvedValue([
      { ...archiveItems[0], articles: [{ id: 'art-1' }] }, // already in basar
    ]);
    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/bereits/i);
  });

  it('does NOT apply the maxSellers limit to the archive import', async () => {
    // Wie bei POST /articles: eine inaktive Zeile belegt keinen Teilnehmerplatz, ein
    // ausgebuchter Basar darf die Artikelanlage deshalb nicht blockieren.
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.count.mockResolvedValue(100);
    prismaMock.basarSeller.upsert.mockResolvedValue({ ...fakeBasarSeller, isActive: false });
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.sellerArticle.findMany.mockResolvedValue(archiveItems);
    prismaMock.article.createManyAndReturn.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);

    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());

    expect(res.status).toBe(201);
  });

  it('imports articles successfully → 201', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(5);
    prismaMock.sellerArticle.findMany.mockResolvedValue(archiveItems);
    prismaMock.article.createManyAndReturn.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);
    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.articles).toHaveLength(1);
  });

  // Kernversprechen der Archivübernahme: Der QR-Code bleibt derselbe, damit bereits gedruckte
  // Etiketten weiter gelten (siehe CLAUDE.md – Verkäufernummer und Artikel-QR sind basar-
  // übergreifend stabil). Bisher prüfte der Erfolgstest nur Statuscode und Anzahl; ein Import,
  // der neue QR-Codes vergibt, wäre unbemerkt durchgegangen und hätte jeden Verkäufer zum
  // Neudruck gezwungen. Geprüft wird deshalb, was tatsächlich in die Transaktion geht.
  it('übernimmt den QR-Code aus dem Archiv unverändert', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(5);
    prismaMock.sellerArticle.findMany.mockResolvedValue(archiveItems);
    prismaMock.article.createManyAndReturn.mockResolvedValue([{ id: 'art-1' }]);

    await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());

    expect(prismaMock.article.createManyAndReturn).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        qrCode: 'uuid-1',           // exakt der Code aus dem Archiveintrag
        sellerArticleId: 'sa-1',    // Verknüpfung zurück ins Archiv
        title: 'Shirt',
        price: archiveItems[0].price,
      })],
    });
  });

  it('vergibt nur dann einen neuen QR-Code, wenn der Archiveintrag noch keinen hat', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(5);
    prismaMock.sellerArticle.findMany.mockResolvedValue([
      { ...archiveItems[0], qrCode: null }, // Altbestand von vor der QR-Wiederverwendung
    ]);
    prismaMock.article.createManyAndReturn.mockResolvedValue([{ id: 'art-1' }]);

    await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());

    const [[createArgs]] = prismaMock.article.createManyAndReturn.mock.calls;
    expect(createArgs.data[0].qrCode).toEqual(expect.any(String));
    expect(createArgs.data[0].qrCode).not.toBe('');
  });

  // Doppeltipp auf „Übernehmen" / zwei Tabs: ohne Sperre bestanden beide Requests die Prüfung
  // „schon im Basar?" und legten jeden Artikel doppelt an. Ein gemocktes $transaction führt
  // nichts aus – geprüft wird deshalb, dass gesperrt wird, bevor gezählt und gelesen wird, und
  // dass beides über die Transaktion läuft.
  it('sperrt die BasarSeller-Zeile, bevor gezählt, geprüft und geschrieben wird', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.sellerArticle.findMany.mockResolvedValue(archiveItems);
    prismaMock.article.createManyAndReturn.mockResolvedValue([{ id: 'art-1' }]);

    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());

    expect(res.status).toBe(201);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const [strings, ...values] = prismaMock.$queryRaw.mock.calls[0];
    expect(strings.join('?')).toMatch(/SELECT 1 FROM "BasarSeller" WHERE id = \? FOR UPDATE/);
    expect(values).toEqual(['bs-1']);

    const order = (m: { mock: { invocationCallOrder: number[] } }) => m.mock.invocationCallOrder[0];
    expect(order(prismaMock.$transaction)).toBeLessThan(order(prismaMock.$queryRaw));
    expect(order(prismaMock.$queryRaw)).toBeLessThan(order(prismaMock.article.count));
    expect(order(prismaMock.$queryRaw)).toBeLessThan(order(prismaMock.sellerArticle.findMany));
    expect(order(prismaMock.sellerArticle.findMany)).toBeLessThan(order(prismaMock.article.createManyAndReturn));
  });

  it('über dem Artikellimit: 400, gesperrt und gezählt, aber nichts geschrieben', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue({ ...openBasar, maxArticlesPerSeller: 3 });
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(3);
    prismaMock.sellerArticle.findMany.mockResolvedValue(archiveItems);

    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Zu viele Artikel/);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.article.createManyAndReturn).not.toHaveBeenCalled();
  });

  it('creates a new basarSeller via upsert (not create) and leaves it INACTIVE', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue({ ...fakeBasarSeller, isActive: false });
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.sellerArticle.findMany.mockResolvedValue(archiveItems);
    prismaMock.article.createManyAndReturn.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);

    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());

    expect(res.status).toBe(201);
    expect(prismaMock.basarSeller.create).not.toHaveBeenCalled();
    // isActive: false – die Übernahme aus dem Archiv darf keine Teilnahme erzeugen.
    expect(prismaMock.basarSeller.upsert).toHaveBeenCalledWith({
      where: { basarId_sellerId: { basarId: 'basar-1', sellerId: 1234 } },
      update: {},
      create: { basarId: 'basar-1', sellerId: 1234, isActive: false, activatedAt: null },
    });
  });

  it('upsert keeps working across repeated calls (double-click / two tabs)', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.sellerArticle.findMany.mockResolvedValue(archiveItems);
    prismaMock.article.createManyAndReturn.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);

    const res1 = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());
    const res2 = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(prismaMock.basarSeller.upsert).toHaveBeenCalledTimes(2);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockRejectedValue(new Error('DB'));
    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());
    expect(res.status).toBe(500);
  });
});
