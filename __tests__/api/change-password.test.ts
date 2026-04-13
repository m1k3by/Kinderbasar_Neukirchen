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
const bcryptHashMock = vi.hoisted(() => vi.fn().mockResolvedValue('new-hashed-password'));
vi.mock('bcrypt', () => ({ default: { hash: bcryptHashMock } }));

import { POST } from '@/app/api/change-password/route';

function makeRequest(body: object) {
  return new Request('http://localhost/api/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/change-password', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when sellerId is missing', async () => {
    const res = await POST(makeRequest({ newPassword: 'newpass123' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/erforderlich/i);
  });

  it('returns 400 when newPassword is missing', async () => {
    const res = await POST(makeRequest({ sellerId: '1234' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too short (< 6 chars)', async () => {
    const res = await POST(makeRequest({ sellerId: '1234', newPassword: 'abc' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/6/);
  });

  it('returns 404 when seller not found', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ sellerId: '9999', newPassword: 'validpass' }));
    expect(res.status).toBe(404);
  });

  it('hashes and saves new password on success → 200', async () => {
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, email: 'a@b.de' });
    prismaMock.seller.update.mockResolvedValue({ sellerId: 1234 });

    const res = await POST(makeRequest({ sellerId: '1234', newPassword: 'mynewpass' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(bcryptHashMock).toHaveBeenCalledWith('mynewpass', 10);
    expect(prismaMock.seller.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { password: 'new-hashed-password' } })
    );
  });

  it('returns 500 on unexpected error', async () => {
    prismaMock.seller.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeRequest({ sellerId: '1234', newPassword: 'validpass' }));
    expect(res.status).toBe(500);
  });
});
