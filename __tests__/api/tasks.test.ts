import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

// ─── next/headers mock ────────────────────────────────────────────────────────
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  task: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET, POST, PUT, DELETE } from '@/app/api/tasks/route';

const BASAR = 'basar-a';

function makeRequest(method: string, body?: object, url = `http://localhost/api/tasks?basarId=${BASAR}`) {
  return new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

const fakeTask = { id: 'task-1', title: 'Setup', day: 'Samstag', timeFrom: '08:00', timeTo: '10:00', capacity: 5, createdAt: new Date() };

describe('GET /api/tasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when basarId is missing', async () => {
    // Ohne Basar gibt es keine sinnvolle Helferzahl. Ein stiller Fallback auf "alle Basare"
    // hätte hier lange Zeit falsche Zahlen geliefert, ohne dass etwas aufgefallen wäre.
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await GET(makeRequest('GET', undefined, 'http://localhost/api/tasks'));
    expect(res.status).toBe(400);
    expect(prismaMock.task.findMany).not.toHaveBeenCalled();
  });

  it('returns list of tasks → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.task.findMany.mockResolvedValue([fakeTask]);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
  });

  // Das gemockte findMany ignoriert die Projektion, deshalb sagt die Antwort selbst nichts
  // über sie aus – geprüft werden muss das Argument. Genau diese Lücke hat /admin/tasks
  // monatelang "0 / 8 Helfer" anzeigen lassen, nachdem ein Feld aus dem select verschwand.
  it('grenzt die Anmeldungen auf den Basar ein und liefert sie mit', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.task.findMany.mockResolvedValue([fakeTask]);
    await GET(makeRequest('GET'));
    const args = prismaMock.task.findMany.mock.calls[0][0];
    expect(args.select.signups.where).toEqual({ basarId: BASAR });
    expect(args.select.signups.select.sellerId).toBe(true);
    expect(args.select.capacity).toBe(true);
  });

  it('liefert Helfer-E-Mails nur an Admins', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.task.findMany.mockResolvedValue([fakeTask]);
    await GET(makeRequest('GET'));
    expect(prismaMock.task.findMany.mock.calls[0][0].select.signups.select.seller.select.email)
      .toBeUndefined();

    vi.clearAllMocks();
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.task.findMany.mockResolvedValue([fakeTask]);
    await GET(makeRequest('GET'));
    expect(prismaMock.task.findMany.mock.calls[0][0].select.signups.select.seller.select.email)
      .toBe(true);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.task.findMany.mockRejectedValue(new Error('DB error'));
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/tasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST(makeRequest('POST', { title: 'Setup', day: 'Samstag', capacity: 5 }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(makeRequest('POST', { title: 'Setup', day: 'Samstag', capacity: 5 }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when title is missing', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makeRequest('POST', { day: 'Samstag', capacity: 5 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when capacity is not a positive number', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makeRequest('POST', { title: 'Setup', day: 'Samstag', capacity: -1 }));
    expect(res.status).toBe(400);
  });

  it('creates task and returns it → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.task.create.mockResolvedValue(fakeTask);
    const res = await POST(makeRequest('POST', { title: 'Setup', day: 'Samstag', capacity: 5 }));
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe('Setup');
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.task.create.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeRequest('POST', { title: 'Setup', day: 'Samstag', capacity: 5 }));
    expect(res.status).toBe(500);
  });
});

describe('PUT /api/tasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await PUT(makeRequest('PUT', { id: 'task-1', title: 'Setup', day: 'Samstag', capacity: 5 }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await PUT(makeRequest('PUT', { id: 'task-1', title: 'Setup', day: 'Samstag', capacity: 5 }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when id is missing', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await PUT(makeRequest('PUT', { title: 'Setup', day: 'Samstag', capacity: 5 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when title/day/capacity missing', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await PUT(makeRequest('PUT', { id: 'task-1' }));
    expect(res.status).toBe(400);
  });

  it('updates task and returns it → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.task.update.mockResolvedValue({ ...fakeTask, title: 'Updated' });
    const res = await PUT(makeRequest('PUT', { id: 'task-1', title: 'Updated', day: 'Samstag', capacity: 10 }));
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe('Updated');
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.task.update.mockRejectedValue(new Error('DB error'));
    const res = await PUT(makeRequest('PUT', { id: 'task-1', title: 'Updated', day: 'Samstag', capacity: 10 }));
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/tasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await DELETE(makeRequest('DELETE', undefined, 'http://localhost/api/tasks?id=task-1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await DELETE(makeRequest('DELETE', undefined, 'http://localhost/api/tasks?id=task-1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when id is missing', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await DELETE(makeRequest('DELETE', undefined, 'http://localhost/api/tasks'));
    expect(res.status).toBe(400);
  });

  it('deletes task and returns success', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.task.delete.mockResolvedValue({});
    const res = await DELETE(makeRequest('DELETE', undefined, 'http://localhost/api/tasks?id=task-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.task.delete.mockRejectedValue(new Error('DB error'));
    const res = await DELETE(makeRequest('DELETE', undefined, 'http://localhost/api/tasks?id=task-1'));
    expect(res.status).toBe(500);
  });
});
