import { describe, it, expect } from 'vitest';
import { levelAbove, assessDb, assessServer, supabaseProjectRef, type DbStatsRow } from '@/app/lib/systemStatus';

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
