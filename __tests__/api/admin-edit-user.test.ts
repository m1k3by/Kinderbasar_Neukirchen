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
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { PUT } from '@/app/api/admin/edit-user/route';

function makeRequest(body: object) {
  return {
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as any;
}

const validBody = { sellerId: '1234', email: 'max@test.de', firstName: 'Max', lastName: 'Muster', isEmployee: false };

describe('PUT /api/admin/edit-user', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await PUT(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid token', async () => {
    cookiesGetMock.mockReturnValue({ value: 'garbage' });
    const res = await PUT(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await PUT(makeRequest(validBody));
    expect(res.status).toBe(403);
  });

  it('returns 400 when sellerId missing', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await PUT(makeRequest({ email: 'a@b.de', firstName: 'X', lastName: 'Y' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when email/firstName/lastName missing', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await PUT(makeRequest({ sellerId: '1234', email: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await PUT(makeRequest({ ...validBody, email: 'not-an-email' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when seller not found', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue(null);
    const res = await PUT(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  it('returns 400 when email taken by another user', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234 });
    prismaMock.seller.findFirst.mockResolvedValue({ sellerId: 9999 }); // another user has this email
    const res = await PUT(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it('updates user and returns success → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234 });
    prismaMock.seller.findFirst.mockResolvedValue(null); // email not taken
    prismaMock.seller.update.mockResolvedValue({ sellerId: 1234, email: 'max@test.de', firstName: 'Max', lastName: 'Muster', isEmployee: false });

    const res = await PUT(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.seller.sellerId).toBe(1234);
  });

  it('returns 400 on Prisma P2002 (duplicate email)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234 });
    prismaMock.seller.findFirst.mockResolvedValue(null);
    prismaMock.seller.update.mockRejectedValue({ code: 'P2002', message: 'Unique constraint' });
    const res = await PUT(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it('returns 500 on unexpected DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await PUT(makeRequest(validBody));
    expect(res.status).toBe(500);
  });
});
