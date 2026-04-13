import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  seller: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

// ─── bcrypt mock ──────────────────────────────────────────────────────────────
const bcryptHashMock = vi.hoisted(() => vi.fn().mockResolvedValue('hashed-new-password'));
vi.mock('bcrypt', () => ({ default: { hash: bcryptHashMock } }));

import { POST } from '@/app/api/password-reset/confirm/route';

function makeRequest(body: object) {
  return new Request('http://localhost/api/password-reset/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/password-reset/confirm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when token is missing', async () => {
    const res = await POST(makeRequest({ newPassword: 'newpass123' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when newPassword is missing', async () => {
    const res = await POST(makeRequest({ token: 'abc123' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too short (< 6 chars)', async () => {
    const res = await POST(makeRequest({ token: 'abc', newPassword: 'abc' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/6/);
  });

  it('returns 400 for unknown token', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ token: 'invalid-token', newPassword: 'validpass' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/ungültig|abgelaufen/i);
  });

  it('returns 400 for expired token', async () => {
    prismaMock.seller.findUnique.mockResolvedValue({
      sellerId: 1001,
      resetToken: 'expired-token',
      resetTokenExpiry: new Date(Date.now() - 1000), // already expired
    });
    const res = await POST(makeRequest({ token: 'expired-token', newPassword: 'validpass' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/abgelaufen/i);
  });

  it('resets password and clears token on valid request → 200', async () => {
    prismaMock.seller.findUnique.mockResolvedValue({
      sellerId: 1001,
      resetToken: 'valid-token',
      resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000), // valid for 1h
    });
    prismaMock.seller.update.mockResolvedValue({ sellerId: 1001 });

    const res = await POST(makeRequest({ token: 'valid-token', newPassword: 'validpass' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.message).toMatch(/zurückgesetzt/i);
    expect(prismaMock.seller.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          password: 'hashed-new-password',
          resetToken: null,
          resetTokenExpiry: null,
        }),
      })
    );
  });

  it('returns 500 on unexpected DB error', async () => {
    prismaMock.seller.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeRequest({ token: 'any', newPassword: 'validpass' }));
    expect(res.status).toBe(500);
  });
});
