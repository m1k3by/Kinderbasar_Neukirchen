import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  seller: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

// ─── Mail mock ────────────────────────────────────────────────────────────────
const sendMailMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/app/lib/mail', () => ({ sendMail: sendMailMock }));

// ─── bcrypt mock ──────────────────────────────────────────────────────────────
const bcryptHashMock = vi.hoisted(() => vi.fn().mockResolvedValue('hashed-temp'));
vi.mock('bcrypt', () => ({ default: { hash: bcryptHashMock } }));

import { POST } from '@/app/api/admin/reset-password/route';

function makeRequest(body: object, token?: string) {
  return {
    cookies: { get: (name: string) => name === 'token' && token ? { value: token } : undefined },
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as any;
}

describe('POST /api/admin/reset-password', () => {
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

  it('resets password and sends email → 200', async () => {
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, firstName: 'Max', lastName: 'Muster', email: 'max@test.de' });
    prismaMock.seller.update.mockResolvedValue({});

    const res = await POST(makeRequest({ sellerId: '1234' }, adminToken()));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(prismaMock.seller.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ password: 'hashed-temp' }) })
    );
    expect(sendMailMock).toHaveBeenCalledWith('max@test.de', expect.any(String), expect.any(String));
  });

  it('returns 500 on DB error', async () => {
    prismaMock.seller.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeRequest({ sellerId: '1234' }, adminToken()));
    expect(res.status).toBe(500);
  });
});
