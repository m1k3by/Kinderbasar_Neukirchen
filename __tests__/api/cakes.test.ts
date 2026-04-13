import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  cake: {
    findMany: vi.fn(),
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

  it('returns list of cakes → 200', async () => {
    prismaMock.cake.findMany.mockResolvedValue([fakeCake]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].cakeName).toBe('Schokoladenkuchen');
  });

  it('returns empty array when no cakes', async () => {
    prismaMock.cake.findMany.mockResolvedValue([]);
    const res = await GET(makeGetRequest());
    expect(await res.json()).toEqual([]);
  });

  it('returns 500 on DB error', async () => {
    prismaMock.cake.findMany.mockRejectedValue(new Error('DB error'));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });
});

describe('POST /api/cakes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when cakeName is missing', async () => {
    const res = await POST(makePostRequest({ sellerId: 1234 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when sellerId is missing', async () => {
    const res = await POST(makePostRequest({ cakeName: 'Torte' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric sellerId string', async () => {
    const res = await POST(makePostRequest({ cakeName: 'Torte', sellerId: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('creates a cake and returns it → 200', async () => {
    prismaMock.cake.create.mockResolvedValue(fakeCake);
    const res = await POST(makePostRequest({ cakeName: 'Schokoladenkuchen', sellerId: 1234 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cakeName).toBe('Schokoladenkuchen');
    expect(prismaMock.cake.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { cakeName: 'Schokoladenkuchen', sellerId: 1234 } })
    );
  });

  it('accepts string sellerId (converts to int)', async () => {
    prismaMock.cake.create.mockResolvedValue(fakeCake);
    const res = await POST(makePostRequest({ cakeName: 'Torte', sellerId: '5678' }));
    expect(res.status).toBe(200);
    expect(prismaMock.cake.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sellerId: 5678 }) })
    );
  });

  it('returns 500 on DB error', async () => {
    prismaMock.cake.create.mockRejectedValue(new Error('DB error'));
    const res = await POST(makePostRequest({ cakeName: 'Torte', sellerId: 1234 }));
    expect(res.status).toBe(500);
  });
});

describe('PUT /api/cakes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when id or cakeName is missing', async () => {
    const res = await PUT(new Request('http://localhost/api/cakes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cakeName: 'Torte' }),
    }));
    expect(res.status).toBe(400);
  });

  it('updates cake and returns it → 200', async () => {
    prismaMock.cake.update.mockResolvedValue({ ...fakeCake, cakeName: 'Apfelkuchen' });
    const res = await PUT(new Request('http://localhost/api/cakes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, cakeName: 'Apfelkuchen' }),
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).cakeName).toBe('Apfelkuchen');
  });

  it('returns 500 on DB error', async () => {
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

  it('returns 400 when id is missing', async () => {
    const res = await DELETE(new Request('http://localhost/api/cakes', { method: 'DELETE' }));
    expect(res.status).toBe(400);
  });

  it('deletes cake and returns success', async () => {
    prismaMock.cake.delete.mockResolvedValue({});
    const res = await DELETE(new Request('http://localhost/api/cakes?id=1', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    prismaMock.cake.delete.mockRejectedValue(new Error('DB error'));
    const res = await DELETE(new Request('http://localhost/api/cakes?id=1', { method: 'DELETE' }));
    expect(res.status).toBe(500);
  });
});
