import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  mailQueue: { findMany: vi.fn(), update: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

const sendMailMock = vi.hoisted(() => vi.fn());
vi.mock('@/app/lib/mail', () => ({ sendMail: sendMailMock }));

import { GET, POST } from '@/app/api/admin/mail-queue/route';

function makeRequest(query = '') {
  return new Request(`http://localhost/api/admin/mail-queue${query}`);
}

const pendingMail = {
  id: 'mail-1', to: 'a@b.de', subject: 'Hi', html: '<p>hi</p>', attachmentsJson: null,
  status: 'PENDING', attempts: 0, lastError: null, createdAt: new Date(), sentAt: null,
};

describe('POST /api/admin/mail-queue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it('does nothing and reports zero when the queue is empty', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.mailQueue.findMany.mockResolvedValue([]);
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 0, sent: 0, failed: 0 });
  });

  it('drains a batch: sends via sendMail and marks SENT with sentAt', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.mailQueue.findMany.mockResolvedValue([pendingMail]);
    sendMailMock.mockResolvedValue(undefined);
    prismaMock.mailQueue.update.mockResolvedValue({});

    const res = await POST();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(sendMailMock).toHaveBeenCalledWith('a@b.de', 'Hi', '<p>hi</p>', undefined);
    expect(prismaMock.mailQueue.update).toHaveBeenCalledWith({
      where: { id: 'mail-1' },
      data: expect.objectContaining({ status: 'SENT', sentAt: expect.any(Date), lastError: null }),
    });
  });

  it('parses attachmentsJson and passes it to sendMail – Pfad auf das aktuelle cwd bezogen', async () => {
    // Der gespeicherte Pfad wird *nicht* durchgereicht: er stammt aus der Umgebung, die die
    // Zeile eingereiht hat (auf Vercel /var/task), und zeigt beim Zustellen von woanders ins
    // Leere. Genau das liess am 26.08.2026 alle vier Registrierungsmails mit ENOENT
    // scheitern. Die frühere Fassung dieses Tests verlangte das Durchreichen ausdrücklich –
    // sie hat den Fehler nicht gefunden, sondern festgeschrieben.
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.mailQueue.findMany.mockResolvedValue([{
      ...pendingMail,
      attachmentsJson: JSON.stringify([{ filename: 'info.jpeg', path: '/var/task/info.jpeg' }]),
    }]);
    sendMailMock.mockResolvedValue(undefined);
    prismaMock.mailQueue.update.mockResolvedValue({});

    await POST();

    expect(sendMailMock).toHaveBeenCalledWith('a@b.de', 'Hi', '<p>hi</p>', [
      { filename: 'info.jpeg', path: path.join(process.cwd(), 'info.jpeg') },
    ]);
  });

  it('increments attempts and keeps status PENDING (retryable) on a failed send below MAX_ATTEMPTS', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.mailQueue.findMany.mockResolvedValue([{ ...pendingMail, attempts: 1 }]);
    sendMailMock.mockRejectedValue(new Error('SMTP down'));
    prismaMock.mailQueue.update.mockResolvedValue({});

    const res = await POST();

    const data = await res.json();
    expect(data).toEqual({ processed: 1, sent: 0, failed: 1 });
    expect(prismaMock.mailQueue.update).toHaveBeenCalledWith({
      where: { id: 'mail-1' },
      data: expect.objectContaining({ attempts: 2, status: 'PENDING', lastError: expect.stringContaining('SMTP down') }),
    });
  });

  it('marks status FAILED once attempts reach MAX_ATTEMPTS (stops auto-retrying, but stays visible via GET)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.mailQueue.findMany.mockResolvedValue([{ ...pendingMail, attempts: 4 }]); // 4 -> 5th attempt
    sendMailMock.mockRejectedValue(new Error('SMTP down'));
    prismaMock.mailQueue.update.mockResolvedValue({});

    await POST();

    expect(prismaMock.mailQueue.update).toHaveBeenCalledWith({
      where: { id: 'mail-1' },
      data: expect.objectContaining({ attempts: 5, status: 'FAILED' }),
    });
  });

  it('one failing mail does not stop the rest of the batch from being processed', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.mailQueue.findMany.mockResolvedValue([
      { ...pendingMail, id: 'mail-1' },
      { ...pendingMail, id: 'mail-2' },
    ]);
    sendMailMock.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);
    prismaMock.mailQueue.update.mockResolvedValue({});

    const res = await POST();
    const data = await res.json();
    expect(data).toEqual({ processed: 2, sent: 1, failed: 1 });
  });

  it('the batch query includes PENDING and retryable FAILED rows', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.mailQueue.findMany.mockResolvedValue([]);
    await POST();
    const call = prismaMock.mailQueue.findMany.mock.calls[0][0];
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        { status: 'PENDING' },
        { status: 'FAILED', attempts: { lt: 5 } },
      ])
    );
    expect(call.take).toBe(20);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.mailQueue.findMany.mockRejectedValue(new Error('DB error'));
    const res = await POST();
    expect(res.status).toBe(500);
  });
});

describe('GET /api/admin/mail-queue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it('lists FAILED rows so failures are visible instead of silently swallowed', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const failure = { id: 'mail-1', to: 'a@b.de', subject: 'Hi', attempts: 5, lastError: 'SMTP down', createdAt: new Date(), sentAt: null };
    prismaMock.mailQueue.findMany.mockResolvedValue([failure]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    // Response is JSON, so Date fields round-trip as ISO strings.
    expect(data.failures).toEqual([{ ...failure, createdAt: failure.createdAt.toISOString() }]);
    expect(prismaMock.mailQueue.findMany.mock.calls[0][0].where).toEqual({ status: 'FAILED' });
  });

  it('respects a ?limit= query param, clamped to 1-200', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.mailQueue.findMany.mockResolvedValue([]);
    await GET(makeRequest('?limit=9999'));
    expect(prismaMock.mailQueue.findMany.mock.calls[0][0].take).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.mailQueue.findMany.mockRejectedValue(new Error('DB error'));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
