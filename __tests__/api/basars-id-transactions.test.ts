import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { adminToken, sellerToken, cashierToken } from '../helpers/tokens';
import { dec } from '../helpers/decimal';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  // requireCashier() liest isCashier aus der Datenbank, nicht aus dem Token (app/lib/apiAuth.ts).
  seller: { findUnique: vi.fn().mockResolvedValue({ isCashier: true }) },
  $queryRaw: vi.fn(),
  sale: { findMany: vi.fn() },
  basar: { findUnique: vi.fn() },
  basarInvite: { findUnique: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/basars/[id]/transactions/route';

function makeContext(id = 'basar-1') {
  return { params: Promise.resolve({ id }) };
}
function makeRequest(qs = '') {
  return new Request(`http://localhost/api/basars/basar-1/transactions${qs}`);
}

const seller = { sellerId: 1234, seller: { firstName: 'Max', lastName: 'Mustermann' } };
const cashier = { firstName: 'Anna', lastName: 'Kassiererin' };

// Die Abfragen laufen als Tagged Template über $queryRaw. Ein Mock führt kein SQL aus –
// geprüft wird deshalb der erzeugte Text mit eingesetzten Parametern. Ob Postgres das SQL so
// versteht, beweist das nicht; dafür wurde es gegen eine echte Postgres gefahren.
function rendered(call: unknown[]): string {
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];
  const q = Prisma.sql(strings, ...values);
  let i = 0;
  return q.sql.replace(/\?/g, () => JSON.stringify(q.values[i++]));
}
const pageQuery = () => rendered(prismaMock.$queryRaw.mock.calls.find((c) => rendered(c).includes('array_agg'))!);
// Die einzelnen UND-Bedingungen des Filters, ohne die Basar-Bedingung am Anfang.
function whereParts(): string[] {
  const sql = pageQuery();
  const where = sql.slice(sql.indexOf('WHERE ') + 6, sql.indexOf('\n      ),'));
  return where.split(' AND ').map((p) => p.trim());
}

type PageRow = { key: string; ids: string[] };
function mockDb(page: PageRow[], summary = { bons: 0, articles: 0, total: 0 }) {
  prismaMock.$queryRaw.mockImplementation(async (...call: unknown[]) =>
    rendered(call).includes('array_agg') ? page : [summary],
  );
}

describe('GET /api/basars/[id]/transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb([]);
    prismaMock.sale.findMany.mockResolvedValue([]);
  });

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  // Ein Kassierer darf die Route aufrufen, sieht aber nur die eigenen Bons: cashierId wird
  // serverseitig erzwungen. Geprüft wird die Abfrage, nicht der Statuscode.
  it('Kassierer: Filter auf die eigene Nummer', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(91004) });
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect(whereParts()).toEqual(['s."basarId" = "basar-1"', 's."cashierId" = 91004']);
  });

  it('Kassierer: ein übergebener cashierId-Parameter wird überschrieben, nicht beachtet', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(91004) });
    for (const qs of ['?cashierId=1', '?cashierId=null']) {
      prismaMock.$queryRaw.mockClear();
      const res = await GET(makeRequest(qs), makeContext());
      expect(res.status).toBe(200);
      expect(whereParts(), qs).toEqual(['s."basarId" = "basar-1"', 's."cashierId" = 91004']);
    }
  });

  it('Kassierer ohne sellerId im Token: 403, keine Abfrage', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    cookiesGetMock.mockReturnValue({ value: jwt.sign({ role: 'employee', isCashier: true }, process.env.JWT_SECRET!) });
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(403);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('Kassierer in einem Testbasar ohne Einladung: 404, keine Abfrage', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(91004) });
    prismaMock.basar.findUnique.mockResolvedValue({ isTest: true });
    prismaMock.basarInvite.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(404);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    prismaMock.basar.findUnique.mockReset();
  });

  it('Admin ohne Parameter: nur der Basar-Filter (sieht alle Bons)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    await GET(makeRequest(), makeContext());
    expect(whereParts()).toEqual(['s."basarId" = "basar-1"']);
  });

  it('Admin: cashierId-Filter, auch „null“ für Verkäufe ohne Kassierer', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    await GET(makeRequest('?cashierId=7'), makeContext());
    expect(whereParts()).toContain('s."cashierId" = 7');
    prismaMock.$queryRaw.mockClear();
    await GET(makeRequest('?cashierId=null'), makeContext());
    expect(whereParts()).toContain('s."cashierId" IS NULL');
  });

  it('Admin: ungültige cashierId → 400 ohne Abfrage', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await GET(makeRequest('?cashierId=abc'), makeContext());
    expect(res.status).toBe(400);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('txId filtert auf clientTxId, zusätzlich zur Kassierernummer', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(91004) });
    await GET(makeRequest('?txId=abc'), makeContext());
    expect(whereParts()).toEqual(['s."basarId" = "basar-1"', 's."clientTxId" = "abc"', 's."cashierId" = 91004']);
  });

  it('summary kommt aus der Datenbank über alle Vorgänge, gerundet', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    mockDb([], { bons: 6150, articles: 9000, total: 12345.6700000001 });
    const data = await (await GET(makeRequest('?limit=1'), makeContext())).json();
    expect(data.summary).toEqual({ bons: 6150, articles: 9000, total: 12345.67 });
  });

  // Seitenschnitt: die Datenbank liefert limit+1 Vorgänge; der überzählige zeigt nur an,
  // dass es weitergeht, und wird weder geladen noch ausgeliefert.
  it('fragt limit+1 Vorgänge ab, lädt nur die der Seite und setzt nextCursor', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    mockDb([
      { key: 'tx-2', ids: ['s3'] },
      { key: 'tx-1', ids: ['s1', 's2'] },
    ]);
    prismaMock.sale.findMany.mockResolvedValue([
      { id: 's3', clientTxId: 'tx-2', cashierId: 42, salePrice: dec(2.5), soldAt: new Date('2026-08-16T11:00:00Z'), isCancelled: false, cashier, article: { title: 'C', sizeLabel: null, qrCode: 'QR3', basarSeller: seller } },
    ]);
    const data = await (await GET(makeRequest('?limit=1'), makeContext())).json();
    expect(pageQuery()).toContain('LIMIT 2');
    expect(prismaMock.sale.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['s3'] } });
    expect(data.transactions.map((t: { txId: string }) => t.txId)).toEqual(['tx-2']);
    expect(data.nextCursor).toBe('tx-2');
  });

  it('letzte Seite: nextCursor null', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    mockDb([{ key: 'tx-1', ids: ['s1'] }]);
    const data = await (await GET(makeRequest('?limit=1'), makeContext())).json();
    expect(data.nextCursor).toBeNull();
  });

  it('cursor wird als Parameter an die Datenbank gegeben, nicht im Speicher gesucht', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    await GET(makeRequest('?cursor=tx-9'), makeContext());
    expect(pageQuery()).toContain('WHERE "key" = "tx-9"');
    expect(pageQuery()).toContain('LIMIT 51');
  });

  it('Reihenfolge der Vorgänge folgt der Datenbank, nicht der Ladereihenfolge', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    mockDb([
      { key: 'tx-b', ids: ['s2'] },
      { key: 'tx-a', ids: ['s1'] },
    ]);
    prismaMock.sale.findMany.mockResolvedValue([
      { id: 's1', clientTxId: 'tx-a', cashierId: 42, salePrice: dec(1), soldAt: new Date('2026-08-16T10:00:00Z'), isCancelled: false, cashier, article: { title: 'A', sizeLabel: null, qrCode: 'QR1', basarSeller: seller } },
      { id: 's2', clientTxId: 'tx-b', cashierId: 42, salePrice: dec(1), soldAt: new Date('2026-08-16T10:00:00Z'), isCancelled: false, cashier, article: { title: 'B', sizeLabel: null, qrCode: 'QR2', basarSeller: seller } },
    ]);
    const data = await (await GET(makeRequest(), makeContext())).json();
    expect(data.transactions.map((t: { txId: string }) => t.txId)).toEqual(['tx-b', 'tx-a']);
  });

  it('total je Vorgang ist auf 2 Nachkommastellen gerundet (0,1 + 0,2)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    mockDb([{ key: 'tx-1', ids: ['s1', 's2'] }]);
    prismaMock.sale.findMany.mockResolvedValue([
      { id: 's2', clientTxId: 'tx-1', cashierId: 42, salePrice: dec(0.2), soldAt: new Date('2026-08-16T10:01:00Z'), isCancelled: false, cashier, article: { title: 'B', sizeLabel: null, qrCode: 'QR2', basarSeller: seller } },
      { id: 's1', clientTxId: 'tx-1', cashierId: 42, salePrice: dec(0.1), soldAt: new Date('2026-08-16T10:00:00Z'), isCancelled: false, cashier, article: { title: 'A', sizeLabel: null, qrCode: 'QR1', basarSeller: seller } },
    ]);
    const data = await (await GET(makeRequest(), makeContext())).json();
    expect(data.transactions[0].total).toBe(0.3);
    expect(data.transactions[0].soldAt).toBe('2026-08-16T10:00:00.000Z');
  });

  it('returns 403 für regulären Verkäufer', async () => {
    prismaMock.seller.findUnique.mockResolvedValueOnce({ isCashier: false });
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns 200 für Admin', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).transactions).toEqual([]);
  });

  it('returns 500 on DB error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.$queryRaw.mockRejectedValue(new Error('DB'));
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(500);
  });

  it('gruppiert Sales mit gleichem clientTxId zu einem Vorgang mit mehreren Positionen', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    mockDb([{ key: 'tx-1', ids: ['sale-1', 'sale-2'] }]);
    prismaMock.sale.findMany.mockResolvedValue([
      { id: 'sale-2', clientTxId: 'tx-1', cashierId: 42, salePrice: dec(2.5), soldAt: new Date('2026-08-16T10:01:00Z'), isCancelled: false, cashier, article: { title: 'Hose', sizeLabel: '104', qrCode: 'QR2', basarSeller: seller } },
      { id: 'sale-1', clientTxId: 'tx-1', cashierId: 42, salePrice: dec(3.0), soldAt: new Date('2026-08-16T10:00:00Z'), isCancelled: false, cashier, article: { title: 'Buch', sizeLabel: null, qrCode: 'QR1', basarSeller: seller } },
    ]);
    const data = await (await GET(makeRequest(), makeContext())).json();
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].txId).toBe('tx-1');
    expect(data.transactions[0].items).toHaveLength(2);
    expect(data.transactions[0].total).toBe(5.5);
  });

  it('behandelt zwei Sales mit clientTxId:null als zwei getrennte Vorgänge, nicht als einen', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    // Schlüssel aus der Datenbank: COALESCE(clientTxId, '__single__' || id).
    mockDb([
      { key: '__single__sale-2', ids: ['sale-2'] },
      { key: '__single__sale-1', ids: ['sale-1'] },
    ]);
    prismaMock.sale.findMany.mockResolvedValue([
      { id: 'sale-2', clientTxId: null, cashierId: null, salePrice: dec(3.0), soldAt: new Date('2026-08-16T10:01:00Z'), isCancelled: false, cashier: null, article: { title: 'B', sizeLabel: null, qrCode: 'QR2', basarSeller: seller } },
      { id: 'sale-1', clientTxId: null, cashierId: null, salePrice: dec(2.0), soldAt: new Date('2026-08-16T10:00:00Z'), isCancelled: false, cashier: null, article: { title: 'A', sizeLabel: null, qrCode: 'QR1', basarSeller: seller } },
    ]);
    const data = await (await GET(makeRequest(), makeContext())).json();
    expect(pageQuery()).toContain(`COALESCE(s."clientTxId", '__single__' || s."id")`);
    expect(data.transactions).toHaveLength(2);
    expect(data.transactions.every((t: { txId: string | null }) => t.txId === null)).toBe(true);
    expect(data.transactions[0].cashierName).toBe('Ohne Zuordnung');
  });

  it('total ignoriert stornierte Positionen, sie bleiben aber im items-Array', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    mockDb([{ key: 'tx-1', ids: ['sale-1', 'sale-2'] }]);
    prismaMock.sale.findMany.mockResolvedValue([
      { id: 'sale-2', clientTxId: 'tx-1', cashierId: 42, salePrice: dec(3.0), soldAt: new Date('2026-08-16T10:01:00Z'), isCancelled: false, cashier, article: { title: 'B', sizeLabel: null, qrCode: 'QR2', basarSeller: seller } },
      { id: 'sale-1', clientTxId: 'tx-1', cashierId: 42, salePrice: dec(2.0), soldAt: new Date('2026-08-16T10:00:00Z'), isCancelled: true, cashier, article: { title: 'A', sizeLabel: null, qrCode: 'QR1', basarSeller: seller } },
    ]);
    const data = await (await GET(makeRequest(), makeContext())).json();
    expect(data.transactions[0].items).toHaveLength(2);
    expect(data.transactions[0].total).toBe(3.0);
    const cancelledItem = data.transactions[0].items.find((i: { saleId: string }) => i.saleId === 'sale-1');
    expect(cancelledItem.isCancelled).toBe(true);
  });

  it('article durchsucht Titel, QR-Code, Größe und Verkäufername', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    await GET(makeRequest('?article=Hose'), makeContext());
    const parts = whereParts();
    expect(parts).toHaveLength(2);
    for (const col of ['a."title"', 'a."qrCode"', 'a."sizeLabel"', 'vs."firstName"', 'vs."lastName"']) {
      expect(parts[1]).toContain(`${col} ILIKE "%Hose%"`);
    }
    expect(parts[1]).not.toContain('sellerId');
  });

  it('article als Zahl durchsucht auch die Verkäufernummer', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    await GET(makeRequest('?article=1234'), makeContext());
    expect(whereParts()[1]).toContain('bs."sellerId" = 1234');
  });

  it('% und _ im Suchwort gelten wörtlich', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    await GET(makeRequest('?article=50%25_x'), makeContext());
    expect(whereParts()[1]).toContain(String.raw`a."title" ILIKE "%50\\%\\_x%"`);
  });

  // Mehrwortsuche: jedes Token muss irgendwo treffen (UND), nicht irgendeines (ODER) –
  // sonst liefert "jeans blau" jede blaue Jacke mit.
  it('verknüpft mehrere Suchwörter mit UND', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    await GET(makeRequest('?article=jeans%20blau'), makeContext());
    const parts = whereParts();
    expect(parts).toHaveLength(3);
    expect(parts[1]).toContain('a."title" ILIKE "%jeans%"');
    expect(parts[1]).not.toContain('blau');
    expect(parts[2]).toContain('a."title" ILIKE "%blau%"');
  });

  it('das Artikelfeld sucht nicht in Kassiererfeldern', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    await GET(makeRequest('?article=Anna'), makeContext());
    const part = whereParts()[1];
    expect(part).not.toContain('c."');
    expect(part).not.toContain('cashierId');
  });

  it('das Kassiererfeld sucht nicht in Artikelfeldern und trifft die Kassierernummer', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    await GET(makeRequest('?cashier=9004'), makeContext());
    const part = whereParts()[1];
    expect(part).not.toMatch(/\b(a|vs|bs)\."/);
    expect(part).toContain('c."firstName" ILIKE "%9004%"');
    expect(part).toContain('s."cashierId" = 9004');
  });

  // Der eigentliche Zweck der getrennten Felder: beide Filter müssen gleichzeitig gelten.
  // Mit dem früheren gemeinsamen Feld ging das nicht – dort musste jedes Wort irgendwo
  // treffen, sodass „hans jeans“ auch Jeans eines *Verkäufers* Hans fand, gescannt von
  // einem beliebigen Kassierer.
  it('verknüpft Artikel- und Kassiererfeld mit UND', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    await GET(makeRequest('?article=jeans&cashier=Hans'), makeContext());
    const parts = whereParts();
    expect(parts).toHaveLength(3);
    expect(parts[1]).toContain('a."title" ILIKE "%jeans%"');
    expect(parts[1]).not.toContain('c."');
    expect(parts[2]).toContain('c."firstName" ILIKE "%Hans%"');
    expect(parts[2]).not.toMatch(/\b(a|vs|bs)\."/);
  });

  it('Seitenabfrage und Summe nutzen denselben Filter', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    await GET(makeRequest('?article=jeans&cashier=Hans&cashierId=7'), makeContext());
    const [a, b] = prismaMock.$queryRaw.mock.calls.map(rendered);
    const filterOf = (sql: string) => sql.slice(sql.indexOf('f AS ('), sql.indexOf('g AS'));
    expect(filterOf(a)).toBe(filterOf(b));
  });

  it('löst Verkäufername/-nummer und Kassierername je Position korrekt auf', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    mockDb([{ key: '__single__sale-1', ids: ['sale-1'] }]);
    prismaMock.sale.findMany.mockResolvedValue([
      { id: 'sale-1', clientTxId: null, cashierId: 42, salePrice: dec(3.0), soldAt: new Date('2026-08-16T10:00:00Z'), isCancelled: false, cashier, article: { title: 'Buch', sizeLabel: null, qrCode: 'QR1', basarSeller: { sellerId: 4321, seller: { firstName: 'Lea', lastName: 'Beispiel' } } } },
    ]);
    const data = await (await GET(makeRequest(), makeContext())).json();
    expect(data.transactions[0].items[0]).toMatchObject({ sellerId: 4321, sellerName: 'Lea Beispiel' });
    expect(data.transactions[0].cashierName).toBe('Anna Kassiererin');
  });
});
