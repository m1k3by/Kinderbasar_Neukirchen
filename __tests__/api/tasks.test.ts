import { describe, it, expect, vi, beforeEach } from 'vitest';

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

function makeRequest(method: string, body?: object, url = 'http://localhost/api/tasks') {
  return new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

const fakeTask = { id: 'task-1', title: 'Setup', day: 'Samstag', timeFrom: '08:00', timeTo: '10:00', capacity: 5, createdAt: new Date() };

describe('GET /api/tasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns list of tasks → 200', async () => {
    prismaMock.task.findMany.mockResolvedValue([fakeTask]);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
  });

  it('returns 500 on DB error', async () => {
    prismaMock.task.findMany.mockRejectedValue(new Error('DB error'));
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/tasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when title is missing', async () => {
    const res = await POST(makeRequest('POST', { day: 'Samstag', capacity: 5 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when capacity is not a positive number', async () => {
    const res = await POST(makeRequest('POST', { title: 'Setup', day: 'Samstag', capacity: -1 }));
    expect(res.status).toBe(400);
  });

  it('creates task and returns it → 200', async () => {
    prismaMock.task.create.mockResolvedValue(fakeTask);
    const res = await POST(makeRequest('POST', { title: 'Setup', day: 'Samstag', capacity: 5 }));
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe('Setup');
  });

  it('returns 500 on DB error', async () => {
    prismaMock.task.create.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeRequest('POST', { title: 'Setup', day: 'Samstag', capacity: 5 }));
    expect(res.status).toBe(500);
  });
});

describe('PUT /api/tasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when id is missing', async () => {
    const res = await PUT(makeRequest('PUT', { title: 'Setup', day: 'Samstag', capacity: 5 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when title/day/capacity missing', async () => {
    const res = await PUT(makeRequest('PUT', { id: 'task-1' }));
    expect(res.status).toBe(400);
  });

  it('updates task and returns it → 200', async () => {
    prismaMock.task.update.mockResolvedValue({ ...fakeTask, title: 'Updated' });
    const res = await PUT(makeRequest('PUT', { id: 'task-1', title: 'Updated', day: 'Samstag', capacity: 10 }));
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe('Updated');
  });

  it('returns 500 on DB error', async () => {
    prismaMock.task.update.mockRejectedValue(new Error('DB error'));
    const res = await PUT(makeRequest('PUT', { id: 'task-1', title: 'Updated', day: 'Samstag', capacity: 10 }));
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/tasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when id is missing', async () => {
    const res = await DELETE(makeRequest('DELETE', undefined, 'http://localhost/api/tasks'));
    expect(res.status).toBe(400);
  });

  it('deletes task and returns success', async () => {
    prismaMock.task.delete.mockResolvedValue({});
    const res = await DELETE(makeRequest('DELETE', undefined, 'http://localhost/api/tasks?id=task-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    prismaMock.task.delete.mockRejectedValue(new Error('DB error'));
    const res = await DELETE(makeRequest('DELETE', undefined, 'http://localhost/api/tasks?id=task-1'));
    expect(res.status).toBe(500);
  });
});
