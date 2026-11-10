import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dec } from '../helpers/decimal';
import { sellerToken, adminToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  sellerArticle: { findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), create: vi.fn(), update: vi.fn() },
  article: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET, POST, PATCH, DELETE } from '@/app/api/seller-articles/route';

function makeJsonRequest(method: string, body: object) {
  return new Request('http://localhost/api/seller-articles', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/seller-articles (Anlegen ohne Basar)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 für Admin (keine sellerId)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makeJsonRequest('POST', { title: 'Shirt', price: 2 }));
    expect(res.status).toBe(401);
    expect(prismaMock.sellerArticle.create).not.toHaveBeenCalled();
  });

  it('400 ohne Preis, nichts geschrieben', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(makeJsonRequest('POST', { title: 'Shirt' }));
    expect(res.status).toBe(400);
    expect(prismaMock.sellerArticle.create).not.toHaveBeenCalled();
  });

  it('legt den Eintrag für den eigenen Verkäufer an (sellerId aus dem Body ignoriert), mit QR-Code und Tags', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.sellerArticle.create.mockResolvedValue({ id: 'sa-9', price: dec(2.5), tags: ['Sommer'] });
    const res = await POST(makeJsonRequest('POST', { title: 'Shirt', price: 2.5, gender: 'Junge', tags: ['sommer'], sellerId: 1 }));
    expect(res.status).toBe(201);
    const data = prismaMock.sellerArticle.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ sellerId: 1234, title: 'Shirt', price: 2.5, gender: 'Junge', tags: ['Sommer'] });
    expect(typeof data.qrCode).toBe('string');
    expect((await res.json()).sellerArticle.price).toBe(2.5);
  });
});

describe('PATCH /api/seller-articles (Bearbeiten)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it('404 für fremden Eintrag, nichts geschrieben', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.sellerArticle.findUnique.mockResolvedValue({ id: 'sa-1', sellerId: 9999 });
    const res = await PATCH(makeJsonRequest('PATCH', { id: 'sa-1', title: 'X', price: 1 }));
    expect(res.status).toBe(404);
    expect(prismaMock.sellerArticle.update).not.toHaveBeenCalled();
    expect(prismaMock.article.updateMany).not.toHaveBeenCalled();
  });

  it('ändert den Eintrag und zieht nur verfügbare Artikel in nicht laufenden Basaren mit', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.sellerArticle.findUnique.mockResolvedValue({ id: 'sa-1', sellerId: 1234, price: dec(3) });
    prismaMock.sellerArticle.update.mockResolvedValue({ id: 'sa-1', price: dec(3), tags: ['Winter'] });
    prismaMock.article.updateMany.mockResolvedValue({ count: 1 });
    const res = await PATCH(makeJsonRequest('PATCH', { id: 'sa-1', title: 'Jacke', sizeLabel: '110', price: 3, tags: ['Winter'] }));
    expect(res.status).toBe(200);
    expect((await res.json()).updatedBasarArticles).toBe(1);

    expect(prismaMock.sellerArticle.update.mock.calls[0][0]).toEqual({
      where: { id: 'sa-1' },
      // Kein price: der Preis ist nach dem Anlegen gesperrt.
      data: { title: 'Jacke', sizeLabel: '110', gender: null, tags: ['Winter'] },
    });
    expect(prismaMock.article.updateMany.mock.calls[0][0]).toEqual({
      where: {
        sellerArticleId: 'sa-1',
        status: 'AVAILABLE',
        basarSeller: { basar: { status: { in: ['DRAFT', 'OPEN'] } } },
      },
      data: { title: 'Jacke', sizeLabel: '110', gender: null },
    });
  });

  it('lehnt eine Preisänderung ab und schreibt nichts (Preis gesperrt wie bei Basarlino)', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.sellerArticle.findUnique.mockResolvedValue({ id: 'sa-1', sellerId: 1234, price: dec(3) });
    const res = await PATCH(makeJsonRequest('PATCH', { id: 'sa-1', title: 'Jacke', price: 1 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Preis/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.sellerArticle.update).not.toHaveBeenCalled();
    expect(prismaMock.article.updateMany).not.toHaveBeenCalled();
  });

  it('ohne mitgeschickten Preis: bleibt beim alten, Bearbeiten klappt', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.sellerArticle.findUnique.mockResolvedValue({ id: 'sa-1', sellerId: 1234, price: dec(2.5) });
    prismaMock.sellerArticle.update.mockResolvedValue({ id: 'sa-1', price: dec(2.5), tags: [] });
    prismaMock.article.updateMany.mockResolvedValue({ count: 0 });
    const res = await PATCH(makeJsonRequest('PATCH', { id: 'sa-1', title: 'Neu' }));
    expect(res.status).toBe(200);
    expect(prismaMock.sellerArticle.update.mock.calls[0][0].data).not.toHaveProperty('price');
  });
});

function makeGetRequest(basarId?: string) {
  const url = basarId
    ? `http://localhost/api/seller-articles?basarId=${basarId}`
    : 'http://localhost/api/seller-articles';
  return new Request(url);
}
function makeDeleteRequest(id: string) {
  return new Request('http://localhost/api/seller-articles', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
}

const fakeItems = [
  { id: 'sa-1', title: 'Shirt', sizeLabel: '80', price: dec(2.5), createdAt: new Date(), articles: [] },
];

describe('GET /api/seller-articles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 for admin (no sellerId)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('returns seller articles for valid seller token', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.sellerArticle.findMany.mockResolvedValue(fakeItems);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sellerArticles).toHaveLength(1);
    expect(data.sellerArticles[0].title).toBe('Shirt');
  });

  it('includes alreadyInBasar when basarId query param provided', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.sellerArticle.findMany.mockResolvedValue(fakeItems);
    const res = await GET(makeGetRequest('basar-1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sellerArticles[0].alreadyInBasar).toBe(false);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.sellerArticle.findMany.mockRejectedValue(new Error('DB'));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/seller-articles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await DELETE(makeDeleteRequest('sa-1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for admin (no sellerId)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await DELETE(makeDeleteRequest('sa-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when article not found or not owned', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.sellerArticle.findUnique.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest('sa-1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when article belongs to different seller', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.sellerArticle.findUnique.mockResolvedValue({ id: 'sa-1', sellerId: 9999 });
    const res = await DELETE(makeDeleteRequest('sa-1'));
    expect(res.status).toBe(404);
  });

  it('deletes article successfully', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.sellerArticle.findUnique.mockResolvedValue({ id: 'sa-1', sellerId: 1234 });
    prismaMock.article.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.sellerArticle.delete.mockResolvedValue({ id: 'sa-1' });
    const res = await DELETE(makeDeleteRequest('sa-1'));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.sellerArticle.findUnique.mockRejectedValue(new Error('DB'));
    const res = await DELETE(makeDeleteRequest('sa-1'));
    expect(res.status).toBe(500);
  });
});
