import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  { id: 'sa-1', title: 'Shirt', sizeLabel: '80', gender: null, price: 2.5, qrCode: 'uuid-1', articles: [] },
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

  it('returns 403 when seller has deactivated their participation in this basar', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.findUnique.mockResolvedValue({ ...fakeBasarSeller, isActive: false });
    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/nicht als Teilnehmer aktiv/i);
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
    prismaMock.basarSeller.findUnique.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(0);
    const res = await POST(makePostRequest({ sellerArticleIds: [] }), makeContext());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/keine Artikel/i);
  });

  it('returns 400 when all articles already in basar', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.findUnique.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.sellerArticle.findMany.mockResolvedValue([
      { ...archiveItems[0], articles: [{ id: 'art-1' }] }, // already in basar
    ]);
    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/bereits/i);
  });

  it('returns 400 when max sellers reached for new basarSeller', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.findUnique.mockResolvedValue(null);
    prismaMock.basarSeller.count.mockResolvedValue(100);
    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());
    expect(res.status).toBe(400);
  });

  it('imports articles successfully → 201', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.findUnique.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(5);
    prismaMock.sellerArticle.findMany.mockResolvedValue(archiveItems);
    prismaMock.$transaction.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);
    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.articles).toHaveLength(1);
  });

  it('creates a new basarSeller via upsert (not create) when the seller has no row yet', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.findUnique.mockResolvedValue(null); // no row yet
    prismaMock.basarSeller.count.mockResolvedValue(0); // well under maxSellers
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.sellerArticle.findMany.mockResolvedValue(archiveItems);
    prismaMock.$transaction.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);

    const res = await POST(makePostRequest({ sellerArticleIds: ['sa-1'] }), makeContext());

    expect(res.status).toBe(201);
    expect(prismaMock.basarSeller.create).not.toHaveBeenCalled();
    expect(prismaMock.basarSeller.upsert).toHaveBeenCalledWith({
      where: { basarId_sellerId: { basarId: 'basar-1', sellerId: 1234 } },
      update: {},
      create: { basarId: 'basar-1', sellerId: 1234, isActive: true, activatedAt: expect.any(Date) },
    });
  });

  it('upsert keeps working across repeated calls that both see no existing basarSeller (double-click / two tabs)', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.findUnique.mockResolvedValue(null);
    prismaMock.basarSeller.count.mockResolvedValue(0);
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
