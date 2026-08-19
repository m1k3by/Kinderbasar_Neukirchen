import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';
import { dec } from '../helpers/decimal';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  basarSeller: { findUnique: vi.fn(), findMany: vi.fn() },
  settlement: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  basar: { findUnique: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

// POST schreibt deleteMany + createMany über die Array-Form von $transaction. Die gemockten
// Aufrufe liefern bereits Promises, der Mock muss sie nur wie Prismas echte
// Array-Transaktion abwarten.
function mockTransactionArray() {
  prismaMock.$transaction.mockImplementation((arg: any) =>
    Array.isArray(arg) ? Promise.all(arg) : arg(prismaMock)
  );
}

// Standard-Schreibmocks: deleteMany/createMany liefern counts wie Prisma.
function mockWrites(createdCount = 1) {
  prismaMock.settlement.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.settlement.createMany.mockResolvedValue({ count: createdCount });
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

// commissionPercent und entryFee sind im Schema Decimal – deshalb dec() statt 20 / 0.
// Siehe helpers/decimal.ts: ein Mock mit plain numbers verhält sich hier anders als Postgres.
const closedBasar = { id: 'basar-1', status: 'CLOSED', commissionPercent: dec(20), entryFee: dec(0) };
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
    prismaMock.$queryRaw.mockResolvedValue([
      { basarSellerId: 'bs-1', commissionOverride: null, grossRevenue: dec('5.00') },
    ]);
    mockWrites(1);

    const res = await POST(makePostRequest(), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.created).toBe(1);
    expect(data.total).toBe(1);
    // Wirkung prüfen, nicht nur Statuscode: der fachliche Inhalt steckt in den
    // createMany-Argumenten (CLAUDE.md-Testregel 3).
    expect(prismaMock.settlement.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          basarId: 'basar-1',
          basarSellerId: 'bs-1',
          grossRevenue: 5.0,
          commissionAmount: 1.0,
          netPayout: 4.0,
        }),
      ],
    });
    // deleteMany muss auf den Basar beschränkt sein – ohne where würde die Neu-Erzeugung
    // die Abrechnungen ALLER Basare löschen.
    expect(prismaMock.settlement.deleteMany).toHaveBeenCalledWith({ where: { basarId: 'basar-1' } });
    // Beide Schreiboperationen atomar in EINER Transaktion, kein Fenster ohne Abrechnungen.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  // Die Storno-Semantik (nur EIN nicht stornierter Sale je SOLD-Artikel zählt) lebt jetzt im
  // SQL-Aggregat und ist mit gemocktem $queryRaw nicht fachlich testbar. Als Regressionsschutz
  // gegen versehentliches Entfernen der Filter wird hier der Query-Text geprüft – schwächer
  // als ein Verhaltens-Test, aber das Maximum, das ein Mock hergibt.
  it('SQL-Aggregat filtert Stornos und zählt höchstens einen Sale pro Artikel', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(closedBasar);
    prismaMock.$queryRaw.mockResolvedValue([]);
    mockWrites(0);

    await POST(makePostRequest(), makeContext());

    const sql = (prismaMock.$queryRaw.mock.calls[0][0] as unknown as string[]).join('?');
    expect(sql).toContain('"isCancelled" = false');
    expect(sql).toContain('LIMIT 1');
    expect(sql).toContain(`'SOLD'`);
  });

  // Regressionstest gegen Decimal-Verkettung. Das Aggregat liefert grossRevenue als Prisma.Decimal,
  // dessen valueOf() eine Zeichenkette ist. Ohne Number() rechnete die Provision auf einem String –
  // mit number-Fixtures wäre das unsichtbar geblieben (CLAUDE.md-Testregel 1).
  it('rechnet den aggregierten Bruttoerlös numerisch, nicht als Zeichenkette', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(closedBasar);
    prismaMock.$queryRaw.mockResolvedValue([
      { basarSellerId: 'bs-1', commissionOverride: null, grossRevenue: dec('15.50') },
    ]);
    mockWrites(1);

    const res = await POST(makePostRequest(), makeContext());

    expect(res.status).toBe(200);
    const [[args]] = prismaMock.settlement.createMany.mock.calls;
    expect(args.data[0].grossRevenue).toBe(15.5);
    expect(typeof args.data[0].grossRevenue).toBe('number');
    expect(args.data[0].commissionAmount).toBe(3.1);   // 20 % von 15,50 €
    expect(args.data[0].netPayout).toBe(12.4);
  });

  it('rechnet mit der Provisionsabweichung des Verkäufers, wenn gesetzt', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ ...closedBasar, entryFee: dec('2.00') });
    prismaMock.$queryRaw.mockResolvedValue([
      { basarSellerId: 'bs-1', commissionOverride: dec(10), grossRevenue: dec('50.00') },
    ]);
    mockWrites(1);

    await POST(makePostRequest(), makeContext());

    const [[args]] = prismaMock.settlement.createMany.mock.calls;
    expect(args.data[0].grossRevenue).toBe(50);
    expect(args.data[0].commissionAmount).toBe(5);   // 10 %, nicht 20 %
    expect(args.data[0].entryFeeAmount).toBe(2);     // Teilnahmegebühr als Zahl, nicht Decimal
    expect(args.data[0].netPayout).toBe(43);         // 50 − 5 − 2
  });

  it('lässt die Auszahlung nicht negativ werden, wenn die Gebühr den Erlös übersteigt', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ ...closedBasar, entryFee: dec('5.00') });
    prismaMock.$queryRaw.mockResolvedValue([
      { basarSellerId: 'bs-1', commissionOverride: null, grossRevenue: dec('1.00') },
    ]);
    mockWrites(1);

    await POST(makePostRequest(), makeContext());

    const [[args]] = prismaMock.settlement.createMany.mock.calls;
    expect(args.data[0].netPayout).toBe(0);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockRejectedValue(new Error('DB'));
    const res = await POST(makePostRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});
