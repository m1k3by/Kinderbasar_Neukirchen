import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

// ─── next/headers mock ────────────────────────────────────────────────────────
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  settings: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET, PUT } from '@/app/api/settings/route';

function makeGetRequest() {
  return new Request('http://localhost/api/settings', { method: 'GET' });
}

function makePutRequest(body: object) {
  return new Request('http://localhost/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/settings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns key-value settings object → 200', async () => {
    prismaMock.settings.findMany.mockResolvedValue([
      { key: 'registration_seller_start', value: '2025-01-01T08:00' },
      { key: 'registration_seller_end',   value: '2025-12-31T20:00' },
    ]);
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({
      registration_seller_start: '2025-01-01T08:00',
      registration_seller_end:   '2025-12-31T20:00',
    });
  });

  it('returns empty object when no settings exist', async () => {
    prismaMock.settings.findMany.mockResolvedValue([]);
    const res = await GET();
    expect(await res.json()).toEqual({});
  });

  it('returns 500 on DB error', async () => {
    prismaMock.settings.findMany.mockRejectedValue(new Error('DB error'));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe('PUT /api/settings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await PUT(makePutRequest({ anyKey: 'anyValue' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await PUT(makePutRequest({ anyKey: 'anyValue' }));
    expect(res.status).toBe(403);
  });

  it('upserts each setting and returns success → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.settings.upsert.mockResolvedValue({});
    const body = { registration_seller_start: '2025-03-01T08:00', max_sellers: '150' };
    const res = await PUT(makePutRequest(body));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(prismaMock.settings.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.settings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'registration_seller_start' },
        update: { value: '2025-03-01T08:00' },
        create: { key: 'registration_seller_start', value: '2025-03-01T08:00' },
      })
    );
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.settings.upsert.mockRejectedValue(new Error('DB error'));
    const res = await PUT(makePutRequest({ anyKey: 'anyValue' }));
    expect(res.status).toBe(500);
  });
});
