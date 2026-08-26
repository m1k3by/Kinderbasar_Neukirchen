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
    count: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  task: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

// Interactive transaction: prisma.$transaction(async (tx) => {...}). The mocked tx client
// reuses the same model mocks as the top-level prismaMock (mirrors the pattern in
// basars-id-sales.test.ts).
function mockTransactionSuccess() {
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
}

import { POST, DELETE } from '@/app/api/task-signups/route';

function makePostRequest(body: object) {
  return new Request('http://localhost/api/task-signups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any; // NextRequest-compatible
}

// basarId: '' bedeutet "Parameter weglassen". undefined ginge nicht – ein Default-Wert
// greift genau dann, wenn undefined übergeben wird, der Weglass-Fall wäre also nie geprüft.
function makeDeleteRequest(taskId?: string, sellerId?: string, basarId = BASAR) {
  const url = `http://localhost/api/task-signups?${new URLSearchParams({ ...(taskId && { taskId }), ...(sellerId && { sellerId }), ...(basarId && { basarId }) }).toString()}`;
  return new Request(url, { method: 'DELETE' }) as any;
}

const BASAR = 'basar-a';

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
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionSuccess();
  });

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234, basarId: BASAR }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when a seller tries to sign up someone else', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 9999, basarId: BASAR }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when taskId/sellerId missing (admin, no sellerId given)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makePostRequest({ taskId: 'task-1', basarId: BASAR }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when basarId is missing', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234 }));
    expect(res.status).toBe(400);
    expect(prismaMock.taskSignup.create).not.toHaveBeenCalled();
  });

  it('returns 400 when already signed up', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.taskSignup.findUnique.mockResolvedValue({ id: 'existing' });
    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234, basarId: BASAR }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/bereits/i);
  });

  it('returns 404 when task not found', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.task.findUnique.mockResolvedValue(null);
    const res = await POST(makePostRequest({ taskId: 'unknown', sellerId: 1234, basarId: BASAR }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when no capacity left (fresh count inside the transaction)', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.task.findUnique.mockResolvedValue(fakeTask); // capacity: 5
    prismaMock.taskSignup.findMany.mockResolvedValue([]);
    prismaMock.taskSignup.count.mockResolvedValue(5); // already at capacity
    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234, basarId: BASAR }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/keine plätze/i);
    expect(prismaMock.taskSignup.create).not.toHaveBeenCalled();
  });

  it('capacity check and create run inside one transaction (race-safety)', async () => {
    // This is the behavior that prevents overbooking when the Helferliste opens and everyone
    // signs up at once: the count is re-read fresh inside prisma.$transaction rather than
    // relying on a value read before the transaction started.
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.task.findUnique.mockResolvedValue(fakeTask);
    prismaMock.taskSignup.findMany.mockResolvedValue([]);
    prismaMock.taskSignup.count.mockResolvedValue(0);
    prismaMock.taskSignup.create.mockResolvedValue({ id: 'new-signup', taskId: 'task-1', sellerId: 1234 });

    await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234, basarId: BASAR }));
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.taskSignup.count).toHaveBeenCalledWith({ where: { taskId: 'task-1', basarId: BASAR } });
  });

  it('creates signup and returns success → 200 (self)', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.task.findUnique.mockResolvedValue(fakeTask); // has capacity
    prismaMock.taskSignup.findMany.mockResolvedValue([]);
    prismaMock.taskSignup.count.mockResolvedValue(0);
    prismaMock.taskSignup.create.mockResolvedValue({ id: 'new-signup', taskId: 'task-1', sellerId: 1234 });

    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234, basarId: BASAR }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('admin can sign up any seller', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.task.findUnique.mockResolvedValue(fakeTask);
    prismaMock.taskSignup.findMany.mockResolvedValue([]);
    prismaMock.taskSignup.count.mockResolvedValue(0);
    prismaMock.taskSignup.create.mockResolvedValue({ id: 'new-signup', taskId: 'task-1', sellerId: 9999 });

    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 9999, basarId: BASAR }));
    expect(res.status).toBe(200);
  });

  it('returns 500 on unexpected error', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.taskSignup.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234, basarId: BASAR }));
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

  it('returns 400 when basarId is missing', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await DELETE(makeDeleteRequest('task-1', '1234', ''));
    expect(res.status).toBe(400);
    expect(prismaMock.taskSignup.delete).not.toHaveBeenCalled();
  });

  it('löscht über den dreiteiligen Unique-Key, nicht über taskId+sellerId', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.taskSignup.delete.mockResolvedValue({});
    await DELETE(makeDeleteRequest('task-1', '1234'));
    expect(prismaMock.taskSignup.delete).toHaveBeenCalledWith({
      where: { taskId_sellerId_basarId: { taskId: 'task-1', sellerId: 1234, basarId: BASAR } },
    });
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

// ─── Zeitüberschneidung: Kulanzregel ─────────────────────────────────────────
// Gemeldeter Fall: eine Schicht endet um 18:00, die nächste beginnt um 18:00 – das muss
// gehen. Geprüft wird jeweils, ob tatsächlich ein Signup *geschrieben* wird; der Statuscode
// allein würde eine stillschweigend verweigerte Eintragung nicht auffallen lassen.
describe('POST /api/task-signups – Überschneidung mit Kulanz', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionSuccess();
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.taskSignup.count.mockResolvedValue(0);
    prismaMock.taskSignup.create.mockResolvedValue({ id: 'signup-neu' });
  });

  /** Zielaufgabe + eine bereits belegte Aufgabe am selben Tag. */
  function setup(target: { timeFrom: string; timeTo: string }, existing: { timeFrom: string; timeTo: string }) {
    prismaMock.task.findUnique.mockResolvedValue({ ...fakeTask, id: 'task-neu', day: 'Freitag', ...target });
    prismaMock.taskSignup.findMany.mockResolvedValue([
      { task: { ...fakeTask, id: 'task-alt', title: 'Preiszettel abziehen', day: 'Freitag', ...existing } },
    ]);
  }

  it('lässt eine Schicht zu, die genau beim Ende der vorherigen beginnt', async () => {
    setup({ timeFrom: '18:00', timeTo: '20:00' }, { timeFrom: '16:00', timeTo: '18:00' });
    const res = await POST(makePostRequest({ taskId: 'task-neu', sellerId: 1234, basarId: BASAR }));
    expect(res.status).toBe(200);
    expect(prismaMock.taskSignup.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { taskId: 'task-neu', sellerId: 1234, basarId: BASAR } })
    );
  });

  it('lässt 3 Minuten Überschneidung durch', async () => {
    setup({ timeFrom: '17:57', timeTo: '20:00' }, { timeFrom: '16:00', timeTo: '18:00' });
    const res = await POST(makePostRequest({ taskId: 'task-neu', sellerId: 1234, basarId: BASAR }));
    expect(res.status).toBe(200);
    expect(prismaMock.taskSignup.create).toHaveBeenCalled();
  });

  it('blockiert ab 4 Minuten Überschneidung', async () => {
    setup({ timeFrom: '17:56', timeTo: '20:00' }, { timeFrom: '16:00', timeTo: '18:00' });
    const res = await POST(makePostRequest({ taskId: 'task-neu', sellerId: 1234, basarId: BASAR }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Preiszettel abziehen/);
    expect(prismaMock.taskSignup.create).not.toHaveBeenCalled();
  });

  it('blockiert eine echte Doppelbuchung weiterhin', async () => {
    setup({ timeFrom: '16:00', timeTo: '20:00' }, { timeFrom: '16:00', timeTo: '18:00' });
    const res = await POST(makePostRequest({ taskId: 'task-neu', sellerId: 1234, basarId: BASAR }));
    expect(res.status).toBe(400);
    expect(prismaMock.taskSignup.create).not.toHaveBeenCalled();
  });

  it('prüft nur denselben Tag', async () => {
    prismaMock.task.findUnique.mockResolvedValue({ ...fakeTask, id: 'task-neu', day: 'Samstag', timeFrom: '16:00', timeTo: '20:00' });
    prismaMock.taskSignup.findMany.mockResolvedValue([
      { task: { ...fakeTask, id: 'task-alt', day: 'Freitag', timeFrom: '16:00', timeTo: '20:00' } },
    ]);
    const res = await POST(makePostRequest({ taskId: 'task-neu', sellerId: 1234, basarId: BASAR }));
    expect(res.status).toBe(200);
    expect(prismaMock.taskSignup.create).toHaveBeenCalled();
  });
});

// ─── Basar-Trennung ───────────────────────────────────────────────────────────
// Anmeldungen gehören zu einem Basar. Der Unique-Key ist deshalb [taskId, sellerId, basarId]
// – stünde basarId nicht darin, könnte sich niemand im nächsten Basar für eine Schicht
// eintragen, für die er im letzten eingetragen war. Geprüft wird jeweils, ob geschrieben
// wird und mit welchen Argumenten; ein 200 allein sagt darüber nichts.
describe('POST /api/task-signups – Trennung nach Basar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionSuccess();
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.task.findUnique.mockResolvedValue(fakeTask);
    prismaMock.taskSignup.count.mockResolvedValue(0);
    prismaMock.taskSignup.create.mockResolvedValue({ id: 'neu' });
  });

  it('prüft die Dublette über den dreiteiligen Unique-Key', async () => {
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.taskSignup.findMany.mockResolvedValue([]);
    await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234, basarId: BASAR }));
    expect(prismaMock.taskSignup.findUnique).toHaveBeenCalledWith({
      where: { taskId_sellerId_basarId: { taskId: 'task-1', sellerId: 1234, basarId: BASAR } },
    });
  });

  it('erlaubt dieselbe Schicht in einem anderen Basar', async () => {
    // findUnique liefert null, weil im Basar B noch nichts existiert – genau das ist der
    // Unterschied zum alten [taskId, sellerId]-Key, unter dem hier "bereits angemeldet" käme.
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.taskSignup.findMany.mockResolvedValue([]);
    const res = await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234, basarId: 'basar-b' }));
    expect(res.status).toBe(200);
    expect(prismaMock.taskSignup.create).toHaveBeenCalledWith({
      data: { taskId: 'task-1', sellerId: 1234, basarId: 'basar-b' },
    });
  });

  it('sucht Überschneidungen nur im selben Basar', async () => {
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.taskSignup.findMany.mockResolvedValue([]);
    await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234, basarId: BASAR }));
    expect(prismaMock.taskSignup.findMany).toHaveBeenCalledWith({
      where: { sellerId: 1234, basarId: BASAR },
      include: { task: true },
    });
  });

  it('zählt die Kapazität nur im selben Basar', async () => {
    prismaMock.taskSignup.findUnique.mockResolvedValue(null);
    prismaMock.taskSignup.findMany.mockResolvedValue([]);
    await POST(makePostRequest({ taskId: 'task-1', sellerId: 1234, basarId: 'basar-b' }));
    expect(prismaMock.taskSignup.count).toHaveBeenCalledWith({
      where: { taskId: 'task-1', basarId: 'basar-b' },
    });
  });
});
