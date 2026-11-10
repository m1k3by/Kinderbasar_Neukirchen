/**
 * Bewertung der Kennzahlen für /admin/status. Reine Funktionen, keine Prisma-Imports.
 *
 * Alle Schwellwerte sind Faustregeln für Postgres, keine Grenzen eines Supabase-Plans.
 */

export type Level = 'ok' | 'warn' | 'bad';

export interface DbStatsRow {
  maxConnections: number;
  reservedConnections: number;
  connections: number;
  active: number;
  idleInTransaction: number;
  waitingOnLock: number;
  longestQuerySeconds: number;
  dbBytes: number;
  blocksHit: number;
  blocksRead: number;
  tempBytes: number;
  deadlocks: number;
  commits: number;
  rollbacks: number;
  statsReset: Date | string | null;
}

export function levelAbove(value: number, warn: number, bad: number): Level {
  if (value >= bad) return 'bad';
  if (value >= warn) return 'warn';
  return 'ok';
}

export function assessDb(row: DbStatsRow, latencyMs: number) {
  const usable = row.maxConnections - row.reservedConnections;
  const connectionUsage = usable > 0 ? row.connections / usable : 0;
  const reads = row.blocksHit + row.blocksRead;
  const cacheHitRatio = reads > 0 ? row.blocksHit / reads : null;

  return {
    connectionUsage,
    connectionLevel: levelAbove(connectionUsage, 0.7, 0.9),
    cacheHitRatio,
    // Niedriger ist schlechter, daher umgekehrt: unter 0,95 rot, unter 0,99 gelb.
    cacheLevel: (cacheHitRatio === null ? 'ok' : cacheHitRatio < 0.95 ? 'bad' : cacheHitRatio < 0.99 ? 'warn' : 'ok') as Level,
    idleInTransactionLevel: levelAbove(row.idleInTransaction, 1, 5),
    waitingOnLockLevel: levelAbove(row.waitingOnLock, 1, 5),
    longestQueryLevel: levelAbove(row.longestQuerySeconds, 5, 30),
    deadlockLevel: levelAbove(row.deadlocks, 1, Infinity),
    latencyLevel: levelAbove(latencyMs, 200, 1000),
  };
}

export function assessServer({ rssBytes, limitMb }: { rssBytes: number; limitMb: number | null }) {
  const memoryUsage = limitMb ? rssBytes / (limitMb * 1024 * 1024) : null;
  return {
    memoryUsage,
    memoryLevel: (memoryUsage === null ? 'ok' : levelAbove(memoryUsage, 0.8, 0.9)) as Level,
  };
}

/** Der Pooler-Benutzername hat die Form `postgres.<ref>`. */
export function supabaseProjectRef(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const user = new URL(url).username;
    const dot = user.indexOf('.');
    return dot >= 0 && user.slice(dot + 1) ? user.slice(dot + 1) : null;
  } catch {
    return null;
  }
}
