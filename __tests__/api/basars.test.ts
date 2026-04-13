import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

// ─── next/headers mock ────────────────────────────────────────────────────────
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  basar: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET, POST } from '@/app/api/basars/route';

function makeRequest(method: string, body?: object, url = 'http://localhost/api/basars') {
  return new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

const fakeBasar = { id: 'basar-1', title: 'Basar 2025', eventDate: new Date().toISOString(), description: null, location: null, maxSellers: 100, maxArticlesPerSeller: 50, commissionPercent: 20, entryFee: 0, _count: { basarSellers: 5 } };

describe('GET /api/basars', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(401);
  });

  it('returns basars list with pagination for valid token → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findMany.mockResolvedValue([fakeBasar]);
    prismaMock.basar.count.mockResolvedValue(1);

    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.basars).toHaveLength(1);
    expect(json.total).toBe(1);
    expect(json.page).toBe(1);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findMany.mockRejectedValue(new Error('DB error'));
    prismaMock.basar.count.mockRejectedValue(new Error('DB error'));
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/basars', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST(makeRequest('POST', { title: 'Test', eventDate: '2025-06-01' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(makeRequest('POST', { title: 'Test', eventDate: '2025-06-01' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when title or eventDate missing', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makeRequest('POST', { description: 'no title' }));
    expect(res.status).toBe(400);
  });

  it('creates basar and returns 201 for admin', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.create.mockResolvedValue({ ...fakeBasar, id: 'basar-new' });
    const res = await POST(makeRequest('POST', { title: 'New Basar', eventDate: '2025-06-01' }));
    expect(res.status).toBe(201);
    expect((await res.json()).title).toBe('Basar 2025'); // mock returns fakeBasar
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.create.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeRequest('POST', { title: 'Fail Basar', eventDate: '2025-06-01' }));
    expect(res.status).toBe(500);
  });
});
