import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  article: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  basarSeller: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
  seller: { findUnique: vi.fn() },
  basar: { findUnique: vi.fn() },
  sellerArticle: { create: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET, POST } from '@/app/api/basars/[id]/articles/route';

function makeContext(id = 'basar-1') {
  return { params: Promise.resolve({ id }) };
}
function makeGetRequest() {
  return new Request('http://localhost/api/basars/basar-1/articles');
}
function makePostRequest(body: object) {
  return new Request('http://localhost/api/basars/basar-1/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const openBasar = { id: 'basar-1', status: 'OPEN', maxSellers: 100, maxArticlesPerSeller: 50 };
const activeSeller = { sellerId: 1234, sellerStatusActive: true };
const fakeBasarSeller = { id: 'bs-1', basarId: 'basar-1', sellerId: 1234, maxArticlesOverride: null };

describe('GET /api/basars/[id]/articles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('admin: returns all articles', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.article.findMany.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.articles).toHaveLength(1);
  });

  it('seller: 401 when no sellerId in token', async () => {
    // Admin token has no sellerId - but we want role != admin
    // Use a custom token with no sellerId
    const jwt = await import('jsonwebtoken');
    const token = jwt.default.sign({ role: 'seller' }, process.env.JWT_SECRET!, { expiresIn: '1d' });
    cookiesGetMock.mockReturnValue({ value: token });
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('seller: returns empty when not in basar', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basarSeller.findUnique.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.articles).toEqual([]);
    expect(data.basarSeller).toBeNull();
  });

  it('seller: returns own articles', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basarSeller.findUnique.mockResolvedValue({ ...fakeBasarSeller, settlement: null });
    prismaMock.article.findMany.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.articles).toHaveLength(1);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.article.findMany.mockRejectedValue(new Error('DB'));
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});

describe('POST /api/basars/[id]/articles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 403 for admin', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns 403 when seller not active', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, sellerStatusActive: false });
    const res = await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns 404 when basar not found', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.seller.findUnique.mockResolvedValue(activeSeller);
    prismaMock.basar.findUnique.mockResolvedValue(null);
    const res = await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 400 when basar not OPEN', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.seller.findUnique.mockResolvedValue(activeSeller);
    prismaMock.basar.findUnique.mockResolvedValue({ ...openBasar, status: 'DRAFT' });
    const res = await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());
    expect(res.status).toBe(400);
  });

  it('returns 400 when max sellers reached (new basarSeller)', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.seller.findUnique.mockResolvedValue(activeSeller);
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.findUnique.mockResolvedValue(null);
    prismaMock.basarSeller.count.mockResolvedValue(100); // equals maxSellers
    const res = await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Verkäufer/i);
  });

  it('returns 400 when article limit reached', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.seller.findUnique.mockResolvedValue(activeSeller);
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.findUnique.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(50); // equals maxArticlesPerSeller
    const res = await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Artikelanzahl/i);
  });

  it('returns 400 when title missing', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.seller.findUnique.mockResolvedValue(activeSeller);
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.findUnique.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(0);
    const res = await POST(makePostRequest({ price: 2 }), makeContext());
    expect(res.status).toBe(400);
  });

  it('returns 400 when price is 0 or negative', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.seller.findUnique.mockResolvedValue(activeSeller);
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.findUnique.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(0);
    const res = await POST(makePostRequest({ title: 'Shirt', price: 0 }), makeContext());
    expect(res.status).toBe(400);
  });

  it('creates article successfully → 201', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.seller.findUnique.mockResolvedValue(activeSeller);
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.findUnique.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(5);
    prismaMock.sellerArticle.create.mockResolvedValue({ id: 'sa-1', title: 'Shirt', qrCode: 'uuid-1' });
    prismaMock.article.create.mockResolvedValue({ id: 'art-1', title: 'Shirt', qrCode: 'uuid-1', status: 'AVAILABLE' });
    const res = await POST(makePostRequest({ title: 'Shirt', price: 3.5, sizeLabel: '80', gender: 'Mädchen' }), makeContext());
    expect(res.status).toBe(201);
    expect((await res.json()).article.title).toBe('Shirt');
  });
});
