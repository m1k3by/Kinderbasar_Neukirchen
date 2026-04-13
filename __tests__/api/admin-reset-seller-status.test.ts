import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  seller: {
    updateMany: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { POST } from '@/app/api/admin/reset-seller-status/route';

function makeRequest(token?: string) {
  return {
    cookies: { get: (name: string) => name === 'token' && token ? { value: token } : undefined },
  } as any;
}

describe('POST /api/admin/reset-seller-status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid token', async () => {
    const res = await POST(makeRequest('garbage'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin token', async () => {
    const res = await POST(makeRequest(sellerToken(1234)));
    expect(res.status).toBe(403);
  });

  it('resets all seller statuses to false on admin request → 200', async () => {
    prismaMock.seller.updateMany.mockResolvedValue({ count: 50 });
    const res = await POST(makeRequest(adminToken()));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(prismaMock.seller.updateMany).toHaveBeenCalledWith({
      data: { sellerStatusActive: false },
    });
  });

  it('returns 500 on DB error', async () => {
    prismaMock.seller.updateMany.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeRequest(adminToken()));
    expect(res.status).toBe(500);
  });
});
