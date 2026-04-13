import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  basarSeller: { findUnique: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/basars/[id]/settlements/[sellerIdParam]/route';

function makeContext(id = 'basar-1', sellerIdParam = '1234') {
  return { params: Promise.resolve({ id, sellerIdParam }) };
}
function makeRequest() {
  return new Request('http://localhost/api/basars/basar-1/settlements/1234');
}

const fakeBasarSeller = { id: 'bs-1', sellerId: 1234, settlement: null, seller: { firstName: 'Max', lastName: 'Muster', sellerId: 1234, email: 'test@test.com' }, articles: [] };

describe('GET /api/basars/[id]/settlements/[sellerIdParam]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 403 when seller requests different seller settlement', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9999) });
    const res = await GET(makeRequest(), makeContext('basar-1', '1234'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when basarSeller not found', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basarSeller.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns basarSeller for admin', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basarSeller.findUnique.mockResolvedValue(fakeBasarSeller);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).basarSeller.sellerId).toBe(1234);
  });

  it('returns own settlement for seller', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basarSeller.findUnique.mockResolvedValue(fakeBasarSeller);
    const res = await GET(makeRequest(), makeContext('basar-1', '1234'));
    expect(res.status).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basarSeller.findUnique.mockRejectedValue(new Error('DB'));
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});
