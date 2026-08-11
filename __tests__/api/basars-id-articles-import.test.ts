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
  article: { count: vi.fn(), create: vi.fn() },
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
  beforeEach(() => vi.clearAllMocks());

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
    prismaMock.$transaction.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);

    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());

    expect(res.status).toBe(201);
    expect(prismaMock.article.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ basarSellerId: 'bs-1' }) })
    );
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
    prismaMock.$transaction.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);

    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());

    expect(res.status).toBe(201);
  });

  it('imports articles successfully → 201', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(5);
    prismaMock.sellerArticle.findMany.mockResolvedValue(archiveItems);
    prismaMock.$transaction.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);
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
    prismaMock.$transaction.mockResolvedValue([{ id: 'art-1' }]);

    await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());

    expect(prismaMock.article.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        qrCode: 'uuid-1',           // exakt der Code aus dem Archiveintrag
        sellerArticleId: 'sa-1',    // Verknüpfung zurück ins Archiv
        title: 'Shirt',
        price: archiveItems[0].price,
      }),
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
    prismaMock.$transaction.mockResolvedValue([{ id: 'art-1' }]);

    await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());

    const [[createArgs]] = prismaMock.article.create.mock.calls;
    expect(createArgs.data.qrCode).toEqual(expect.any(String));
    expect(createArgs.data.qrCode).not.toBe('');
  });

  it('creates a new basarSeller via upsert (not create) and leaves it INACTIVE', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue({ ...fakeBasarSeller, isActive: false });
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.sellerArticle.findMany.mockResolvedValue(archiveItems);
    prismaMock.$transaction.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);

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
    prismaMock.$transaction.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);

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
