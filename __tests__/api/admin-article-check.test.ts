import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dec } from '../helpers/decimal';
import { adminToken, cashierToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  sellerArticle: { findUnique: vi.fn(), findMany: vi.fn() },
  article: { findMany: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET as getDetail } from '@/app/api/admin/article-check/[qrCode]/route';
import { GET as getList } from '@/app/api/admin/article-check/route';

const ctx = (qrCode: string) => ({ params: Promise.resolve({ qrCode }) });
const req = (qr: string) => new Request(`http://localhost/api/admin/article-check/${qr}`);

const seller = {
  sellerId: 1460, firstName: 'Max', lastName: 'Mustermann', email: 'max@example.com',
  isEmployee: false, isOrga: false, isCashier: false,
};

function occurrence(over: Record<string, unknown> = {}) {
  return {
    id: 'art-1', title: 'Winterjacke', sizeLabel: '116', gender: 'Junge', price: dec(8),
    status: 'SOLD', soldAt: new Date('2026-04-12T10:00:00Z'),
    basarSeller: { seller, basar: { id: 'b-1', title: 'Frühjahr 2026', status: 'CLOSED', isArchived: true } },
    sales: [{ salePrice: dec(6), soldAt: new Date('2026-04-12T10:00:00Z') }],
    ...over,
  };
}

describe('Etiketten-Check – Zugriff', () => {
  beforeEach(() => vi.clearAllMocks());

  // Nur der Admin: weder Kassierer noch Verkäufer dürfen fremde Verkäuferdaten abfragen.
  it.each([
    ['ohne Anmeldung', undefined, 401],
    ['als Verkäufer', { value: sellerToken(1460) }, 403],
    ['als Kassierer', { value: cashierToken(1460) }, 403],
  ])('verweigert die Detailabfrage %s', async (_name, cookie, status) => {
    cookiesGetMock.mockReturnValue(cookie);
    const res = await getDetail(req('KB-1'), ctx('KB-1'));
    expect(res.status).toBe(status);
    expect(prismaMock.article.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['ohne Anmeldung', undefined, 401],
    ['als Kassierer', { value: cashierToken(1460) }, 403],
  ])('verweigert die Suchliste %s', async (_name, cookie, status) => {
    cookiesGetMock.mockReturnValue(cookie);
    const res = await getList();
    expect(res.status).toBe(status);
    expect(prismaMock.sellerArticle.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/article-check/[qrCode]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesGetMock.mockReturnValue({ value: adminToken() });
  });

  // Der Unterschied zur Kasse: dort nur aktive Basare, hier jeder. Ein gemocktes Prisma
  // filtert nicht – belegt wird das über das where-Argument.
  it('sucht in allen Basaren, nicht nur im aktiven', async () => {
    prismaMock.sellerArticle.findUnique.mockResolvedValue(null);
    prismaMock.article.findMany.mockResolvedValue([occurrence()]);
    await getDetail(req('KB-1'), ctx('KB-1'));
    expect(prismaMock.article.findMany.mock.calls[0][0].where).toEqual({ qrCode: 'KB-1' });
    expect(prismaMock.sellerArticle.findUnique.mock.calls[0][0].where).toEqual({ qrCode: 'KB-1' });
  });

  it('liefert auch verkaufte Artikel aus geschlossenen Basaren, samt Verkaufspreis', async () => {
    prismaMock.sellerArticle.findUnique.mockResolvedValue(null);
    prismaMock.article.findMany.mockResolvedValue([occurrence()]);
    const res = await getDetail(req('KB-1'), ctx('KB-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.occurrences).toHaveLength(1);
    expect(body.occurrences[0]).toMatchObject({
      status: 'SOLD',
      price: 8,
      salePrice: 6,
      basar: { title: 'Frühjahr 2026', status: 'CLOSED', isArchived: true },
    });
    expect(body.seller).toEqual(seller);
  });

  it('nimmt die Etikettdaten aus dem Archiv, wenn vorhanden', async () => {
    prismaMock.sellerArticle.findUnique.mockResolvedValue({
      title: 'Winterjacke blau', sizeLabel: '116', gender: 'Junge', price: dec(7.5), seller,
    });
    prismaMock.article.findMany.mockResolvedValue([]);
    const body = await (await getDetail(req('KB-1'), ctx('KB-1'))).json();
    expect(body.archive).toEqual({ title: 'Winterjacke blau', sizeLabel: '116', gender: 'Junge', price: 7.5 });
    expect(body.occurrences).toEqual([]);
  });

  it('meldet 404 für einen Code, der zu keinem Artikel gehört', async () => {
    prismaMock.sellerArticle.findUnique.mockResolvedValue(null);
    prismaMock.article.findMany.mockResolvedValue([]);
    const res = await getDetail(req('irgendwas'), ctx('irgendwas'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Zu diesem Code gibt es keinen Artikel.');
  });

  it('berücksichtigt nur nicht stornierte Verkäufe', async () => {
    prismaMock.sellerArticle.findUnique.mockResolvedValue(null);
    prismaMock.article.findMany.mockResolvedValue([occurrence({ status: 'AVAILABLE', sales: [] })]);
    const body = await (await getDetail(req('KB-1'), ctx('KB-1'))).json();
    expect(prismaMock.article.findMany.mock.calls[0][0].select.sales.where).toEqual({ isCancelled: false });
    expect(body.occurrences[0].salePrice).toBeNull();
  });

  it('500 mit generischer Meldung bei Datenbankfehler', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    prismaMock.sellerArticle.findUnique.mockRejectedValue(new Error('db weg'));
    prismaMock.article.findMany.mockResolvedValue([]);
    const res = await getDetail(req('KB-1'), ctx('KB-1'));
    expect(res.status).toBe(500);
    expect(spy.mock.calls[0][0]).toMatch(/^GET \/api\/admin\/article-check\/\[qrCode\] error:/);
    spy.mockRestore();
  });
});

describe('GET /api/admin/article-check (Suchliste)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesGetMock.mockReturnValue({ value: adminToken() });
  });

  it('führt jeden QR-Code genau einmal, das Archiv geht vor', async () => {
    prismaMock.sellerArticle.findMany.mockResolvedValue([
      { qrCode: 'A', title: 'Archivtitel', sizeLabel: '116', price: dec(7.5), seller },
    ]);
    prismaMock.article.findMany.mockResolvedValue([
      { qrCode: 'A', title: 'Alter Basartitel', sizeLabel: '116', price: dec(8), basarSeller: { seller } },
      { qrCode: 'B', title: 'Nur im Basar', sizeLabel: null, price: dec(2), basarSeller: { seller } },
    ]);
    const body = await (await getList()).json();
    expect(body.articles).toEqual([
      { qrCode: 'A', title: 'Archivtitel', sizeLabel: '116', price: 7.5, sellerId: 1460, sellerName: 'Max Mustermann' },
      { qrCode: 'B', title: 'Nur im Basar', sizeLabel: undefined, price: 2, sellerId: 1460, sellerName: 'Max Mustermann' },
    ]);
  });

  it('liefert keinen Status – verkaufte Artikel sollen auffindbar bleiben', async () => {
    prismaMock.sellerArticle.findMany.mockResolvedValue([]);
    prismaMock.article.findMany.mockResolvedValue([
      { qrCode: 'B', title: 'Verkauft', sizeLabel: '98', price: dec(3), basarSeller: { seller } },
    ]);
    const body = await (await getList()).json();
    expect(body.articles[0]).not.toHaveProperty('status');
  });

  it('nimmt pro Code den jüngsten Basareintrag und lässt Archiveinträge ohne Code weg', async () => {
    prismaMock.sellerArticle.findMany.mockResolvedValue([]);
    prismaMock.article.findMany.mockResolvedValue([]);
    await getList();
    const args = prismaMock.article.findMany.mock.calls[0][0];
    expect(args.distinct).toEqual(['qrCode']);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(prismaMock.sellerArticle.findMany.mock.calls[0][0].where).toEqual({ qrCode: { not: null } });
  });
});
