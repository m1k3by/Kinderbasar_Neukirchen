import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken, cashierToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  basar: { findUnique: vi.fn() },
  article: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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
const availableArticle = { id: 'art-1', status: 'AVAILABLE', price: 3.0, qrCode: 'QR1' };

describe('POST /api/basars/[id]/sales', () => {
  beforeEach(() => vi.clearAllMocks());

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

  it('sells article by articleId → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    prismaMock.article.findUnique.mockResolvedValue(availableArticle);
    prismaMock.$transaction.mockResolvedValue([
      { ...availableArticle, status: 'SOLD' },
      { id: 'sale-1' },
    ]);
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1' }] }), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].success).toBe(true);
  });

  it('skips SOLD article with error in results', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(5555) });
    prismaMock.basar.findUnique.mockResolvedValue(activeBasar);
    prismaMock.article.findUnique.mockResolvedValue({ ...availableArticle, status: 'SOLD' });
    const res = await POST(makePostRequest({ items: [{ articleId: 'art-1' }] }), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].error).toMatch(/verkauft/i);
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
    prismaMock.$transaction.mockResolvedValue([
      { ...availableArticle, status: 'SOLD' },
      { id: 'sale-2' },
    ]);
    const res = await POST(makePostRequest({ items: [{ qrCode: 'QR1' }] }), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].success).toBe(true);
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
    prismaMock.sale.findMany.mockResolvedValue([{ id: 'sale-1', salePrice: 3.0 }]);
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
