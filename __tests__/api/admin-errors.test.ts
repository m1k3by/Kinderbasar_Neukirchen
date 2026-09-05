import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  errorLog: { findMany: vi.fn(), count: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET, PATCH, DELETE } from '@/app/api/admin/errors/route';

function makeRequest(query = '', init?: RequestInit) {
  return new Request(`http://localhost/api/admin/errors${query}`, init);
}

function patchRequest(body: unknown) {
  return makeRequest('', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const row = {
  id: 'err-1',
  source: 'SERVER',
  route: 'GET /api/basars',
  message: 'boom',
  stack: null,
  sellerId: null,
  role: null,
  userAgent: null,
  resolved: false,
  alerted: false,
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.errorLog.findMany.mockResolvedValue([row]);
  prismaMock.errorLog.count.mockResolvedValue(0);
  prismaMock.errorLog.update.mockResolvedValue({ ...row, resolved: true });
  prismaMock.errorLog.deleteMany.mockResolvedValue({ count: 3 });
});

describe('GET /api/admin/errors', () => {
  it('returns 401 without a token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    expect((await GET(makeRequest())).status).toBe(401);
  });

  it('returns 403 for a seller', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    expect((await GET(makeRequest())).status).toBe(403);
  });

  it('counts only unresolved entries for the navigation badge', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.errorLog.count.mockResolvedValue(7);

    const res = await GET(makeRequest('?count=1'));

    expect(await res.json()).toEqual({ unresolved: 7 });
    expect(prismaMock.errorLog.count).toHaveBeenCalledWith({ where: { resolved: false } });
    expect(prismaMock.errorLog.findMany).not.toHaveBeenCalled();
  });

  it('lists the newest entries with aggregates', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.errorLog.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.logs).toHaveLength(1);
    expect(json.aggregates).toEqual({ total: 12, unresolved: 4, clientErrors: 2 });
    expect(prismaMock.errorLog.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  });

  it('answers 500 when the database is unavailable', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.errorLog.findMany.mockRejectedValue(new Error('db weg'));

    expect((await GET(makeRequest())).status).toBe(500);
  });
});

describe('PATCH /api/admin/errors', () => {
  it('returns 403 for a seller', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    expect((await PATCH(patchRequest({ id: 'err-1', resolved: true }))).status).toBe(403);
  });

  it('rejects a missing id', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    expect((await PATCH(patchRequest({ resolved: true }))).status).toBe(400);
    expect(prismaMock.errorLog.update).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean resolved', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    expect((await PATCH(patchRequest({ id: 'err-1', resolved: 'ja' }))).status).toBe(400);
    expect(prismaMock.errorLog.update).not.toHaveBeenCalled();
  });

  it('marks the entry as resolved', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await PATCH(patchRequest({ id: 'err-1', resolved: true }));

    expect(res.status).toBe(200);
    expect(prismaMock.errorLog.update).toHaveBeenCalledWith({
      where: { id: 'err-1' },
      data: { resolved: true },
    });
  });

  it('reopens an entry', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.errorLog.update.mockResolvedValue({ ...row, resolved: false });

    await PATCH(patchRequest({ id: 'err-1', resolved: false }));

    expect(prismaMock.errorLog.update).toHaveBeenCalledWith({
      where: { id: 'err-1' },
      data: { resolved: false },
    });
  });

  it('answers 500 on an unparsable body', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    expect((await PATCH(patchRequest('kein json'))).status).toBe(500);
  });
});

describe('DELETE /api/admin/errors', () => {
  it('returns 403 for a seller', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    expect((await DELETE(makeRequest('?resolved=1', { method: 'DELETE' }))).status).toBe(403);
  });

  // Ein deleteMany ohne where liefert im Erfolgsfall dieselbe 200 wie das Gewollte – nur mit
  // dem gesamten Protokoll statt der erledigten Zeilen. Deshalb wird das Argument geprueft.
  it('deletes only resolved entries when asked to', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await DELETE(makeRequest('?resolved=1', { method: 'DELETE' }));

    expect(await res.json()).toEqual({ deleted: 3 });
    expect(prismaMock.errorLog.deleteMany).toHaveBeenCalledWith({ where: { resolved: true } });
  });

  it('clears everything without the parameter', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    await DELETE(makeRequest('', { method: 'DELETE' }));

    expect(prismaMock.errorLog.deleteMany).toHaveBeenCalledWith({ where: {} });
  });

  it('answers 500 when the delete fails', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.errorLog.deleteMany.mockRejectedValue(new Error('db weg'));

    expect((await DELETE(makeRequest('?resolved=1', { method: 'DELETE' }))).status).toBe(500);
  });
});
