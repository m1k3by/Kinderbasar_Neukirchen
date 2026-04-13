import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  basar: { findUnique: vi.fn() },
  article: { findUnique: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { DELETE } from '@/app/api/basars/[id]/articles/[artId]/route';

function makeContext(id = 'basar-1', artId = 'art-1') {
  return { params: Promise.resolve({ id, artId }) };
}
function makeRequest() {
  return new Request('http://localhost/api/basars/basar-1/articles/art-1', { method: 'DELETE' });
}

const openBasar = { id: 'basar-1', status: 'OPEN' };
const fakeArticle = { id: 'art-1', basarSeller: { sellerId: 1234 } };

describe('DELETE /api/basars/[id]/articles/[artId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 404 when basar not found', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(null);
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 400 when basar is ACTIVE', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'basar-1', status: 'ACTIVE' });
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(400);
  });

  it('returns 400 when basar is CLOSED', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'basar-1', status: 'CLOSED' });
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(400);
  });

  it('returns 404 when article not found', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.article.findUnique.mockResolvedValue(null);
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 403 when seller does not own article', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9999) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.article.findUnique.mockResolvedValue(fakeArticle); // owned by 1234
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(403);
  });

  it('deletes article successfully for owner', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.article.findUnique.mockResolvedValue(fakeArticle);
    prismaMock.article.delete.mockResolvedValue({ id: 'art-1' });
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('admin can delete any article', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.article.findUnique.mockResolvedValue(fakeArticle);
    prismaMock.article.delete.mockResolvedValue({ id: 'art-1' });
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockRejectedValue(new Error('DB'));
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});
