import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { adminToken, sellerToken, badToken } from '../helpers/tokens';

// ─── next/headers mock ────────────────────────────────────────────────────────
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  seller: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { PUT } from '@/app/api/me/role/route';

function makeRequest(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

/** Rolle und isEmployee aus dem neu gesetzten token-Cookie der Antwort. */
function tokenFrom(res: Awaited<ReturnType<typeof PUT>>) {
  const cookie = res.cookies.get('token');
  expect(cookie, 'kein token-Cookie in der Antwort').toBeTruthy();
  return jwt.verify(cookie!.value, process.env.JWT_SECRET!) as Record<string, unknown>;
}

describe('PUT /api/me/role', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lehnt ohne Token ab', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    expect((await PUT(makeRequest({ isEmployee: true }))).status).toBe(401);
  });

  it('lehnt ein kaputtes Token ab', async () => {
    cookiesGetMock.mockReturnValue({ value: badToken() });
    expect((await PUT(makeRequest({ isEmployee: true }))).status).toBe(401);
  });

  it('lehnt den Admin ab – er hat keine eigene Verkäuferzeile', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await PUT(makeRequest({ isEmployee: true }));
    expect(res.status).toBe(403);
    expect(prismaMock.seller.update).not.toHaveBeenCalled();
  });

  it.each([[undefined], ['ja'], [1], [null]])('lehnt isEmployee=%s ab', async (value) => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1460) });
    const res = await PUT(makeRequest({ isEmployee: value }));
    expect(res.status).toBe(400);
    expect(prismaMock.seller.update).not.toHaveBeenCalled();
  });

  it('antwortet 404, wenn die Zeile fehlt', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1460) });
    prismaMock.seller.findUnique.mockResolvedValue(null);
    const res = await PUT(makeRequest({ isEmployee: true }));
    expect(res.status).toBe(404);
    expect(prismaMock.seller.update).not.toHaveBeenCalled();
  });

  it('macht den Verkäufer zum Mitarbeiter und rührt isOrga nicht an', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1460) });
    prismaMock.seller.findUnique.mockResolvedValue({ isOrga: false, isCashier: false });
    prismaMock.seller.update.mockResolvedValue({ isEmployee: true, isOrga: false });

    const res = await PUT(makeRequest({ isEmployee: true }));
    expect(res.status).toBe(200);

    // Heraufstufen darf isOrga NICHT mitsetzen – sonst gäbe sich jeder über
    // "abgeben und neu holen" selbst das unbegrenzte Artikellimit.
    expect(prismaMock.seller.update).toHaveBeenCalledWith({
      where: { sellerId: 1460 },
      data: { isEmployee: true },
    });
    expect(await res.json()).toMatchObject({ isEmployee: true, orgaRemoved: false });
  });

  it('stuft zurück und entfernt dabei das Orga-Kennzeichen', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1460, { isEmployee: true }) });
    prismaMock.seller.findUnique.mockResolvedValue({ isOrga: true, isCashier: false });
    prismaMock.seller.update.mockResolvedValue({ isEmployee: false, isOrga: false });

    const res = await PUT(makeRequest({ isEmployee: false }));
    expect(res.status).toBe(200);
    expect(prismaMock.seller.update).toHaveBeenCalledWith({
      where: { sellerId: 1460 },
      data: { isEmployee: false, isOrga: false },
    });
    expect(await res.json()).toMatchObject({ isEmployee: false, orgaRemoved: true });
  });

  it('nimmt die sellerId aus dem Token, nicht aus dem Body', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1460) });
    prismaMock.seller.findUnique.mockResolvedValue({ isOrga: false, isCashier: false });
    prismaMock.seller.update.mockResolvedValue({ isEmployee: true, isOrga: false });

    await PUT(makeRequest({ isEmployee: true, sellerId: 9999 }));

    expect(prismaMock.seller.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sellerId: 1460 } })
    );
    expect(prismaMock.seller.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sellerId: 1460 } })
    );
  });

  it('stellt das Token mit der neuen Rolle neu aus', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1460) });
    prismaMock.seller.findUnique.mockResolvedValue({ isOrga: false, isCashier: false });
    prismaMock.seller.update.mockResolvedValue({ isEmployee: true, isOrga: false });

    const payload = tokenFrom(await PUT(makeRequest({ isEmployee: true })));
    expect(payload).toMatchObject({ sellerId: 1460, role: 'employee', isEmployee: true });
  });

  it('behält isCashier aus der Datenbank im neuen Token', async () => {
    // Das alte Token sagt isCashier: false, die Datenbank sagt true. Würde das Token aus
    // dem alten Token fortgeschrieben, verlöre ein Kassierer beim Rollenwechsel still
    // seinen Kassenzugang.
    cookiesGetMock.mockReturnValue({ value: sellerToken(1460, { isEmployee: true }) });
    prismaMock.seller.findUnique.mockResolvedValue({ isOrga: false, isCashier: true });
    prismaMock.seller.update.mockResolvedValue({ isEmployee: false, isOrga: false });

    const payload = tokenFrom(await PUT(makeRequest({ isEmployee: false })));
    expect(payload).toMatchObject({ role: 'seller', isEmployee: false, isCashier: true });
  });
});
