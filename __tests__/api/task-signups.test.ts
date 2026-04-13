import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  taskSignup: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  task: {
    findUnique: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { POST, DELETE } from '@/app/api/task-signups/route';

function makePostRequest(body: object) {
  return new Request('http://localhost/api/task-signups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any; // NextRequest-compatible
}

function makeDeleteRequest(taskId?: string, sellerId?: string) {
  const url = `http://localhost/api/task-signups?${new URLSearchParams({ ...(taskId && { taskId }), ...(sellerId && { sellerId }) }).toString()}`;
  return new Request(url, { method: 'DELETE' }) as any;
}

const fakeTask = {
  id: 'task-1',
  title: 'Setup',
  day: 'Samstag',
  timeFrom: '08:00',
  timeTo: '10:00',
  capacity: 5,
  signups: [],
};

describe('POST /api/task-signups', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when taskId/sellerId missing', async () => {
    const res = await POST(makePostRequest({ taskId: 'task-1' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when already signed up', async () => {
    prismaMock.taskSignup.findUnique.mockResolvedValue({ id: 'existing' });
    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/bereits/i);
  });

  it('returns 404 when task not found', async () => {
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.task.findUnique.mockResolvedValue(null);
    const res = await POST(makePostRequest({ taskId: 'unknown', sellerId: 1234 }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when no capacity left', async () => {
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.task.findUnique.mockResolvedValue({
      ...fakeTask,
      signups: [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }, { id: 's5' }], // capacity exceeded
    });
    prismaMock.taskSignup.findMany.mockResolvedValue([]);
    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/keine plätze/i);
  });

  it('creates signup and returns success → 200', async () => {
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.task.findUnique.mockResolvedValue({ ...fakeTask, signups: [] }); // has capacity
    prismaMock.taskSignup.findMany.mockResolvedValue([]);
    prismaMock.taskSignup.create.mockResolvedValue({ id: 'new-signup', taskId: 'task-1', sellerId: 1234 });

    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234 }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('returns 500 on unexpected error', async () => {
    prismaMock.taskSignup.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234 }));
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/task-signups', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when taskId/sellerId missing', async () => {
    const res = await DELETE(makeDeleteRequest('task-1'));
    expect(res.status).toBe(400);
  });

  it('deletes signup and returns success', async () => {
    prismaMock.taskSignup.delete.mockResolvedValue({});
    const res = await DELETE(makeDeleteRequest('task-1', '1234'));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    prismaMock.taskSignup.delete.mockRejectedValue(new Error('DB error'));
    const res = await DELETE(makeDeleteRequest('task-1', '1234'));
    expect(res.status).toBe(500);
  });
});
