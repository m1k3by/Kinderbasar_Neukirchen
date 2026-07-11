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

function makeRequest(body: object) {
  return {
    json: () => Promise.resolve(body),
  } as any;
}

describe('POST /api/admin/reset-password', () => {
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

  it('resets password and sends email → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, firstName: 'Max', lastName: 'Muster', email: 'max@test.de' });
    prismaMock.seller.update.mockResolvedValue({});

    const res = await POST(makeRequest({ sellerId: '1234' }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(prismaMock.seller.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ password: 'hashed-temp' }) })
    );
    expect(sendMailMock).toHaveBeenCalledWith('max@test.de', expect.any(String), expect.any(String));
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeRequest({ sellerId: '1234' }));
    expect(res.status).toBe(500);
  });
});
