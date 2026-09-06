import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  basar: { findUnique: vi.fn() },
  article: { findUnique: vi.fn(), delete: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  sellerArticle: { delete: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

// Interaktive Transaktion: der gemockte tx-Client benutzt dieselben Modell-Mocks.
// Ohne diese Nachbildung würde der Rumpf gar nicht laufen und der fachliche Inhalt
// ungeprüft bleiben (CLAUDE.md, Testregel 3).
function mockTransaction() {
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)
  );
}

import { DELETE } from '@/app/api/basars/[id]/articles/[artId]/route';

function makeContext(id = 'basar-1', artId = 'art-1') {
  return { params: Promise.resolve({ id, artId }) };
}
function makeRequest() {
  return new Request('http://localhost/api/basars/basar-1/articles/art-1', { method: 'DELETE' });
}

const openBasar = { id: 'basar-1', status: 'OPEN' };
const fakeArticle = { id: 'art-1', sellerArticleId: 'sa-1', basarSeller: { sellerId: 1234 } };

describe('DELETE /api/basars/[id]/articles/[artId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction();
  });

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 404 when basar not found', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(null);
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 400 when basar is ACTIVE', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'basar-1', status: 'ACTIVE' });
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(400);
  });

  it('returns 400 when basar is CLOSED', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue({ id: 'basar-1', status: 'CLOSED' });
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(400);
  });

  it('returns 404 when article not found', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.article.findUnique.mockResolvedValue(null);
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 403 when seller does not own article', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(9999) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.article.findUnique.mockResolvedValue(fakeArticle); // owned by 1234
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(403);
  });

  it('deletes article successfully for owner', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.article.findUnique.mockResolvedValue(fakeArticle);
    prismaMock.article.delete.mockResolvedValue({ id: 'art-1' });
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('admin can delete any article', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.article.findUnique.mockResolvedValue(fakeArticle);
    prismaMock.article.delete.mockResolvedValue({ id: 'art-1' });
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockRejectedValue(new Error('DB'));
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});

// ─── Archiveintrag ───────────────────────────────────────────────────────────
// Gemeldet am 06.09.2026: „wenn ich einen Artikel lösche, erscheint er wieder im Archiv".
// Ursache: gelöscht wurde nur der Article, der SellerArticle blieb – und weil
// GET /api/seller-articles das Feld alreadyInBasar live aus den vorhandenen Artikeln
// berechnet, stand der eben gelöschte Artikel sofort wieder auf der Übernahmeliste.
//
// Der Statuscode allein sagt darüber nichts: 200 kam vorher auch. Geprüft wird deshalb,
// ob der Archiveintrag tatsächlich gelöscht wird – und ob er stehen bleibt, wenn er noch
// Artikel aus anderen Basaren trägt.
describe('DELETE /api/basars/[id]/articles/[artId] – Archiveintrag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction();
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.article.findUnique.mockResolvedValue(fakeArticle);
    prismaMock.article.delete.mockResolvedValue({ id: 'art-1' });
    prismaMock.sellerArticle.delete.mockResolvedValue({ id: 'sa-1' });
    prismaMock.article.updateMany.mockResolvedValue({ count: 0 });
  });

  it('löscht den Archiveintrag mit, wenn nichts davon verkauft wurde', async () => {
    prismaMock.article.count.mockResolvedValue(0);

    const res = await DELETE(makeRequest(), makeContext());

    expect(res.status).toBe(200);
    expect(prismaMock.article.delete).toHaveBeenCalledWith({ where: { id: 'art-1' } });
    expect(prismaMock.sellerArticle.delete).toHaveBeenCalledWith({ where: { id: 'sa-1' } });
  });

  it('zählt verkaufte Artikel an genau diesem Archiveintrag – nicht alle', async () => {
    // Der Unterschied, an dem die erste Fassung scheiterte: ohne status SOLD zählen auch
    // AVAILABLE-Reste aus archivierten Basaren mit, und der Eintrag überlebt jedes Löschen.
    prismaMock.article.count.mockResolvedValue(0);
    await DELETE(makeRequest(), makeContext());
    expect(prismaMock.article.count).toHaveBeenCalledWith({
      where: { sellerArticleId: 'sa-1', status: 'SOLD' },
    });
  });

  it('hängt die verbleibenden Artikel ab, bevor der Eintrag gelöscht wird', async () => {
    // Sonst hinge das Löschen an einem Fremdschlüsselverhalten, das im Prisma-Schema gar
    // nicht steht (dort fehlt onDelete; in der Datenbank ist es SET NULL).
    prismaMock.article.count.mockResolvedValue(0);
    await DELETE(makeRequest(), makeContext());
    expect(prismaMock.article.updateMany).toHaveBeenCalledWith({
      where: { sellerArticleId: 'sa-1' },
      data: { sellerArticleId: null },
    });
  });

  it('behält den Archiveintrag, wenn ein verknüpfter Artikel verkauft wurde', async () => {
    // Historie: ein verkaufter Artikel macht den Eintrag dauerhaft unübernehmbar
    // (CLAUDE.md, soldPreviously) – der darf beim Aufräumen nicht verschwinden.
    prismaMock.article.count.mockResolvedValue(1);

    const res = await DELETE(makeRequest(), makeContext());

    expect(res.status).toBe(200);
    expect(prismaMock.article.delete).toHaveBeenCalled();
    expect(prismaMock.sellerArticle.delete).not.toHaveBeenCalled();
    expect(prismaMock.article.updateMany).not.toHaveBeenCalled();
  });

  it('kommt ohne Archiveintrag zurecht', async () => {
    // sellerArticleId ist null, sobald jemand den Eintrag über
    // DELETE /api/seller-articles entfernt hat – die Route hängt die Artikel dort ab.
    prismaMock.article.findUnique.mockResolvedValue({ ...fakeArticle, sellerArticleId: null });

    const res = await DELETE(makeRequest(), makeContext());

    expect(res.status).toBe(200);
    expect(prismaMock.article.count).not.toHaveBeenCalled();
    expect(prismaMock.sellerArticle.delete).not.toHaveBeenCalled();
  });

  it('löscht beides in einer Transaktion', async () => {
    // Ohne Transaktion könnte zwischen Löschen und Zählen eine parallele Übernahme in
    // einen anderen Basar durchrutschen – der Archiveintrag fiele ihr unter den Füßen weg.
    prismaMock.article.count.mockResolvedValue(0);
    await DELETE(makeRequest(), makeContext());
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
