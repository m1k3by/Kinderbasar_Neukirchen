import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

// ─── next/headers mock ────────────────────────────────────────────────────────
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  basar: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET, PUT } from '@/app/api/basars/[id]/route';

function makeContext(id = 'basar-1') {
  return { params: Promise.resolve({ id }) };
}
function makeGetRequest() {
  return new Request('http://localhost/api/basars/basar-1');
}
function makePutRequest(body: object) {
  return new Request('http://localhost/api/basars/basar-1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const fakeBasar = { id: 'basar-1', title: 'Basar 2025', status: 'DRAFT', eventDate: new Date(), description: null, location: null, maxSellers: 100, maxArticlesPerSeller: 50, commissionPercent: 20, entryFee: 0, _count: { basarSellers: 2, sales: 0 }, basarSellers: [] };

describe('GET /api/basars/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 404 when basar not found', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns basar for valid token → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(fakeBasar);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe('Basar 2025');
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});

describe('PUT /api/basars/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await PUT(makePutRequest({ title: 'New' }), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await PUT(makePutRequest({ title: 'New' }), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns 404 when basar not found', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(null);
    const res = await PUT(makePutRequest({ title: 'New' }), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 400 when basar is CLOSED', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ ...fakeBasar, status: 'CLOSED' });
    const res = await PUT(makePutRequest({ title: 'New' }), makeContext());
    expect(res.status).toBe(400);
  });

  it('updates basar and returns it → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(fakeBasar);
    prismaMock.basar.update.mockResolvedValue({ ...fakeBasar, title: 'Updated' });
    const res = await PUT(makePutRequest({ title: 'Updated' }), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe('Updated');
  });
});
