import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

// ─── next/headers mock ────────────────────────────────────────────────────────
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  basar: { findUnique: vi.fn() },
  basarSeller: { findMany: vi.fn() },
  // Orga ohne Zeile im Basar (app/lib/orgaPlaceholders.ts)
  seller: { findMany: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

// Der Generator ist in __tests__/lib/anlieferzettel.test.ts am erzeugten PDF geprüft. Hier
// zählt, *wen* die Route an ihn übergibt – deshalb wird er beobachtet, nicht ersetzt.
const buildSpy = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('@/app/lib/anlieferzettel', async (orig) => {
  const real = await orig<typeof import('@/app/lib/anlieferzettel')>();
  return {
    ...real,
    buildAnlieferzettel: (rows: Parameters<typeof real.buildAnlieferzettel>[0]) => {
      buildSpy.rows = rows;
      return real.buildAnlieferzettel(rows);
    },
  };
});

import { GET } from '@/app/api/basars/[id]/anlieferzettel.pdf/route';

const ctx = { params: Promise.resolve({ id: 'basar-1' }) };
const req = (set?: string) =>
  new Request(`http://localhost/api/basars/basar-1/anlieferzettel.pdf${set ? `?set=${set}` : ''}`);
const nummern = () => buildSpy.rows.map(r => (r as { sellerId: number }).sellerId);

/** Eine Zeile, wie die Route sie aus findMany bekommt. */
const zeile = (sellerId: number, isActive: boolean, articles: number, rolle: { isOrga?: boolean; isEmployee?: boolean } = {}) => ({
  isActive,
  seller: { sellerId, isOrga: rolle.isOrga ?? false, isEmployee: rolle.isEmployee ?? false },
  _count: { articles },
});
const ORGA = { isOrga: true, isEmployee: true };

// Bewusst ein Fall pro Unterschied – und absichtlich *nicht* nach Nummer geordnet, damit die
// Sortierung der Route geprüft wird und nicht die Reihenfolge des Mocks.
const ZEILEN = [
  zeile(1095, true, 7),                       // angemeldet, mit Artikeln
  zeile(1040, true, 0),                       // angemeldet, ohne Artikel
  zeile(1080, false, 3, ORGA),                // Orga, nicht angemeldet, mit Artikeln (#1080)
  zeile(1060, true, 4, { isEmployee: true }), // angemeldet, MA, mit Artikeln
  zeile(1046, false, 0, ORGA),                // Orga mit Zeile, nicht angemeldet, ohne Artikel (#1046, #8247)
  zeile(1049, false, 3),                      // nur vorbereitet, nicht angemeldet
];
// Orga ganz ohne Zeile (#1463). Nummer liegt mitten zwischen den echten Zeilen.
const ORGA_OHNE_ZEILE = [{ sellerId: 1050, firstName: 'M', lastName: 'E', email: 'm@e.de', ...ORGA }];

describe('GET /api/basars/[id]/anlieferzettel.pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildSpy.rows = [];
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ title: 'Herbst- und Winterbasar 2026' });
    prismaMock.basarSeller.findMany.mockResolvedValue(ZEILEN);
    prismaMock.seller.findMany.mockResolvedValue(ORGA_OHNE_ZEILE);
  });

  // ── Zugriff ────────────────────────────────────────────────────────────────
  it('ohne Anmeldung: 401', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    expect((await GET(req('activated'), ctx)).status).toBe(401);
  });

  it('als Verkäufer: 403 und keine Abfrage', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    expect((await GET(req('activated'), ctx)).status).toBe(403);
    expect(prismaMock.basarSeller.findMany).not.toHaveBeenCalled();
    expect(prismaMock.seller.findMany).not.toHaveBeenCalled();
  });

  // ── Parameter ──────────────────────────────────────────────────────────────
  it('ohne set: 400 – kein stiller Fallback auf „alle"', async () => {
    expect((await GET(req(), ctx)).status).toBe(400);
    expect(prismaMock.basarSeller.findMany).not.toHaveBeenCalled();
  });

  it('mit unbekanntem set: 400', async () => {
    expect((await GET(req('all'), ctx)).status).toBe(400);
    expect((await GET(req('activatedNoArticles'), ctx)).status).toBe(400);
  });

  it('unbekannter Basar: 404', async () => {
    prismaMock.basar.findUnique.mockResolvedValue(null);
    expect((await GET(req('activated'), ctx)).status).toBe(404);
  });

  it('leere Auswahl: 409 statt eines leeren PDFs', async () => {
    prismaMock.basarSeller.findMany.mockResolvedValue([zeile(1049, false, 3)]);
    prismaMock.seller.findMany.mockResolvedValue([]);
    expect((await GET(req('activated'), ctx)).status).toBe(409);
  });

  // ── Auswahl ────────────────────────────────────────────────────────────────
  // Orga bekommt in beiden Varianten immer einen Zettel – mit Zeile oder ohne, angemeldet
  // oder nicht, mit Artikeln oder ohne (Wunsch der Orga, 07.10.2026).
  it('„activated": aktiv Angemeldete plus jede Orga-Person, nach Nummer sortiert', async () => {
    const res = await GET(req('activated'), ctx);
    expect(res.status).toBe(200);
    expect(nummern()).toEqual([1040, 1046, 1050, 1060, 1080, 1095]);
  });

  it('„withArticles": Angemeldete mit Artikeln plus jede Orga-Person – Vorbereiter nein', async () => {
    const res = await GET(req('withArticles'), ctx);
    expect(res.status).toBe(200);
    expect(nummern()).toEqual([1046, 1050, 1060, 1080, 1095]);
  });

  it('nimmt Orga ohne Zeile und ohne Artikel in beide Varianten auf', async () => {
    await GET(req('activated'), ctx);
    expect(nummern()).toContain(1050);
    await GET(req('withArticles'), ctx);
    expect(nummern()).toContain(1050);
  });

  it('lässt Vorbereiter ohne Anmeldung in beiden Varianten draußen', async () => {
    await GET(req('activated'), ctx);
    expect(nummern()).not.toContain(1049);
    await GET(req('withArticles'), ctx);
    expect(nummern()).not.toContain(1049);
  });

  it('reicht die Rolle durch, damit auf dem Blatt M bzw. ORGA steht', async () => {
    await GET(req('withArticles'), ctx);
    expect(buildSpy.rows).toEqual([
      { sellerId: 1046, isOrga: true, isEmployee: true },
      { sellerId: 1050, isOrga: true, isEmployee: true },
      { sellerId: 1060, isOrga: false, isEmployee: true },
      { sellerId: 1080, isOrga: true, isEmployee: true },
      { sellerId: 1095, isOrga: false, isEmployee: false },
    ]);
  });

  it('liefert ein PDF mit sprechendem Dateinamen samt Anzahl', async () => {
    const res = await GET(req('activated'), ctx);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition'))
      .toBe('attachment; filename="anlieferzettel-herbst-und-winterbasar-2026-6-angemeldet-und-orga.pdf"');
  });

  // ── Abfragen ───────────────────────────────────────────────────────────────
  it('fragt nur diesen Basar ab, mit Rolle und Artikelzahl', async () => {
    await GET(req('activated'), ctx);

    // Ein gemocktes Prisma ignoriert where und select vollständig – ohne Prüfung der
    // Argumente bliebe der Test grün, wenn die Route alle Basare läse.
    const args = prismaMock.basarSeller.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ basarId: 'basar-1' });
    expect(args.select.isActive).toBe(true);
    expect(args.select.seller.select).toMatchObject({ sellerId: true, isOrga: true, isEmployee: true });
    expect(args.select._count).toEqual({ select: { articles: true } });
  });

  it('holt Orga ohne Zeile mit derselben Abfrage wie die Teilnehmerliste', async () => {
    await GET(req('activated'), ctx);

    // Dieselbe Abfrage wie in GET /api/basars/[id] – sonst zählte der Knopf dort eine
    // andere Menge, als das PDF hier druckt.
    expect(prismaMock.seller.findMany.mock.calls[0][0].where).toEqual({
      isOrga: true,
      basarSellers: { none: { basarId: 'basar-1' } },
    });
  });
});
