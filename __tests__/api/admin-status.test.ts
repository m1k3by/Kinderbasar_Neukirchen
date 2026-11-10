import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  basar: { findMany: vi.fn() },
  basarSeller: { count: vi.fn() },
  article: { count: vi.fn() },
  sale: { count: vi.fn() },
  mailQueue: { count: vi.fn(), findFirst: vi.fn() },
  seller: { count: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/admin/status/route';

const URL_WITH_PW = 'postgresql://postgres.abcdef:geheimesPasswort123@aws-1-eu-central-1.pooler.supabase.com:6543/postgres';

const row = {
  maxConnections: 100, reservedConnections: 10, connections: 45, active: 2, idleInTransaction: 0,
  waitingOnLock: 0, longestQuerySeconds: 0.5, dbBytes: 12_000_000, blocksHit: 985, blocksRead: 15,
  tempBytes: 0, deadlocks: 0, commits: 1000, rollbacks: 3, statsReset: new Date('2026-10-01T00:00:00Z'),
};

const original = process.env.POSTGRES_PRISMA_URL;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.POSTGRES_PRISMA_URL = URL_WITH_PW;
  prismaMock.$queryRaw.mockResolvedValue([row]);
  cookiesGetMock.mockReturnValue({ value: adminToken() });
  prismaMock.basar.findMany.mockResolvedValue([
    { id: 'b1', title: 'Herbst', status: 'ACTIVE', isTest: true, maxSellers: 100 },
  ]);
  prismaMock.basarSeller.count.mockResolvedValue(95);
  prismaMock.article.count.mockResolvedValue(22956);
  prismaMock.sale.count.mockResolvedValue(5000);
  prismaMock.mailQueue.count.mockImplementation(async ({ where }: { where: { status: string } }) =>
    where.status === 'PENDING' ? 3 : 2,
  );
  prismaMock.mailQueue.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 90 * 60000) });
  prismaMock.seller.count.mockResolvedValue(7200);
});
afterEach(() => {
  if (original === undefined) delete process.env.POSTGRES_PRISMA_URL;
  else process.env.POSTGRES_PRISMA_URL = original;
});

describe('GET /api/admin/status', () => {
  it('401 ohne Token, ohne Abfrage', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    expect((await GET()).status).toBe(401);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('403 für Verkäufer, ohne Abfrage', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    expect((await GET()).status).toBe(403);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('liefert abgeleitete Werte, Supabase-Link und kein Passwort', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.clone().json());
    const body = await res.json();

    expect(body.db.connectionUsage).toBeCloseTo(0.5); // 45 / 90
    expect(body.db.connectionLevel).toBe('ok');
    expect(body.db.cacheHitRatio).toBeCloseTo(0.985);
    expect(body.db.cacheLevel).toBe('warn');
    expect(body.db.statsReset).toBe('2026-10-01T00:00:00.000Z');
    expect(typeof body.db.latencyMs).toBe('number');
    expect(body.links.supabase).toContain('abcdef');
    expect(body.links.vercel).toBe('https://vercel.com/basar-neukirchens-projects/basar_neukirchen/usage');
    expect(text).not.toContain('geheimesPasswort123');
    expect(text).not.toContain(URL_WITH_PW);
  });

  it('fragt die Grenzen mit den richtigen where-Klauseln ab', async () => {
    await GET();
    expect(prismaMock.basar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isArchived: false }, orderBy: { eventDate: 'desc' } }),
    );
    expect(prismaMock.basarSeller.count).toHaveBeenCalledWith({ where: { basarId: 'b1', isActive: true } });
    expect(prismaMock.article.count).toHaveBeenCalledWith({
      where: { basarSeller: { basarId: 'b1' }, status: { in: ['AVAILABLE', 'SOLD'] } },
    });
    expect(prismaMock.sale.count).toHaveBeenCalledWith({ where: { basarId: 'b1' } });
    expect(prismaMock.mailQueue.count).toHaveBeenCalledWith({ where: { status: 'PENDING' } });
    expect(prismaMock.mailQueue.count).toHaveBeenCalledWith({ where: { status: 'FAILED' } });
    expect(prismaMock.mailQueue.findFirst).toHaveBeenCalledWith({
      where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true },
    });
    expect(prismaMock.seller.count).toHaveBeenCalledWith({ where: { sellerId: { gte: 1000, lte: 9999 } } });
  });

  it('liefert die abgeleiteten Grenzwerte', async () => {
    const { limits } = await (await GET()).json();
    expect(limits.basars).toHaveLength(1);
    expect(limits.basars[0]).toMatchObject({
      id: 'b1', isTest: true, activeSellers: 95, scanArticles: 22956, sales: 5000,
      scanCacheLevel: 'bad', salesLevel: 'bad', sellerLevel: 'warn',
    });
    expect(limits.basars[0].salesUsage).toBe(1);
    expect(limits.mail).toMatchObject({ pending: 3, failed: 2, oldestPendingMinutes: 90, pendingLevel: 'warn', failedLevel: 'warn' });
    expect(limits.sellerNumbersUsed).toBe(7200);
    expect(limits.sellerNumberLevel).toBe('warn');
  });

  it('zählt keine Basar-Details ohne nicht archivierten Basar', async () => {
    prismaMock.basar.findMany.mockResolvedValue([]);
    const { limits } = await (await GET()).json();
    expect(limits.basars).toEqual([]);
    expect(prismaMock.article.count).not.toHaveBeenCalled();
  });

  it('500 bei leerem Ergebnis', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    prismaMock.$queryRaw.mockResolvedValue([]);
    expect((await GET()).status).toBe(500);
  });
});
