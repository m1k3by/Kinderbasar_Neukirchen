import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  article: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  basarSeller: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), upsert: vi.fn() },
  seller: { findUnique: vi.fn() },
  basar: { findUnique: vi.fn() },
  sellerArticle: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

// Interactive transaction: prisma.$transaction(async (tx) => {...}). The mocked tx client
// reuses the same model mocks as the top-level prismaMock (mirrors basars-id-sales.test.ts).
function mockTransactionSuccess() {
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
}

import { GET, POST } from '@/app/api/basars/[id]/articles/route';

function makeContext(id = 'basar-1') {
  return { params: Promise.resolve({ id }) };
}
function makeGetRequest() {
  return new Request('http://localhost/api/basars/basar-1/articles');
}
function makePostRequest(body: object) {
  return new Request('http://localhost/api/basars/basar-1/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const openBasar = { id: 'basar-1', status: 'OPEN', maxSellers: 100, maxArticlesPerSeller: 50 };
const fakeBasarSeller = { id: 'bs-1', basarId: 'basar-1', sellerId: 1234, maxArticlesOverride: null, isActive: true };

describe('GET /api/basars/[id]/articles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('admin: returns all articles', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.article.findMany.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.articles).toHaveLength(1);
  });

  it('seller: 401 when no sellerId in token', async () => {
    // Admin token has no sellerId - but we want role != admin
    // Use a custom token with no sellerId
    const jwt = await import('jsonwebtoken');
    const token = jwt.default.sign({ role: 'seller' }, process.env.JWT_SECRET!, { expiresIn: '1d' });
    cookiesGetMock.mockReturnValue({ value: token });
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('seller: returns empty when not in basar', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basarSeller.findUnique.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.articles).toEqual([]);
    expect(data.basarSeller).toBeNull();
  });

  it('seller: returns own articles', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basarSeller.findUnique.mockResolvedValue({ ...fakeBasarSeller, settlement: null });
    prismaMock.article.findMany.mockResolvedValue([{ id: 'art-1', title: 'Shirt' }]);
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.articles).toHaveLength(1);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.article.findMany.mockRejectedValue(new Error('DB'));
    const res = await GET(makeGetRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});

describe('POST /api/basars/[id]/articles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionSuccess();
    // Standardfall: noch keine Teilnahmezeile. clearAllMocks löscht nur die Aufrufe, nicht
    // die Implementierung – ohne diese Zeile wirkt das mockResolvedValue aus den GET-Tests
    // weiter und der Upsert-Pfad würde nie durchlaufen.
    prismaMock.basarSeller.findUnique.mockResolvedValue(null);
  });

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 403 for admin', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());
    expect(res.status).toBe(403);
  });

  it('lets a seller WITHOUT an active participation create articles', async () => {
    // Artikelanlage ist von der Teilnahme entkoppelt: Verkäufer dürfen ihre Artikel
    // vorbereiten, bevor sie sich anmelden. Früher gab es hier ein 403.
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue({ ...fakeBasarSeller, isActive: false });
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.sellerArticle.create.mockResolvedValue({ id: 'sa-1', title: 'T', qrCode: 'uuid-1' });
    prismaMock.article.create.mockResolvedValue({ id: 'art-1', title: 'T', qrCode: 'uuid-1', status: 'AVAILABLE' });

    const res = await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());

    expect(res.status).toBe(201);
    // Der Artikel hängt an genau der inaktiven Zeile – die Teilnahme wird nicht nebenbei aktiviert.
    expect(prismaMock.article.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ basarSellerId: 'bs-1', title: 'T' }) })
    );
  });

  it('never flips an existing participation while creating an article', async () => {
    // `update: {}` ist der Vertrag: eine vorhandene Zeile darf weder aktiviert noch
    // deaktiviert werden, nur gelesen. Ohne Argumentprüfung wäre das ungetestet, weil
    // das gemockte $transaction nichts ausführt.
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue({ ...fakeBasarSeller, isActive: false });
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.sellerArticle.create.mockResolvedValue({ id: 'sa-1', title: 'T', qrCode: 'uuid-1' });
    prismaMock.article.create.mockResolvedValue({ id: 'art-1', title: 'T', qrCode: 'uuid-1', status: 'AVAILABLE' });

    await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());

    expect(prismaMock.basarSeller.upsert).toHaveBeenCalledWith({
      where: { basarId_sellerId: { basarId: 'basar-1', sellerId: 1234 } },
      update: {},
      create: { basarId: 'basar-1', sellerId: 1234, isActive: false, activatedAt: null },
    });
  });

  it('writes nothing to BasarSeller when the participation row already exists', async () => {
    // Ab dem zweiten Artikel ist die Zeile schon da – dann entfällt der Upsert und die
    // Transaktion ist einen Roundtrip kürzer. Nebeneffekt: die Teilnahme kann dabei gar
    // nicht mehr versehentlich umgeschaltet werden, weil überhaupt nicht geschrieben wird.
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.findUnique.mockResolvedValue({ ...fakeBasarSeller, isActive: true });
    prismaMock.article.count.mockResolvedValue(3);
    prismaMock.sellerArticle.create.mockResolvedValue({ id: 'sa-1', title: 'T', qrCode: 'uuid-1' });
    prismaMock.article.create.mockResolvedValue({ id: 'art-1', title: 'T', qrCode: 'uuid-1', status: 'AVAILABLE' });

    const res = await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());

    expect(res.status).toBe(201);
    expect(prismaMock.basarSeller.upsert).not.toHaveBeenCalled();
    expect(prismaMock.article.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ basarSellerId: 'bs-1' }) })
    );
  });

  it('returns 404 when basar not found', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(null);
    const res = await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 400 when basar not OPEN', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue({ ...openBasar, status: 'DRAFT' });
    const res = await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());
    expect(res.status).toBe(400);
  });

  it('does NOT apply the maxSellers limit to article creation', async () => {
    // Eine inaktive BasarSeller-Zeile belegt keinen Teilnehmerplatz, deshalb darf ein
    // ausgebuchter Basar das Anlegen von Artikeln nicht blockieren. Der Platz wird
    // ausschließlich in PUT /api/basars/[id]/participation vergeben und dort limitiert.
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.count.mockResolvedValue(100); // equals maxSellers
    prismaMock.basarSeller.upsert.mockResolvedValue({ ...fakeBasarSeller, isActive: false });
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.sellerArticle.create.mockResolvedValue({ id: 'sa-1', title: 'T', qrCode: 'uuid-1' });
    prismaMock.article.create.mockResolvedValue({ id: 'art-1', title: 'T', qrCode: 'uuid-1', status: 'AVAILABLE' });

    const res = await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());

    expect(res.status).toBe(201);
  });

  it('returns 400 when article limit reached', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(50); // equals maxArticlesPerSeller
    const res = await POST(makePostRequest({ title: 'T', price: 1 }), makeContext());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Artikelanzahl/i);
  });

  it('returns 400 when title missing', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(0);
    const res = await POST(makePostRequest({ price: 2 }), makeContext());
    expect(res.status).toBe(400);
  });

  it('returns 400 when price is 0 or negative', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(0);
    const res = await POST(makePostRequest({ title: 'Shirt', price: 0 }), makeContext());
    expect(res.status).toBe(400);
  });

  it('creates article successfully → 201', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(5);
    prismaMock.sellerArticle.create.mockResolvedValue({ id: 'sa-1', title: 'Shirt', qrCode: 'uuid-1' });
    prismaMock.article.create.mockResolvedValue({ id: 'art-1', title: 'Shirt', qrCode: 'uuid-1', status: 'AVAILABLE' });
    const res = await POST(makePostRequest({ title: 'Shirt', price: 3.5, sizeLabel: '80', gender: 'Mädchen' }), makeContext());
    expect(res.status).toBe(201);
    expect((await res.json()).article.title).toBe('Shirt');
  });

  it('the whole get-or-create + limit checks + writes run inside one transaction', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.sellerArticle.create.mockResolvedValue({ id: 'sa-1', title: 'Shirt', qrCode: 'uuid-1' });
    prismaMock.article.create.mockResolvedValue({ id: 'art-1', title: 'Shirt', qrCode: 'uuid-1', status: 'AVAILABLE' });
    await POST(makePostRequest({ title: 'Shirt', price: 3.5 }), makeContext());
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('creates a new basarSeller via upsert (not create) and leaves it INACTIVE', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue({ ...fakeBasarSeller, isActive: false });
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.sellerArticle.create.mockResolvedValue({ id: 'sa-1', title: 'Shirt', qrCode: 'uuid-1' });
    prismaMock.article.create.mockResolvedValue({ id: 'art-1', title: 'Shirt', qrCode: 'uuid-1', status: 'AVAILABLE' });

    const res = await POST(makePostRequest({ title: 'Shirt', price: 3.5 }), makeContext());

    expect(res.status).toBe(201);
    expect(prismaMock.basarSeller.create).not.toHaveBeenCalled();
    // isActive: false ist der Kern der Entkopplung – ein Artikel anzulegen darf keine
    // Teilnahme und damit keinen Teilnehmerplatz erzeugen.
    expect(prismaMock.basarSeller.upsert).toHaveBeenCalledWith({
      where: { basarId_sellerId: { basarId: 'basar-1', sellerId: 1234 } },
      update: {},
      create: { basarId: 'basar-1', sellerId: 1234, isActive: false, activatedAt: null },
    });
  });

  it('upsert keeps working across repeated calls (double-click / two tabs)', async () => {
    // Simulates the race the upsert fixes: two concurrent requests both want to create the
    // BasarSeller row. A real Postgres upsert never throws P2002 here (unlike the old
    // find-then-create), so both calls succeed.
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.upsert.mockResolvedValue(fakeBasarSeller);
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.sellerArticle.create.mockResolvedValue({ id: 'sa-1', title: 'Shirt', qrCode: 'uuid-1' });
    prismaMock.article.create.mockResolvedValue({ id: 'art-1', title: 'Shirt', qrCode: 'uuid-1', status: 'AVAILABLE' });

    const res1 = await POST(makePostRequest({ title: 'Shirt 1', price: 1 }), makeContext());
    const res2 = await POST(makePostRequest({ title: 'Shirt 2', price: 1 }), makeContext());

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(prismaMock.basarSeller.upsert).toHaveBeenCalledTimes(2);
  });
});
