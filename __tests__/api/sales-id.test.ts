import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken, cashierToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const articleUpdateMock = vi.hoisted(() => vi.fn());
const saleUpdateMock = vi.hoisted(() => vi.fn());
const settlementFindUniqueMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  sale: {
    findUnique: vi.fn(),
    update: saleUpdateMock,
  },
  article: {
    update: articleUpdateMock,
  },
  settlement: {
    findUnique: settlementFindUniqueMock,
  },
  $transaction: vi.fn(),
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

// Zeilen, die den Storno-Check bis zur Settlement-Prüfung durchlaufen, brauchen die
// article-Relation (basarSellerId) aus dem include – ohne sie würde sale.article.basarSellerId
// mit TypeError durchfallen. Default: keine Abrechnung vorhanden, Storno also nicht blockiert.
function mockSale(overrides: Partial<{ id: string; isCancelled: boolean; soldAt: Date; articleId: string }> = {}) {
  return {
    id: 'sale-1',
    isCancelled: false,
    soldAt: new Date(),
    articleId: 'art-1',
    article: { basarSellerId: 'bs-1' },
    ...overrides,
  };
}

import { DELETE } from '@/app/api/sales/[id]/route';

function makeContext(id = 'sale-1') {
  return { params: Promise.resolve({ id }) };
}
function makeRequest() {
  return new Request('http://localhost/api/sales/sale-1', { method: 'DELETE' });
}

describe('DELETE /api/sales/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settlementFindUniqueMock.mockResolvedValue(null);
  });

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 403 for regular seller', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns 404 when sale not found', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findUnique.mockResolvedValue(null);
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 400 when already cancelled', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findUnique.mockResolvedValue({ id: 'sale-1', isCancelled: true, soldAt: new Date(), articleId: 'art-1' });
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/storniert/i);
  });

  // Die 10-Minuten-Frist gilt weiterhin für Kassierer – nur Admins sind davon ausgenommen.
  it('Kassierer darf außerhalb der 10-Minuten-Frist NICHT stornieren (400)', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(5555) });
    const oldDate = new Date(Date.now() - 11 * 60 * 1000);
    prismaMock.sale.findUnique.mockResolvedValue(mockSale({ soldAt: oldDate }));
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/10 Minuten/i);
  });

  it('stornos sale successfully for admin', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const recentDate = new Date(Date.now() - 60 * 1000);
    prismaMock.sale.findUnique.mockResolvedValue(mockSale({ soldAt: recentDate }));
    prismaMock.$transaction.mockResolvedValue([{}, {}]);
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  // Admins sind von der 10-Minuten-Frist ausgenommen, damit auch spätere Korrekturen möglich
  // sind. Vorher hätte diese Anfrage 400 geliefert (siehe alter Kommentar "Admin only, within
  // 10 minutes" über der Route, der das genaue Gegenteil des jetzigen Verhaltens beschrieb).
  it('Admin darf auch nach mehr als 10 Minuten stornieren', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const oldDate = new Date(Date.now() - 11 * 60 * 1000);
    prismaMock.sale.findUnique.mockResolvedValue(mockSale({ soldAt: oldDate }));
    prismaMock.$transaction.mockResolvedValue([{}, {}]);

    const res = await DELETE(makeRequest(), makeContext());

    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  // Ein Storno nach bereits erzeugter Abrechnung würde deren Zahlen falsch machen – die
  // Abrechnung müsste zuerst neu erzeugt werden. Gilt für Admins genauso wie für Kassierer.
  it('409, wenn für den Verkäufer bereits eine Abrechnung existiert', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findUnique.mockResolvedValue(mockSale({ soldAt: new Date(Date.now() - 60 * 1000) }));
    settlementFindUniqueMock.mockResolvedValue({ id: 'settlement-1' });

    const res = await DELETE(makeRequest(), makeContext());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Abrechnung/i);
    expect(saleUpdateMock).not.toHaveBeenCalled();
    expect(articleUpdateMock).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  // Ein Storno besteht aus zwei Wirkungen: Der Verkauf wird als storniert markiert UND der
  // Artikel wird wieder verkäuflich. Beides nur über den Statuscode zu prüfen reicht nicht –
  // eine invertierte Storno-Logik (isCancelled: false, Artikel bleibt SOLD) lieferte ebenfalls
  // 200 und wäre unbemerkt durchgegangen. Deshalb werden hier die Argumente geprüft, die in
  // die Transaktion gehen, nicht nur deren Zustandekommen.
  it('storniert den Verkauf und gibt den Artikel wieder frei', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(5555) });
    const recentDate = new Date(Date.now() - 30 * 1000);
    prismaMock.sale.findUnique.mockResolvedValue(mockSale({ soldAt: recentDate }));
    prismaMock.$transaction.mockResolvedValue([{}, {}]);

    const res = await DELETE(makeRequest(), makeContext());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    expect(saleUpdateMock).toHaveBeenCalledWith({
      where: { id: 'sale-1' },
      data: { isCancelled: true, cancelledAt: expect.any(Date), cancelledById: 5555 },
    });
    expect(articleUpdateMock).toHaveBeenCalledWith({
      where: { id: 'art-1' },
      data: { status: 'AVAILABLE', soldAt: null },
    });
  });

  // Das Storno-Protokoll ist der ganze Zweck der Erfassung – ohne geprüfte Argumente wäre
  // ein cancelledById, das immer null bleibt, unsichtbar (Status wäre weiterhin 200).
  it('protokolliert den stornierenden Kassierer', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(9004) });
    prismaMock.sale.findUnique.mockResolvedValue(mockSale({ soldAt: new Date(Date.now() - 30 * 1000) }));
    prismaMock.$transaction.mockResolvedValue([{}, {}]);

    await DELETE(makeRequest(), makeContext());

    expect(saleUpdateMock.mock.calls[0][0].data.cancelledById).toBe(9004);
    expect(saleUpdateMock.mock.calls[0][0].data.cancelledAt).toBeInstanceOf(Date);
  });

  // Admins haben keine sellerId: cancelledById bleibt null, cancelledAt wird trotzdem
  // gesetzt. Nur an dieser Kombination ist ein Admin-Storno vom nicht protokollierten
  // Altbestand (beides null) unterscheidbar.
  it('protokolliert einen Admin-Storno mit cancelledById null, aber gesetztem cancelledAt', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findUnique.mockResolvedValue(mockSale({ soldAt: new Date(Date.now() - 60 * 1000) }));
    prismaMock.$transaction.mockResolvedValue([{}, {}]);

    await DELETE(makeRequest(), makeContext());

    expect(saleUpdateMock.mock.calls[0][0].data.cancelledById).toBeNull();
    expect(saleUpdateMock.mock.calls[0][0].data.cancelledAt).toBeInstanceOf(Date);
  });

  it('führt beide Änderungen in einer einzigen Transaktion aus', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(5555) });
    prismaMock.sale.findUnique.mockResolvedValue(mockSale({ soldAt: new Date(Date.now() - 30 * 1000) }));
    prismaMock.$transaction.mockResolvedValue([{}, {}]);

    await DELETE(makeRequest(), makeContext());

    // Ohne Transaktion könnte der Verkauf storniert sein, der Artikel aber verkauft bleiben –
    // dann fehlt er im Bestand und taucht in keiner Abrechnung mehr korrekt auf.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const [batch] = prismaMock.$transaction.mock.calls[0];
    expect(Array.isArray(batch)).toBe(true);
    expect(batch).toHaveLength(2);
  });

  it('schreibt nichts, wenn das Storno-Zeitfenster abgelaufen ist', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(5555) });
    prismaMock.sale.findUnique.mockResolvedValue({
      id: 'sale-1', isCancelled: false, soldAt: new Date(Date.now() - 11 * 60 * 1000), articleId: 'art-1',
    });

    const res = await DELETE(makeRequest(), makeContext());

    expect(res.status).toBe(400);
    expect(saleUpdateMock).not.toHaveBeenCalled();
    expect(articleUpdateMock).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('schreibt nichts, wenn der Verkauf bereits storniert ist', async () => {
    cookiesGetMock.mockReturnValue({ value: cashierToken(5555) });
    prismaMock.sale.findUnique.mockResolvedValue({
      id: 'sale-1', isCancelled: true, soldAt: new Date(), articleId: 'art-1',
    });

    const res = await DELETE(makeRequest(), makeContext());

    expect(res.status).toBe(400);
    expect(saleUpdateMock).not.toHaveBeenCalled();
    expect(articleUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 500 on DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.sale.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});
