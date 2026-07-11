import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  basar: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

// Mock @prisma/client BasarStatus enum
vi.mock('@prisma/client', () => ({
  BasarStatus: { DRAFT: 'DRAFT', OPEN: 'OPEN', ACTIVE: 'ACTIVE', CLOSED: 'CLOSED' },
}));

import { PATCH } from '@/app/api/basars/[id]/status/route';

function makePatchRequest(body: object = {}) {
  return new Request('http://localhost/api/basars/b1/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function makeContext(id = 'b1') {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/basars/[id]/status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await PATCH(makePatchRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await PATCH(makePatchRequest(), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns 404 when basar not found', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(null);
    const res = await PATCH(makePatchRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 400 when already CLOSED', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'b1', status: 'CLOSED' });
    const res = await PATCH(makePatchRequest(), makeContext());
    expect(res.status).toBe(400);
  });

  it('advances DRAFT → OPEN', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'b1', status: 'DRAFT' });
    prismaMock.basar.update.mockResolvedValue({ id: 'b1', status: 'OPEN' });
    const res = await PATCH(makePatchRequest(), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('OPEN');
  });

  it('advances OPEN → ACTIVE', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'b1', status: 'OPEN' });
    prismaMock.basar.update.mockResolvedValue({ id: 'b1', status: 'ACTIVE' });
    const res = await PATCH(makePatchRequest(), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('ACTIVE');
  });

  it('sets explicit status from body when it matches the valid next transition', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'b1', status: 'DRAFT' });
    prismaMock.basar.update.mockResolvedValue({ id: 'b1', status: 'OPEN' });
    const res = await PATCH(makePatchRequest({ status: 'OPEN' }), makeContext());
    expect(res.status).toBe(200);
  });

  it('rejects an explicit status that skips the state machine (DRAFT → CLOSED)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'b1', status: 'DRAFT' });
    const res = await PATCH(makePatchRequest({ status: 'CLOSED' }), makeContext());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Ungültiger Statusübergang/);
    expect(prismaMock.basar.update).not.toHaveBeenCalled();
  });

  it('rejects an explicit status that skips ahead (DRAFT → ACTIVE)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'b1', status: 'DRAFT' });
    const res = await PATCH(makePatchRequest({ status: 'ACTIVE' }), makeContext());
    expect(res.status).toBe(400);
  });

  it('rejects a garbage status value', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'b1', status: 'DRAFT' });
    const res = await PATCH(makePatchRequest({ status: 'NOT_A_STATUS' }), makeContext());
    expect(res.status).toBe(400);
  });

  it('allows a one-step rollback (OPEN → DRAFT)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'b1', status: 'OPEN' });
    prismaMock.basar.update.mockResolvedValue({ id: 'b1', status: 'DRAFT' });
    const res = await PATCH(makePatchRequest({ status: 'DRAFT' }), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('DRAFT');
  });

  it('allows a one-step rollback (ACTIVE → OPEN)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'b1', status: 'ACTIVE' });
    prismaMock.basar.update.mockResolvedValue({ id: 'b1', status: 'OPEN' });
    const res = await PATCH(makePatchRequest({ status: 'OPEN' }), makeContext());
    expect(res.status).toBe(200);
  });

  it('allows a one-step rollback (CLOSED → ACTIVE)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'b1', status: 'CLOSED' });
    prismaMock.basar.update.mockResolvedValue({ id: 'b1', status: 'ACTIVE' });
    const res = await PATCH(makePatchRequest({ status: 'ACTIVE' }), makeContext());
    expect(res.status).toBe(200);
  });

  it('rejects two-step rollback (CLOSED → OPEN)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'b1', status: 'CLOSED' });
    const res = await PATCH(makePatchRequest({ status: 'OPEN' }), makeContext());
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockRejectedValue(new Error('DB'));
    const res = await PATCH(makePatchRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});
