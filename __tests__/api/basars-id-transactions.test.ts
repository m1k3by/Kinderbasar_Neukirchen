import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken, cashierToken } from '../helpers/tokens';
import { dec } from '../helpers/decimal';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
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

describe('GET /api/basars/[id]/transactions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  // Ein Kassierer darf die Route aufrufen, sieht aber nur die eigenen Bons: cashierId wird
  // serverseitig erzwungen. Geprüft wird das Argument von findMany, nicht der Statuscode.
  it('Kassierer: where.cashierId ist die eigene Nummer', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(91004) });
    prismaMock.sale.findMany.mockResolvedValue([]);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect(prismaMock.sale.findMany.mock.calls[0][0].where.cashierId).toBe(91004);
  });

  it('Kassierer: ein übergebener cashierId-Parameter wird überschrieben, nicht beachtet', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(91004) });
    prismaMock.sale.findMany.mockResolvedValue([]);
    for (const qs of ['?cashierId=1', '?cashierId=null']) {
      prismaMock.sale.findMany.mockClear();
      const res = await GET(makeRequest(qs), makeContext());
      expect(res.status).toBe(200);
      expect(prismaMock.sale.findMany.mock.calls[0][0].where.cashierId, qs).toBe(91004);
    }
  });

  it('Kassierer ohne sellerId im Token: 403, keine Abfrage', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    cookiesGetMock.mockReturnValue({ value: jwt.sign({ role: 'employee', isCashier: true }, process.env.JWT_SECRET!) });
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(403);
    expect(prismaMock.sale.findMany).not.toHaveBeenCalled();
  });

  it('Kassierer in einem Testbasar ohne Einladung: 404, keine Abfrage', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(91004) });
    prismaMock.basar.findUnique.mockResolvedValue({ isTest: true });
    prismaMock.basarInvite.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(404);
    expect(prismaMock.sale.findMany).not.toHaveBeenCalled();
    prismaMock.basar.findUnique.mockReset();
  });

  it('Admin ohne Parameter: kein cashierId im where (sieht alle Bons)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([]);
    await GET(makeRequest(), makeContext());
    expect(prismaMock.sale.findMany.mock.calls[0][0].where).not.toHaveProperty('cashierId');
  });

  it('Admin: cashierId-Filter wirkt weiterhin', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([]);
    await GET(makeRequest('?cashierId=7'), makeContext());
    expect(prismaMock.sale.findMany.mock.calls[0][0].where.cashierId).toBe(7);
  });

  it('txId setzt where.clientTxId', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(91004) });
    prismaMock.sale.findMany.mockResolvedValue([]);
    await GET(makeRequest('?txId=abc'), makeContext());
    const where = prismaMock.sale.findMany.mock.calls[0][0].where;
    expect(where.clientTxId).toBe('abc');
    expect(where.cashierId).toBe(91004);
  });

  it('ohne txId kein clientTxId im where', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([]);
    await GET(makeRequest(), makeContext());
    expect(prismaMock.sale.findMany.mock.calls[0][0].where).not.toHaveProperty('clientTxId');
  });

  // summary rechnet über alle Vorgänge, nicht nur über die Seite, und lässt Stornos weg.
  // salePrice als dec(): Number() muss greifen, sonst entstünde "02.53"-Verkettung.
  it('summary: Bons, Artikel und Summe ohne stornierte Positionen, über alle Vorgänge', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([
      {
        id: 's3', clientTxId: 'tx-2', cashierId: 42, salePrice: dec(2.5),
        soldAt: new Date('2026-08-16T11:00:00Z'), isCancelled: false, cashier,
        article: { title: 'C', sizeLabel: null, qrCode: 'QR3', basarSeller: seller },
      },
      {
        id: 's2', clientTxId: 'tx-1', cashierId: 42, salePrice: dec(3.0),
        soldAt: new Date('2026-08-16T10:01:00Z'), isCancelled: true, cashier,
        article: { title: 'B', sizeLabel: null, qrCode: 'QR2', basarSeller: seller },
      },
      {
        id: 's1', clientTxId: 'tx-1', cashierId: 42, salePrice: dec(0.1),
        soldAt: new Date('2026-08-16T10:00:00Z'), isCancelled: false, cashier,
        article: { title: 'A', sizeLabel: null, qrCode: 'QR1', basarSeller: seller },
      },
    ]);

    // limit=1: die Seite enthält nur einen Vorgang, summary muss trotzdem beide zählen.
    const data = await (await GET(makeRequest('?limit=1'), makeContext())).json();
    expect(data.transactions).toHaveLength(1);
    expect(data.nextCursor).not.toBeNull();
    expect(data.summary).toEqual({ bons: 2, articles: 2, total: 2.6 });
  });

  it('total je Vorgang ist auf 2 Nachkommastellen gerundet (0,1 + 0,2)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([
      {
        id: 's2', clientTxId: 'tx-1', cashierId: 42, salePrice: dec(0.2),
        soldAt: new Date('2026-08-16T10:01:00Z'), isCancelled: false, cashier,
        article: { title: 'B', sizeLabel: null, qrCode: 'QR2', basarSeller: seller },
      },
      {
        id: 's1', clientTxId: 'tx-1', cashierId: 42, salePrice: dec(0.1),
        soldAt: new Date('2026-08-16T10:00:00Z'), isCancelled: false, cashier,
        article: { title: 'A', sizeLabel: null, qrCode: 'QR1', basarSeller: seller },
      },
    ]);
    const data = await (await GET(makeRequest(), makeContext())).json();
    expect(data.transactions[0].total).toBe(0.3);
    expect(data.summary.total).toBe(0.3);
  });

  it('returns 403 für regulären Verkäufer', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns 200 für Admin', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([]);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).transactions).toEqual([]);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockRejectedValue(new Error('DB'));
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(500);
  });

  it('gruppiert Sales mit gleichem clientTxId zu einem Vorgang mit mehreren Positionen', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([
      {
        id: 'sale-2', clientTxId: 'tx-1', cashierId: 42, salePrice: dec(2.5),
        soldAt: new Date('2026-08-16T10:01:00Z'), isCancelled: false, cashier,
        article: { title: 'Hose', sizeLabel: '104', qrCode: 'QR2', basarSeller: seller },
      },
      {
        id: 'sale-1', clientTxId: 'tx-1', cashierId: 42, salePrice: dec(3.0),
        soldAt: new Date('2026-08-16T10:00:00Z'), isCancelled: false, cashier,
        article: { title: 'Buch', sizeLabel: null, qrCode: 'QR1', basarSeller: seller },
      },
    ]);

    const res = await GET(makeRequest(), makeContext());
    const data = await res.json();

    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].txId).toBe('tx-1');
    expect(data.transactions[0].items).toHaveLength(2);
    expect(data.transactions[0].total).toBe(5.5);
  });

  it('behandelt zwei Sales mit clientTxId:null als zwei getrennte Vorgänge, nicht als einen', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([
      {
        id: 'sale-2', clientTxId: null, cashierId: null, salePrice: dec(3.0),
        soldAt: new Date('2026-08-16T10:01:00Z'), isCancelled: false, cashier: null,
        article: { title: 'B', sizeLabel: null, qrCode: 'QR2', basarSeller: seller },
      },
      {
        id: 'sale-1', clientTxId: null, cashierId: null, salePrice: dec(2.0),
        soldAt: new Date('2026-08-16T10:00:00Z'), isCancelled: false, cashier: null,
        article: { title: 'A', sizeLabel: null, qrCode: 'QR1', basarSeller: seller },
      },
    ]);

    const res = await GET(makeRequest(), makeContext());
    const data = await res.json();

    expect(data.transactions).toHaveLength(2);
    expect(data.transactions.every((t: { txId: string | null }) => t.txId === null)).toBe(true);
    expect(data.transactions[0].cashierName).toBe('Ohne Zuordnung');
  });

  it('total ignoriert stornierte Positionen, sie bleiben aber im items-Array', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([
      {
        id: 'sale-2', clientTxId: 'tx-1', cashierId: 42, salePrice: dec(3.0),
        soldAt: new Date('2026-08-16T10:01:00Z'), isCancelled: false, cashier,
        article: { title: 'B', sizeLabel: null, qrCode: 'QR2', basarSeller: seller },
      },
      {
        id: 'sale-1', clientTxId: 'tx-1', cashierId: 42, salePrice: dec(2.0),
        soldAt: new Date('2026-08-16T10:00:00Z'), isCancelled: true, cashier,
        article: { title: 'A', sizeLabel: null, qrCode: 'QR1', basarSeller: seller },
      },
    ]);

    const res = await GET(makeRequest(), makeContext());
    const data = await res.json();

    expect(data.transactions[0].items).toHaveLength(2);
    expect(data.transactions[0].total).toBe(3.0);
    const cancelledItem = data.transactions[0].items.find((i: { saleId: string }) => i.saleId === 'sale-1');
    expect(cancelledItem.isCancelled).toBe(true);
  });

  it('article durchsucht den Artikeltitel', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([]);

    await GET(makeRequest('?article=Hose'), makeContext());

    const args = prismaMock.sale.findMany.mock.calls[0][0];
    expect(args.where.AND).toHaveLength(1);
    expect(args.where.AND[0].OR).toEqual(
      expect.arrayContaining([{ article: { title: { contains: 'Hose', mode: 'insensitive' } } }])
    );
  });

  it('article als Zahl durchsucht auch die Verkäufernummer', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([]);

    await GET(makeRequest('?article=1234'), makeContext());

    const args = prismaMock.sale.findMany.mock.calls[0][0];
    expect(args.where.AND[0].OR).toEqual(
      expect.arrayContaining([{ article: { basarSeller: { sellerId: { equals: 1234 } } } }])
    );
  });

  // Mehrwortsuche: jedes Token muss irgendwo treffen (UND), nicht irgendeines (ODER) –
  // sonst liefert "jeans blau" jede blaue Jacke mit.
  it('verknüpft mehrere Suchwörter mit UND', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([]);

    await GET(makeRequest('?article=jeans%20blau'), makeContext());

    const args = prismaMock.sale.findMany.mock.calls[0][0];
    expect(args.where.AND).toHaveLength(2);
    expect(args.where.AND[0].OR).toEqual(
      expect.arrayContaining([{ article: { title: { contains: 'jeans', mode: 'insensitive' } } }])
    );
    expect(args.where.AND[1].OR).toEqual(
      expect.arrayContaining([{ article: { title: { contains: 'blau', mode: 'insensitive' } } }])
    );
  });

  it('das Artikelfeld sucht nicht in Kassiererfeldern', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([]);

    await GET(makeRequest('?article=Anna'), makeContext());

    const or = prismaMock.sale.findMany.mock.calls[0][0].where.AND[0].OR;
    expect(JSON.stringify(or)).not.toContain('cashier');
    expect(or).toEqual(
      expect.arrayContaining([{ article: { sizeLabel: { contains: 'Anna', mode: 'insensitive' } } }])
    );
  });

  it('das Kassiererfeld sucht nicht in Artikelfeldern und trifft die Kassierernummer', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([]);

    await GET(makeRequest('?cashier=9004'), makeContext());

    const or = prismaMock.sale.findMany.mock.calls[0][0].where.AND[0].OR;
    expect(JSON.stringify(or)).not.toContain('article');
    expect(or).toEqual(expect.arrayContaining([{ cashierId: { equals: 9004 } }]));
  });

  // Der eigentliche Zweck der getrennten Felder: beide Filter müssen gleichzeitig gelten.
  // Mit dem früheren gemeinsamen Feld ging das nicht – dort musste jedes Wort irgendwo
  // treffen, sodass „hans jeans“ auch Jeans eines *Verkäufers* Hans fand, gescannt von
  // einem beliebigen Kassierer.
  it('verknüpft Artikel- und Kassiererfeld mit UND', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([]);

    await GET(makeRequest('?article=jeans&cashier=Hans'), makeContext());

    const and = prismaMock.sale.findMany.mock.calls[0][0].where.AND;
    expect(and).toHaveLength(2);
    // Die Artikelbedingung darf keine Kassiererfelder enthalten und umgekehrt – sonst
    // wäre die Zuordnung wieder unscharf.
    expect(JSON.stringify(and[0])).not.toContain('cashier');
    expect(and[0].OR).toEqual(
      expect.arrayContaining([{ article: { title: { contains: 'jeans', mode: 'insensitive' } } }])
    );
    expect(JSON.stringify(and[1])).not.toContain('article');
    expect(and[1].OR).toEqual(
      expect.arrayContaining([{ cashier: { firstName: { contains: 'Hans', mode: 'insensitive' } } }])
    );
  });

  it('sucht ohne Suchfelder gar nicht (keine AND-Bedingung)', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([]);

    await GET(makeRequest(''), makeContext());

    expect(prismaMock.sale.findMany.mock.calls[0][0].where.AND).toBeUndefined();
  });

  it('löst Verkäufername/-nummer und Kassierername je Position korrekt auf', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1', clientTxId: null, cashierId: 42, salePrice: dec(3.0),
        soldAt: new Date('2026-08-16T10:00:00Z'), isCancelled: false, cashier,
        article: { title: 'Buch', sizeLabel: null, qrCode: 'QR1', basarSeller: { sellerId: 4321, seller: { firstName: 'Lea', lastName: 'Beispiel' } } },
      },
    ]);

    const res = await GET(makeRequest(), makeContext());
    const data = await res.json();

    expect(data.transactions[0].items[0]).toMatchObject({ sellerId: 4321, sellerName: 'Lea Beispiel' });
    expect(data.transactions[0].cashierName).toBe('Anna Kassiererin');
  });
});
