import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken, cashierToken } from '../helpers/tokens';
import { dec } from '../helpers/decimal';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  sale: { findMany: vi.fn() },
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

  // Zentrale Zusage der Aufgabe: nur Admins dürfen die Kassenvorgänge einsehen. Ein
  // Kassierer ist zwar berechtigt zu kassieren (requireCashier würde ihn durchlassen),
  // hier aber ausdrücklich nicht.
  it('returns 403 für Kassierer ohne Admin-Rolle', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(5555) });
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(403);
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
