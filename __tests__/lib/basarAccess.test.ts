import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const prismaMock = vi.hoisted(() => ({
  basar: { findUnique: vi.fn() },
  basarInvite: { findUnique: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { visibleBasarWhere, requireBasarAccess } from '@/app/lib/basarAccess';

const ADMIN = { role: 'admin' as const };
const SELLER = { role: 'seller' as const, sellerId: 1046 };

describe('visibleBasarWhere', () => {
  it('öffentlich (nicht angemeldet): nie ein Testbasar – auch keiner, in den jemand eingeladen ist', () => {
    expect(visibleBasarWhere(null)).toEqual({ isTest: false });
  });

  it('Admin: alles', () => {
    expect(visibleBasarWhere(ADMIN)).toEqual({});
  });

  it('Verkäufer: jeder echte Basar plus Testbasare mit eigener Einladung', () => {
    expect(visibleBasarWhere(SELLER)).toEqual({
      OR: [{ isTest: false }, { invites: { some: { sellerId: 1046 } } }],
    });
  });

  it('angemeldet ohne Verkäufernummer: wie öffentlich', () => {
    expect(visibleBasarWhere({ role: 'seller' })).toEqual({ isTest: false });
  });
});

describe('requireBasarAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('echter Basar: erlaubt – für ihn ändert sich nichts', async () => {
    prismaMock.basar.findUnique.mockResolvedValue({ isTest: false });
    expect(await requireBasarAccess(SELLER, 'b1')).toBeNull();
    // Für einen echten Basar wird nicht einmal nach einer Einladung gefragt.
    expect(prismaMock.basarInvite.findUnique).not.toHaveBeenCalled();
  });

  it('Admin: erlaubt, ohne Abfrage', async () => {
    expect(await requireBasarAccess(ADMIN, 'b1')).toBeNull();
    expect(prismaMock.basar.findUnique).not.toHaveBeenCalled();
  });

  it('Testbasar mit Einladung: erlaubt', async () => {
    prismaMock.basar.findUnique.mockResolvedValue({ isTest: true });
    prismaMock.basarInvite.findUnique.mockResolvedValue({ sellerId: 1046 });
    expect(await requireBasarAccess(SELLER, 'b1')).toBeNull();
    expect(prismaMock.basarInvite.findUnique.mock.calls[0][0].where).toEqual({
      basarId_sellerId: { basarId: 'b1', sellerId: 1046 },
    });
  });

  it('Testbasar ohne Einladung: 404 – nicht 403, sonst verriete die Antwort, dass es ihn gibt', async () => {
    prismaMock.basar.findUnique.mockResolvedValue({ isTest: true });
    prismaMock.basarInvite.findUnique.mockResolvedValue(null);
    const res = await requireBasarAccess(SELLER, 'b1');
    expect(res?.status).toBe(404);
  });

  it('Testbasar ohne Verkäufernummer im Token: 404', async () => {
    prismaMock.basar.findUnique.mockResolvedValue({ isTest: true });
    const res = await requireBasarAccess({ role: 'seller' }, 'b1');
    expect(res?.status).toBe(404);
    expect(prismaMock.basarInvite.findUnique).not.toHaveBeenCalled();
  });

  it('Basar existiert nicht: überlässt die Antwort der Route, wie bisher', async () => {
    prismaMock.basar.findUnique.mockResolvedValue(null);
    expect(await requireBasarAccess(SELLER, 'gibtsnicht')).toBeNull();
  });

  it('mit schon geladenem Basar: keine zweite Abfrage', async () => {
    prismaMock.basarInvite.findUnique.mockResolvedValue(null);
    const res = await requireBasarAccess(SELLER, { id: 'b1', isTest: true });
    expect(res?.status).toBe(404);
    expect(prismaMock.basar.findUnique).not.toHaveBeenCalled();
  });
});

// ─── Wächter ────────────────────────────────────────────────────────────────
// Eine vergessene Stelle hieße: Testbasar doch sichtbar. Deshalb wird nicht jede Route einzeln
// getestet, sondern der Code selbst gelesen – das fängt auch Routen, die es noch nicht gibt.

function routesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return routesUnder(p);
    return name === 'route.ts' ? [p] : [];
  });
}

const count = (src: string, needle: string) => src.split(needle).length - 1;

describe('Wächter: jede Route, die Nicht-Admins erreichen, prüft die Sichtbarkeit', () => {
  const basarRoutes = routesUnder('app/api/basars/[id]');

  it('findet die Routen überhaupt', () => {
    // Sonst wäre der Test bei einem falschen Pfad grün, weil er nichts prüft.
    expect(basarRoutes.length).toBeGreaterThan(15);
  });

  it.each(basarRoutes)('%s', (file) => {
    const src = readFileSync(file, 'utf8');
    // Jeder Handler, den Verkäufer oder Kassierer erreichen, braucht seinen eigenen Aufruf.
    // Admin-Routen sind frei: der Admin sieht jeden Basar.
    const offen = count(src, 'requireAuth()') + count(src, 'requireCashier()');
    const geprueft = count(src, 'await requireBasarAccess(');
    expect(geprueft, `${file}: ${offen} Handler für Nicht-Admins, ${geprueft} Prüfungen`).toBeGreaterThanOrEqual(offen);
  });

  it.each([
    'app/api/tasks/route.ts',
    'app/api/task-signups/route.ts',
    'app/api/cakes/route.ts',
    'app/api/articles/scan/[qrCode]/route.ts',
  ])('%s (außerhalb, mit basarId)', (file) => {
    expect(readFileSync(file, 'utf8')).toContain('await requireBasarAccess(');
  });

  it('die Basar-Liste filtert für jeden Aufrufer', () => {
    expect(readFileSync('app/api/basars/route.ts', 'utf8')).toContain('...visibleBasarWhere(auth)');
  });

  it('die öffentliche Startseite zeigt nie einen Testbasar', () => {
    expect(readFileSync('app/page.tsx', 'utf8')).toContain('...visibleBasarWhere(null)');
  });
});
