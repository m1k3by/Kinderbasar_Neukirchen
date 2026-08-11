import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dec } from '../helpers/decimal';
import { sellerToken, adminToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  sellerArticle: { findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  article: { updateMany: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET, DELETE } from '@/app/api/seller-articles/route';

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
