import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sellerToken, adminToken } from '../helpers/tokens';

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
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
  });

  it('401 ohne Anmeldung – nichts gelesen, nichts geschrieben', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST(makeRequest({ sellerId: '1234', newPassword: 'newpass123' }));
    expect(res.status).toBe(401);
    expect(prismaMock.seller.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.seller.update).not.toHaveBeenCalled();
  });

  it('403 für Admin (keine sellerId) – auch mit sellerId im Body nichts geschrieben', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makeRequest({ sellerId: '1234', newPassword: 'newpass123' }));
    expect(res.status).toBe(403);
    expect(prismaMock.seller.update).not.toHaveBeenCalled();
  });

  it('ändert das eigene Passwort, ein fremdes sellerId im Body wird ignoriert', async () => {
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, email: 'a@b.de' });
    prismaMock.seller.update.mockResolvedValue({ sellerId: 1234 });

    const res = await POST(makeRequest({ sellerId: '5678', newPassword: 'mynewpass' }));

    expect(res.status).toBe(200);
    expect(prismaMock.seller.findUnique.mock.calls[0][0]).toEqual({ where: { sellerId: 1234 } });
    expect(prismaMock.seller.update.mock.calls[0][0]).toEqual({
      where: { sellerId: 1234 },
      data: { password: 'new-hashed-password' },
    });
  });

  it('returns 400 when newPassword is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/erforderlich/i);
    expect(prismaMock.seller.update).not.toHaveBeenCalled();
  });

  it('returns 400 when password is too short (< 6 chars)', async () => {
    const res = await POST(makeRequest({ newPassword: 'abc' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/6/);
    expect(prismaMock.seller.update).not.toHaveBeenCalled();
  });

  it('returns 404 when seller not found', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ newPassword: 'validpass' }));
    expect(res.status).toBe(404);
    expect(prismaMock.seller.update).not.toHaveBeenCalled();
  });

  it('hashes and saves new password on success → 200', async () => {
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, email: 'a@b.de' });
    prismaMock.seller.update.mockResolvedValue({ sellerId: 1234 });

    const res = await POST(makeRequest({ newPassword: 'mynewpass' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(bcryptHashMock).toHaveBeenCalledWith('mynewpass', 10);
  });

  it('returns 500 on unexpected error', async () => {
    prismaMock.seller.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeRequest({ newPassword: 'validpass' }));
    expect(res.status).toBe(500);
  });
});
