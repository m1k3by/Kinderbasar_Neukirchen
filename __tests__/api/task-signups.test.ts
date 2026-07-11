import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

// ─── next/headers mock ────────────────────────────────────────────────────────
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

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

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234 }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when a seller tries to sign up someone else', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 9999 }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when taskId/sellerId missing (admin, no sellerId given)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makePostRequest({ taskId: 'task-1' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when already signed up', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.taskSignup.findUnique.mockResolvedValue({ id: 'existing' });
    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/bereits/i);
  });

  it('returns 404 when task not found', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.task.findUnique.mockResolvedValue(null);
    const res = await POST(makePostRequest({ taskId: 'unknown', sellerId: 1234 }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when no capacity left', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
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

  it('creates signup and returns success → 200 (self)', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.task.findUnique.mockResolvedValue({ ...fakeTask, signups: [] }); // has capacity
    prismaMock.taskSignup.findMany.mockResolvedValue([]);
    prismaMock.taskSignup.create.mockResolvedValue({ id: 'new-signup', taskId: 'task-1', sellerId: 1234 });

    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234 }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('admin can sign up any seller', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.task.findUnique.mockResolvedValue({ ...fakeTask, signups: [] });
    prismaMock.taskSignup.findMany.mockResolvedValue([]);
    prismaMock.taskSignup.create.mockResolvedValue({ id: 'new-signup', taskId: 'task-1', sellerId: 9999 });

    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 9999 }));
    expect(res.status).toBe(200);
  });

  it('returns 500 on unexpected error', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.taskSignup.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234 }));
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/task-signups', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await DELETE(makeDeleteRequest('task-1', '1234'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when a seller tries to remove someone else', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await DELETE(makeDeleteRequest('task-1', '9999'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when taskId/sellerId missing (admin, no sellerId given)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await DELETE(makeDeleteRequest('task-1'));
    expect(res.status).toBe(400);
  });

  it('deletes signup and returns success (self)', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.taskSignup.delete.mockResolvedValue({});
    const res = await DELETE(makeDeleteRequest('task-1', '1234'));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.taskSignup.delete.mockRejectedValue(new Error('DB error'));
    const res = await DELETE(makeDeleteRequest('task-1', '1234'));
    expect(res.status).toBe(500);
  });
});
