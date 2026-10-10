import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dec } from '../helpers/decimal';
import { sellerToken, cashierToken, adminToken } from '../helpers/tokens';

// ─── next/headers mock ────────────────────────────────────────────────────────
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  article: { findFirst: vi.fn() },
  // Testbasar-Prüfung (app/lib/basarAccess.ts), nur mit ?basarId= aufgerufen.
  basar: { findUnique: vi.fn() },
  basarInvite: { findUnique: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/articles/scan/[qrCode]/route';

function makeRequest() {
  return new Request('http://localhost/api/articles/scan/QR_1234_Muster');
}

function makeContext(qrCode = 'QR_1234_Muster') {
  return { params: Promise.resolve({ qrCode }) };
}

const fakeArticle = {
  id: 'art-1', title: 'T-Shirt blau', sizeLabel: '104', price: dec(5.0), status: 'AVAILABLE', qrCode: 'QR_1234_Muster',
  basarSeller: {
    sellerId: 1234,
    seller: { firstName: 'Max', lastName: 'Muster', sellerId: 1234 },
    basar: { id: 'basar-1', title: 'Kinderbasar', status: 'ACTIVE' },
  },
};

describe('GET /api/articles/scan/[qrCode]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 403 for regular seller (non-cashier)', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns 404 when article not found in active basar', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(9999) });
    prismaMock.article.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 409 when article is already SOLD', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(9999) });
    prismaMock.article.findFirst.mockResolvedValue({ ...fakeArticle, status: 'SOLD' });
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(409);
  });

  it('returns article info for valid scan → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(9999) });
    prismaMock.article.findFirst.mockResolvedValue(fakeArticle);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('AVAILABLE');
    expect(json.sellerId).toBe(1234);
  });

  it('admin can also scan articles → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.article.findFirst.mockResolvedValue(fakeArticle);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(9999) });
    prismaMock.article.findFirst.mockRejectedValue(new Error('DB error'));
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});

// Derselbe QR-Code existiert in mehreren Basaren (Archiv-Übernahmen). Vorher suchte die Route in
// *jedem* aktiven Basar: liefen zwei gleichzeitig (Testbasar neben dem echten), konnte der Scan
// den Artikel aus dem falschen liefern – und die Kasse ihn dort verkaufen.
describe('GET /api/articles/scan/[qrCode] – nur im Basar der Kasse', () => {
  const mitBasar = (id = 'basar-1') => new Request(`http://localhost/api/articles/scan/QR_1234_Muster?basarId=${id}`);

  beforeEach(() => {
    vi.clearAllMocks();
    cookiesGetMock.mockReturnValue({ value: cashierToken(2000) });
    prismaMock.article.findFirst.mockResolvedValue(fakeArticle);
  });

  it('mit basarId: sucht ausschließlich in diesem Basar, und nur wenn er aktiv ist', async () => {
    prismaMock.basar.findUnique.mockResolvedValue({ isTest: false });
    const res = await GET(mitBasar(), makeContext());
    expect(res.status).toBe(200);
    // Ein gemocktes Prisma ignoriert where – ohne diese Prüfung bliebe der Test grün, auch
    // wenn die Route wieder in jedem aktiven Basar sucht.
    expect(prismaMock.article.findFirst.mock.calls[0][0].where).toEqual({
      qrCode: 'QR_1234_Muster',
      basarSeller: { basarId: 'basar-1', basar: { status: 'ACTIVE' } },
    });
  });

  it('ohne basarId (ältere App-Version im Cache): nur Basare, die der Kassierer sehen darf', async () => {
    await GET(makeRequest(), makeContext());
    expect(prismaMock.article.findFirst.mock.calls[0][0].where.basarSeller).toEqual({
      basar: { status: 'ACTIVE', OR: [{ isTest: false }, { invites: { some: { sellerId: 2000 } } }] },
    });
  });

  it('Testbasar ohne Einladung: 404, ohne nach dem Artikel zu suchen', async () => {
    prismaMock.basar.findUnique.mockResolvedValue({ isTest: true });
    prismaMock.basarInvite.findUnique.mockResolvedValue(null);
    const res = await GET(mitBasar('test-basar'), makeContext());
    expect(res.status).toBe(404);
    expect(prismaMock.article.findFirst).not.toHaveBeenCalled();
  });
});
