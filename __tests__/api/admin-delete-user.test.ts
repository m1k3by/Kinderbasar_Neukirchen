import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

// ─── next/headers mock ────────────────────────────────────────────────────────
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  seller: {
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { POST } from '@/app/api/admin/delete-user/route';

function makeRequest(body: object) {
  return {
    json: () => Promise.resolve(body),
  } as any;
}

describe('POST /api/admin/delete-user', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST(makeRequest({ sellerId: '1234' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid token', async () => {
    cookiesGetMock.mockReturnValue({ value: 'garbage' });
    const res = await POST(makeRequest({ sellerId: '1234' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(makeRequest({ sellerId: '1234' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when sellerId missing', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when seller not found', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ sellerId: '9999' }));
    expect(res.status).toBe(404);
  });

  it('deletes seller and returns success message → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, firstName: 'Max', lastName: 'Muster' });
    prismaMock.seller.delete.mockResolvedValue({});
    const res = await POST(makeRequest({ sellerId: '1234' }));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toContain('Max');
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, firstName: 'A', lastName: 'B' });
    prismaMock.seller.delete.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeRequest({ sellerId: '1234' }));
    expect(res.status).toBe(500);
  });
});
