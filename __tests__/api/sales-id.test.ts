import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken, cashierToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const articleUpdateMock = vi.hoisted(() => vi.fn());
const saleUpdateMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  sale: {
    findUnique: vi.fn(),
    update: saleUpdateMock,
  },
  article: {
    update: articleUpdateMock,
  },
  $transaction: vi.fn(),
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { DELETE } from '@/app/api/sales/[id]/route';

function makeContext(id = 'sale-1') {
  return { params: Promise.resolve({ id }) };
}
function makeRequest() {
  return new Request('http://localhost/api/sales/sale-1', { method: 'DELETE' });
}

describe('DELETE /api/sales/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 403 for regular seller', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns 404 when sale not found', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findUnique.mockResolvedValue(null);
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 400 when already cancelled', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findUnique.mockResolvedValue({ id: 'sale-1', isCancelled: true, soldAt: new Date(), articleId: 'art-1' });
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/storniert/i);
  });

  it('returns 400 when outside 10 min window', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const oldDate = new Date(Date.now() - 11 * 60 * 1000);
    prismaMock.sale.findUnique.mockResolvedValue({ id: 'sale-1', isCancelled: false, soldAt: oldDate, articleId: 'art-1' });
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/10 Minuten/i);
  });

  it('stornos sale successfully for admin', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const recentDate = new Date(Date.now() - 60 * 1000);
    prismaMock.sale.findUnique.mockResolvedValue({ id: 'sale-1', isCancelled: false, soldAt: recentDate, articleId: 'art-1' });
    prismaMock.$transaction.mockResolvedValue([{}, {}]);
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('stornos sale successfully for cashier', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(5555) });
    const recentDate = new Date(Date.now() - 30 * 1000);
    prismaMock.sale.findUnique.mockResolvedValue({ id: 'sale-1', isCancelled: false, soldAt: recentDate, articleId: 'art-1' });
    prismaMock.$transaction.mockResolvedValue([{}, {}]);
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});
