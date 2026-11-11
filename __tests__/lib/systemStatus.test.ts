import { describe, it, expect } from 'vitest';
import {
  levelAbove, assessDb, assessDisk, assessServer, assessLimits, supabaseProjectRef,
  SCAN_CACHE_BYTES_PER_ARTICLE, VERCEL_RESPONSE_LIMIT_BYTES, type DbStatsRow,
} from '@/app/lib/systemStatus';

const base: DbStatsRow = {
  maxConnections: 100, reservedConnections: 10, connections: 0, active: 0, idleInTransaction: 0,
  waitingOnLock: 0, longestQuerySeconds: 0, dbBytes: 0, blocksHit: 0, blocksRead: 0, tempBytes: 0,
  deadlocks: 0, commits: 0, rollbacks: 0, statsReset: null,
};

describe('levelAbove', () => {
  it('trifft die Grenzen genau', () => {
    expect(levelAbove(0.69, 0.7, 0.9)).toBe('ok');
    expect(levelAbove(0.7, 0.7, 0.9)).toBe('warn');
    expect(levelAbove(0.9, 0.7, 0.9)).toBe('bad');
    expect(levelAbove(1e9, 1, Infinity)).toBe('warn');
  });
});

describe('assessDb', () => {
  it('rechnet die Verbindungsauslastung ohne reservierte Plätze', () => {
    const r = assessDb({ ...base, connections: 63 }, 0); // 63 / 90 = 0,7
    expect(r.connectionUsage).toBeCloseTo(0.7);
    expect(r.connectionLevel).toBe('warn');
    expect(assessDb({ ...base, connections: 81 }, 0).connectionLevel).toBe('bad');
  });

  it('cacheHitRatio ist null bei 0/0 und dann ok', () => {
    const r = assessDb(base, 0);
    expect(r.cacheHitRatio).toBeNull();
    expect(r.cacheLevel).toBe('ok');
  });

  it('bewertet die Cache-Trefferquote', () => {
    expect(assessDb({ ...base, blocksHit: 94, blocksRead: 6 }, 0).cacheLevel).toBe('bad');
    expect(assessDb({ ...base, blocksHit: 98, blocksRead: 2 }, 0).cacheLevel).toBe('warn');
    expect(assessDb({ ...base, blocksHit: 99, blocksRead: 1 }, 0).cacheLevel).toBe('ok');
  });

  it('bewertet die übrigen Werte', () => {
    const r = assessDb({ ...base, idleInTransaction: 1, waitingOnLock: 5, longestQuerySeconds: 30, deadlocks: 99 }, 200);
    expect(r.idleInTransactionLevel).toBe('warn');
    expect(r.waitingOnLockLevel).toBe('bad');
    expect(r.longestQueryLevel).toBe('bad');
    expect(r.deadlockLevel).toBe('warn');
    expect(r.latencyLevel).toBe('warn');
    expect(assessDb(base, 1000).latencyLevel).toBe('bad');
  });

  it('Datenbankgröße gegen 500 MiB: 349 MiB ok, 350 warn, 450 bad', () => {
    const MiB = 1024 * 1024;
    expect(assessDb({ ...base, dbBytes: 349 * MiB }, 0).dbSizeLevel).toBe('ok');
    const r = assessDb({ ...base, dbBytes: 350 * MiB }, 0);
    expect(r.dbSizeUsage).toBeCloseTo(0.7);
    expect(r.dbSizeLevel).toBe('warn');
    expect(assessDb({ ...base, dbBytes: 450 * MiB }, 0).dbSizeLevel).toBe('bad');
  });
});

describe('assessDisk', () => {
  it('79 % ok, 80 % warn, 90 % bad, Größe 0 ohne NaN', () => {
    expect(assessDisk({ fs_size_bytes: 100, fs_used_bytes: 79 }).level).toBe('ok');
    expect(assessDisk({ fs_size_bytes: 100, fs_used_bytes: 80 }).level).toBe('warn');
    expect(assessDisk({ fs_size_bytes: 100, fs_used_bytes: 90 })).toEqual({ usedBytes: 90, sizeBytes: 100, usage: 0.9, level: 'bad' });
    expect(assessDisk({ fs_size_bytes: 0, fs_used_bytes: 5 }).usage).toBe(0);
  });
});

describe('assessServer', () => {
  it('ohne Limit: null und ok', () => {
    expect(assessServer({ rssBytes: 1e9, limitMb: null })).toEqual({ memoryUsage: null, memoryLevel: 'ok' });
  });
  it('mit Limit', () => {
    const mb = 1024 * 1024;
    expect(assessServer({ rssBytes: 800 * mb, limitMb: 1000 }).memoryLevel).toBe('warn');
    expect(assessServer({ rssBytes: 900 * mb, limitMb: 1000 }).memoryLevel).toBe('bad');
    expect(assessServer({ rssBytes: 500 * mb, limitMb: 1000 }).memoryLevel).toBe('ok');
  });
});

describe('assessLimits', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const basar = { id: 'b1', title: 'Herbst', status: 'ACTIVE', isTest: false, maxSellers: 100, activeSellers: 0, scanArticles: 0, sales: 0 };
  const noMail = { pending: 0, failed: 0, oldestPendingAt: null };
  const one = (over: Partial<typeof basar>) =>
    assessLimits({ basars: [{ ...basar, ...over }], mail: noMail, sellerNumbersUsed: 0, now }).basars[0];
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60000);
  const mailWith = (pending: number, at: Date | string | null, failed = 0) =>
    assessLimits({ basars: [], mail: { pending, failed, oldestPendingAt: at }, sellerNumbersUsed: 0, now }).mail;

  it('Verkäufe: 3999 ok, 4000 warn, 4999 warn, 5000 bad', () => {
    expect(one({ sales: 3999 }).salesLevel).toBe('ok');
    expect(one({ sales: 4000 }).salesLevel).toBe('warn');
    expect(one({ sales: 4999 }).salesLevel).toBe('warn');
    expect(one({ sales: 5000 }).salesLevel).toBe('bad');
    expect(one({ sales: 6000 }).salesUsage).toBeCloseTo(1.2);
  });

  it('Kassen-Katalog: Bytes aus Artikelzahl, Grenzen 70 % / 90 %', () => {
    const r = one({ scanArticles: 1000 });
    expect(r.scanCacheBytes).toBe(1000 * SCAN_CACHE_BYTES_PER_ARTICLE);
    expect(r.scanCacheUsage).toBeCloseTo(185000 / VERCEL_RESPONSE_LIMIT_BYTES);
    // 70 % = 17.854,1 Artikel, 90 % = 22.955,3 Artikel
    expect(one({ scanArticles: 17854 }).scanCacheLevel).toBe('ok');
    expect(one({ scanArticles: 17855 }).scanCacheLevel).toBe('warn');
    expect(one({ scanArticles: 22955 }).scanCacheLevel).toBe('warn');
    expect(one({ scanArticles: 22956 }).scanCacheLevel).toBe('bad');
  });

  it('Plätze: warn ab 90 %, nie bad, maxSellers 0 gibt kein NaN', () => {
    expect(one({ activeSellers: 89 }).sellerLevel).toBe('ok');
    expect(one({ activeSellers: 90 }).sellerLevel).toBe('warn');
    expect(one({ activeSellers: 150 }).sellerLevel).toBe('warn');
    const z = one({ maxSellers: 0, activeSellers: 5 });
    expect(z.sellerUsage).toBe(0);
    expect(z.sellerLevel).toBe('ok');
  });

  it('Mail: ohne Wartende ok, auch mit Datum', () => {
    expect(mailWith(0, null).oldestPendingMinutes).toBeNull();
    expect(mailWith(0, null).pendingLevel).toBe('ok');
    expect(mailWith(0, minutesAgo(5000)).pendingLevel).toBe('ok');
  });

  it('Mail: 59 Min. ok, 60 warn, 24 h bad; Datum als ISO-String', () => {
    expect(mailWith(1, minutesAgo(59)).pendingLevel).toBe('ok');
    expect(mailWith(1, minutesAgo(60)).pendingLevel).toBe('warn');
    expect(mailWith(1, minutesAgo(60)).oldestPendingMinutes).toBe(60);
    expect(mailWith(1, minutesAgo(24 * 60 - 1)).pendingLevel).toBe('warn');
    expect(mailWith(1, minutesAgo(24 * 60)).pendingLevel).toBe('bad');
    expect(mailWith(1, minutesAgo(60).toISOString()).oldestPendingMinutes).toBe(60);
  });

  it('Mail: fehlgeschlagen warn ab 1', () => {
    expect(mailWith(0, null, 0).failedLevel).toBe('ok');
    expect(mailWith(0, null, 1).failedLevel).toBe('warn');
  });

  it('Verkäufernummern: 7199 ok, 7200 warn, 8550 bad', () => {
    const lv = (n: number) => assessLimits({ basars: [], mail: noMail, sellerNumbersUsed: n, now });
    expect(lv(7199).sellerNumberLevel).toBe('ok');
    expect(lv(7200).sellerNumberLevel).toBe('warn');
    expect(lv(7200).sellerNumberUsage).toBeCloseTo(0.8);
    expect(lv(8549).sellerNumberLevel).toBe('warn');
    expect(lv(8550).sellerNumberLevel).toBe('bad');
  });
});

describe('supabaseProjectRef', () => {
  it('liest die Ref aus dem Pooler-Benutzer', () => {
    expect(supabaseProjectRef('postgresql://postgres.abcdef:pw@aws-1-eu-central-1.pooler.supabase.com:6543/postgres')).toBe('abcdef');
  });
  it('null bei anderen Formen', () => {
    expect(supabaseProjectRef('postgresql://postgres:pw@localhost:5432/x')).toBeNull();
    expect(supabaseProjectRef(undefined)).toBeNull();
    expect(supabaseProjectRef('müll')).toBeNull();
  });
});
