import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
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

  it('500 bei leerem Ergebnis', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    prismaMock.$queryRaw.mockResolvedValue([]);
    expect((await GET()).status).toBe(500);
  });
});
