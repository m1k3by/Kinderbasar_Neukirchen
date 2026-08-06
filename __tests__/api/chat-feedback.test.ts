import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

// ─── next/headers mock ────────────────────────────────────────────────────────
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  chatLog: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET, POST, PATCH } from '@/app/api/chat-feedback/route';

function makePostRequest(body: object) {
  return new Request('http://localhost/api/chat-feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(body: object) {
  return new Request('http://localhost/api/chat-feedback', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const fakeLog = {
  id: 'log1',
  sellerId: 1234,
  role: 'seller',
  question: 'Wie drucke ich Etiketten?',
  matchedFaqId: 'seller-etiketten',
  resultType: 'answer',
  helpful: null,
  createdAt: new Date(),
};

describe('POST /api/chat-feedback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST(makePostRequest({ question: 'Wie?', resultType: 'answer' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when question is missing', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(makePostRequest({ resultType: 'answer' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when question is blank', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(makePostRequest({ question: '   ', resultType: 'answer' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid resultType', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(makePostRequest({ question: 'Wie?', resultType: 'maybe' }));
    expect(res.status).toBe(400);
  });

  it('creates a log entry and returns its id (happy path)', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.chatLog.create.mockResolvedValue(fakeLog);
    const res = await POST(makePostRequest({
      question: 'Wie drucke ich Etiketten?',
      matchedFaqId: 'seller-etiketten',
      resultType: 'answer',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('log1');
    expect(prismaMock.chatLog.create).toHaveBeenCalledWith({
      data: {
        sellerId: 1234,
        role: 'seller',
        question: 'Wie drucke ich Etiketten?',
        matchedFaqId: 'seller-etiketten',
        resultType: 'answer',
      },
    });
  });

  it('allows an omitted matchedFaqId (suggestions/none results)', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.chatLog.create.mockResolvedValue({ ...fakeLog, matchedFaqId: null, resultType: 'none' });
    const res = await POST(makePostRequest({ question: 'asdfgh', resultType: 'none' }));
    expect(res.status).toBe(200);
    expect(prismaMock.chatLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ matchedFaqId: null }) })
    );
  });

  it('truncates the question to 300 characters', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.chatLog.create.mockResolvedValue(fakeLog);
    const longQuestion = 'x'.repeat(400);
    await POST(makePostRequest({ question: longQuestion, resultType: 'none' }));
    const dataArg = prismaMock.chatLog.create.mock.calls[0][0].data;
    expect(dataArg.question.length).toBe(300);
  });

  it('records sellerId null and role for admin callers', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.chatLog.create.mockResolvedValue(fakeLog);
    await POST(makePostRequest({ question: 'Wie?', resultType: 'answer' }));
    expect(prismaMock.chatLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sellerId: null, role: 'admin' }) })
    );
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.chatLog.create.mockRejectedValue(new Error('DB error'));
    const res = await POST(makePostRequest({ question: 'Wie?', resultType: 'answer' }));
    expect(res.status).toBe(500);
  });
});

describe('PATCH /api/chat-feedback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await PATCH(makePatchRequest({ logId: 'log1', helpful: true }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when logId is missing', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await PATCH(makePatchRequest({ helpful: true }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when helpful is not a boolean', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await PATCH(makePatchRequest({ logId: 'log1', helpful: 'yes' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the log entry does not exist', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.chatLog.findUnique.mockResolvedValue(null);
    const res = await PATCH(makePatchRequest({ logId: 'missing', helpful: true }));
    expect(res.status).toBe(404);
  });

  it('returns 403 when a seller tries to rate someone else\'s log', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.chatLog.findUnique.mockResolvedValue({ ...fakeLog, sellerId: 9999 });
    const res = await PATCH(makePatchRequest({ logId: 'log1', helpful: true }));
    expect(res.status).toBe(403);
  });

  it('sets the helpful flag on the caller\'s own log (happy path)', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.chatLog.findUnique.mockResolvedValue({ ...fakeLog, sellerId: 1234 });
    prismaMock.chatLog.update.mockResolvedValue({ ...fakeLog, sellerId: 1234, helpful: true });
    const res = await PATCH(makePatchRequest({ logId: 'log1', helpful: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.helpful).toBe(true);
    expect(prismaMock.chatLog.update).toHaveBeenCalledWith({ where: { id: 'log1' }, data: { helpful: true } });
  });

  it('allows admins to rate any log entry', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.chatLog.findUnique.mockResolvedValue({ ...fakeLog, sellerId: 9999 });
    prismaMock.chatLog.update.mockResolvedValue({ ...fakeLog, sellerId: 9999, helpful: false });
    const res = await PATCH(makePatchRequest({ logId: 'log1', helpful: false }));
    expect(res.status).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.chatLog.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await PATCH(makePatchRequest({ logId: 'log1', helpful: true }));
    expect(res.status).toBe(500);
  });
});

describe('GET /api/chat-feedback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin caller', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns logs and aggregates for admins (happy path)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.chatLog.findMany.mockResolvedValue([fakeLog]);
    prismaMock.chatLog.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(3) // unanswered (resultType none)
      .mockResolvedValueOnce(2); // unhelpful
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.logs).toHaveLength(1);
    expect(json.aggregates).toEqual({ total: 10, unanswered: 3, unhelpful: 2 });
    expect(prismaMock.chatLog.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' }, take: 200 });
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.chatLog.findMany.mockRejectedValue(new Error('DB error'));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
