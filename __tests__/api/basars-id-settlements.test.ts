import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  basarSeller: { findUnique: vi.fn(), findMany: vi.fn() },
  settlement: { findMany: vi.fn(), upsert: vi.fn() },
  basar: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

// POST batches settlement upserts via the array form of $transaction (prisma.$transaction([
// upsert1, upsert2, ...])) – one batch per SETTLEMENT_BATCH_SIZE sellers. The mocked upsert
// calls already return promises (since settlement.upsert is a vi.fn()), so the mock just
// needs to await them like Prisma's real array-transaction does.
function mockTransactionArray() {
  prismaMock.$transaction.mockImplementation((arg: any) =>
    Array.isArray(arg) ? Promise.all(arg) : arg(prismaMock)
  );
}

import { GET, POST } from '@/app/api/basars/[id]/settlements/route';

function makeContext(id = 'basar-1') {
  return { params: Promise.resolve({ id }) };
}
function makeGetRequest() {
  return new Request('http://localhost/api/basars/basar-1/settlements');
}
function makePostRequest() {
  return new Request('http://localhost/api/basars/basar-1/settlements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
}

const closedBasar = { id: 'basar-1', status: 'CLOSED', commissionPercent: 20, entryFee: 0 };
const openBasar = { id: 'basar-1', status: 'OPEN' };

describe('GET /api/basars/[id]/settlements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('seller: returns empty when not in basar', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basarSeller.findUnique.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).settlements).toEqual([]);
  });

  it('seller: returns own settlement', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basarSeller.findUnique.mockResolvedValue({
      id: 'bs-1', settlement: { id: 'set-1', netPayout: 10 },
    });
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.settlements).toHaveLength(1);
  });

  it('seller: returns empty settlements when no settlement yet', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basarSeller.findUnique.mockResolvedValue({ id: 'bs-1', settlement: null });
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).settlements).toEqual([]);
  });

  it('admin: returns all settlements', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.settlement.findMany.mockResolvedValue([{ id: 'set-1' }, { id: 'set-2' }]);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).settlements).toHaveLength(2);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.settlement.findMany.mockRejectedValue(new Error('DB'));
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});

describe('POST /api/basars/[id]/settlements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionArray();
  });

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST(makePostRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await POST(makePostRequest(), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns 404 when basar not found', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(null);
    const res = await POST(makePostRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 400 when basar not CLOSED', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    const res = await POST(makePostRequest(), makeContext());
    expect(res.status).toBe(400);
  });

  it('creates settlements successfully', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(closedBasar);
    prismaMock.basarSeller.findMany.mockResolvedValue([
      {
        id: 'bs-1', commissionOverride: null,
        articles: [
          { status: 'SOLD', sales: [{ isCancelled: false, salePrice: 5.0 }] },
          { status: 'AVAILABLE', sales: [] },
        ],
      },
    ]);
    prismaMock.settlement.upsert.mockResolvedValue({ id: 'set-1', netPayout: 4.0 });
    const res = await POST(makePostRequest(), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.created).toBe(1);
    // Progress/total reporting, since a single response can't stream progress for a run that
    // spans multiple batches.
    expect(data.total).toBe(1);
    expect(data.batches).toBe(1);
    expect(data.batchSize).toBe(100);
    expect(prismaMock.settlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ grossRevenue: 5.0, commissionAmount: 1.0, netPayout: 4.0 }),
      })
    );
    // Upserts run through $transaction (one batch here) rather than a bare sequential loop –
    // this is what keeps a batch from being partially written if it fails midway.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('chunks sellers into batches of 100, each in its own transaction', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(closedBasar);
    const manySellers = Array.from({ length: 150 }, (_, i) => ({
      id: `bs-${i}`,
      commissionOverride: null,
      articles: [],
    }));
    prismaMock.basarSeller.findMany.mockResolvedValue(manySellers);
    prismaMock.settlement.upsert.mockImplementation((args: any) =>
      Promise.resolve({ id: `set-${args.where.basarSellerId}`, netPayout: 0 })
    );

    const res = await POST(makePostRequest(), makeContext());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(150);
    expect(data.created).toBe(150);
    expect(data.batches).toBe(2); // ceil(150 / 100)
    // One $transaction call per batch (100 + 50), not one call per seller.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
  });

  it('ignores a cancelled sale on a SOLD article when computing settlement (storno-then-resell)', async () => {
    // An article can end up with multiple Sale rows after storno + resell; only the
    // non-cancelled one should count toward the seller's gross revenue.
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(closedBasar);
    prismaMock.basarSeller.findMany.mockResolvedValue([
      {
        id: 'bs-1', commissionOverride: null,
        articles: [
          {
            status: 'SOLD',
            sales: [
              { isCancelled: true, salePrice: 5.0 },
              { isCancelled: false, salePrice: 7.0 },
            ],
          },
        ],
      },
    ]);
    prismaMock.settlement.upsert.mockResolvedValue({ id: 'set-1', netPayout: 5.6 });
    const res = await POST(makePostRequest(), makeContext());
    expect(res.status).toBe(200);
    expect(prismaMock.settlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ grossRevenue: 7.0 }),
      })
    );
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockRejectedValue(new Error('DB'));
    const res = await POST(makePostRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});
