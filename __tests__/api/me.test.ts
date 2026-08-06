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
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/me/route';

describe('GET /api/me', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns { role: "admin" } → 200 for an admin token (no sellerId, no DB lookup)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ role: 'admin' });
    expect(prismaMock.seller.findUnique).not.toHaveBeenCalled();
  });

  it('returns only the caller\'s own record → 200 (seller), with no qrCode/barcode/nested data', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.seller.findUnique.mockResolvedValue({
      sellerId: 1234,
      firstName: 'Max',
      lastName: 'Muster',
      email: 'm@b.de',

      isEmployee: false,
      isCashier: false,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      sellerId: 1234,
      firstName: 'Max',
      lastName: 'Muster',
      email: 'm@b.de',

      isEmployee: false,
      isCashier: false,
    });
    expect(prismaMock.seller.findUnique).toHaveBeenCalledWith({
      where: { sellerId: 1234 },
      select: {
        sellerId: true,
        firstName: true,
        lastName: true,
        email: true,

        isEmployee: true,
        isCashier: true,
      },
    });
  });

  it('does not select qrCode or barcode', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, firstName: 'Max', lastName: 'Muster', email: 'm@b.de', isEmployee: false, isCashier: false });
    await GET();
    const select = prismaMock.seller.findUnique.mock.calls[0][0].select;
    expect(select.qrCode).toBeUndefined();
    expect(select.barcode).toBeUndefined();
    expect(select.taskSignups).toBeUndefined();
    expect(select.cakes).toBeUndefined();
  });

  it('cashier flag is included for a cashier token', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(5555, { isCashier: true }) });
    prismaMock.seller.findUnique.mockResolvedValue({
      sellerId: 5555, firstName: 'Kas', lastName: 'Sierer', email: 'k@b.de',
 isEmployee: true, isCashier: true,
    });
    const res = await GET();
    const json = await res.json();
    expect(json.isCashier).toBe(true);
  });

  it('returns 404 when the token\'s sellerId no longer has a Seller row', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9999) });
    prismaMock.seller.findUnique.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.seller.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
