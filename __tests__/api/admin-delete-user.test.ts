import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  seller: {
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { POST } from '@/app/api/admin/delete-user/route';

function makeRequest(body: object, token?: string) {
  return {
    cookies: { get: (name: string) => name === 'token' && token ? { value: token } : undefined },
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as any;
}

describe('POST /api/admin/delete-user', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    const res = await POST(makeRequest({ sellerId: '1234' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid token', async () => {
    const res = await POST(makeRequest({ sellerId: '1234' }, 'garbage'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    const res = await POST(makeRequest({ sellerId: '1234' }, sellerToken(1234)));
    expect(res.status).toBe(403);
  });

  it('returns 400 when sellerId missing', async () => {
    const res = await POST(makeRequest({}, adminToken()));
    expect(res.status).toBe(400);
  });

  it('returns 404 when seller not found', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ sellerId: '9999' }, adminToken()));
    expect(res.status).toBe(404);
  });

  it('deletes seller and returns success message → 200', async () => {
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, firstName: 'Max', lastName: 'Muster' });
    prismaMock.seller.delete.mockResolvedValue({});
    const res = await POST(makeRequest({ sellerId: '1234' }, adminToken()));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toContain('Max');
  });

  it('returns 500 on DB error', async () => {
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, firstName: 'A', lastName: 'B' });
    prismaMock.seller.delete.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeRequest({ sellerId: '1234' }, adminToken()));
    expect(res.status).toBe(500);
  });
});
