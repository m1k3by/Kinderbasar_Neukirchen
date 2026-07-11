import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

// ─── next/headers mock ────────────────────────────────────────────────────────
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  cake: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET, POST, PUT, DELETE } from '@/app/api/cakes/route';

function makeGetRequest() {
  return new Request('http://localhost/api/cakes', { method: 'GET' });
}

function makePostRequest(body: object) {
  return new Request('http://localhost/api/cakes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const fakeCake = {
  id: 1,
  cakeName: 'Schokoladenkuchen',
  sellerId: 1234,
  seller: { firstName: 'Max', lastName: 'Muster', email: 'm@b.de' },
};

describe('GET /api/cakes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('returns list of cakes → 200 (admin)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.cake.findMany.mockResolvedValue([fakeCake]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].cakeName).toBe('Schokoladenkuchen');
  });

  it('returns list of cakes → 200 (seller, no seller PII included)', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.cake.findMany.mockResolvedValue([{ id: 1, cakeName: 'Schokoladenkuchen', sellerId: 1234 }]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(prismaMock.cake.findMany).toHaveBeenCalledWith({ include: undefined });
  });

  it('returns empty array when no cakes', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.cake.findMany.mockResolvedValue([]);
    const res = await GET(makeGetRequest());
    expect(await res.json()).toEqual([]);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.cake.findMany.mockRejectedValue(new Error('DB error'));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });
});

describe('POST /api/cakes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST(makePostRequest({ cakeName: 'Torte', sellerId: 1234 }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when cakeName is missing', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makePostRequest({ sellerId: 1234 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when sellerId is missing', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makePostRequest({ cakeName: 'Torte' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric sellerId string', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makePostRequest({ cakeName: 'Torte', sellerId: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when seller tries to create a cake for someone else', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(makePostRequest({ cakeName: 'Torte', sellerId: 9999 }));
    expect(res.status).toBe(403);
  });

  it('creates a cake and returns it → 200 (admin, any sellerId)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.cake.create.mockResolvedValue(fakeCake);
    const res = await POST(makePostRequest({ cakeName: 'Schokoladenkuchen', sellerId: 1234 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cakeName).toBe('Schokoladenkuchen');
    expect(prismaMock.cake.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { cakeName: 'Schokoladenkuchen', sellerId: 1234 } })
    );
  });

  it('creates a cake for self → 200 (seller)', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.cake.create.mockResolvedValue(fakeCake);
    const res = await POST(makePostRequest({ cakeName: 'Schokoladenkuchen', sellerId: 1234 }));
    expect(res.status).toBe(200);
  });

  it('accepts string sellerId (converts to int)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.cake.create.mockResolvedValue(fakeCake);
    const res = await POST(makePostRequest({ cakeName: 'Torte', sellerId: '5678' }));
    expect(res.status).toBe(200);
    expect(prismaMock.cake.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sellerId: 5678 }) })
    );
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.cake.create.mockRejectedValue(new Error('DB error'));
    const res = await POST(makePostRequest({ cakeName: 'Torte', sellerId: 1234 }));
    expect(res.status).toBe(500);
  });
});

describe('PUT /api/cakes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await PUT(new Request('http://localhost/api/cakes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, cakeName: 'Torte' }),
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when id or cakeName is missing', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await PUT(new Request('http://localhost/api/cakes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cakeName: 'Torte' }),
    }));
    expect(res.status).toBe(400);
  });

  it('updates cake and returns it → 200 (admin)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.cake.update.mockResolvedValue({ ...fakeCake, cakeName: 'Apfelkuchen' });
    const res = await PUT(new Request('http://localhost/api/cakes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, cakeName: 'Apfelkuchen' }),
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).cakeName).toBe('Apfelkuchen');
  });

  it('returns 403 when seller tries to update someone else\'s cake', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.cake.findUnique.mockResolvedValue({ id: 1, cakeName: 'X', sellerId: 9999 });
    const res = await PUT(new Request('http://localhost/api/cakes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, cakeName: 'Apfelkuchen' }),
    }));
    expect(res.status).toBe(403);
  });

  it('allows seller to update own cake', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.cake.findUnique.mockResolvedValue({ id: 1, cakeName: 'X', sellerId: 1234 });
    prismaMock.cake.update.mockResolvedValue({ id: 1, cakeName: 'Apfelkuchen', sellerId: 1234 });
    const res = await PUT(new Request('http://localhost/api/cakes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, cakeName: 'Apfelkuchen' }),
    }));
    expect(res.status).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.cake.update.mockRejectedValue(new Error('DB error'));
    const res = await PUT(new Request('http://localhost/api/cakes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, cakeName: 'X' }),
    }));
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/cakes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await DELETE(new Request('http://localhost/api/cakes?id=1', { method: 'DELETE' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when id is missing', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await DELETE(new Request('http://localhost/api/cakes', { method: 'DELETE' }));
    expect(res.status).toBe(400);
  });

  it('deletes cake and returns success (admin)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.cake.delete.mockResolvedValue({});
    const res = await DELETE(new Request('http://localhost/api/cakes?id=1', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('returns 403 when seller tries to delete someone else\'s cake', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.cake.findUnique.mockResolvedValue({ id: 1, cakeName: 'X', sellerId: 9999 });
    const res = await DELETE(new Request('http://localhost/api/cakes?id=1', { method: 'DELETE' }));
    expect(res.status).toBe(403);
  });

  it('allows seller to delete own cake', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.cake.findUnique.mockResolvedValue({ id: 1, cakeName: 'X', sellerId: 1234 });
    prismaMock.cake.delete.mockResolvedValue({});
    const res = await DELETE(new Request('http://localhost/api/cakes?id=1', { method: 'DELETE' }));
    expect(res.status).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.cake.delete.mockRejectedValue(new Error('DB error'));
    const res = await DELETE(new Request('http://localhost/api/cakes?id=1', { method: 'DELETE' }));
    expect(res.status).toBe(500);
  });
});
