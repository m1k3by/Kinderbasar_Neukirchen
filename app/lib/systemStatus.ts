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

/** Grenzen, die /admin/status überwacht. */
export const RAW_FETCH_CAP = 5000; // Sales je Abruf in GET /api/basars/[id]/transactions
export const VERCEL_RESPONSE_LIMIT_BYTES = 4.5 * 1024 * 1024; // max. Antwortgröße einer Vercel Function
// ponytail: Schätzung aus einer Messung (24.10.2026: 2,8 MB bei 15.845 Artikeln ≈ 185 B/Artikel),
// keine echte Größenmessung. Ändert sich die Projektion in scan-cache/route.ts, neu messen.
export const SCAN_CACHE_BYTES_PER_ARTICLE = 185;
export const SELLER_NUMBER_CAPACITY = 9000; // 1000–9999, siehe app/lib/sellerIdAllocation.ts

export interface LimitsInput {
  basars: {
    id: string;
    title: string;
    status: string;
    isTest: boolean;
    maxSellers: number;
    activeSellers: number;
    scanArticles: number;
    sales: number;
  }[];
  mail: { pending: number; failed: number; oldestPendingAt: Date | string | null };
  sellerNumbersUsed: number;
  now: Date;
}

export function assessLimits({ basars, mail, sellerNumbersUsed, now }: LimitsInput) {
  const oldestPendingMinutes =
    mail.pending > 0 && mail.oldestPendingAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(mail.oldestPendingAt).getTime()) / 60000))
      : null;
  const sellerNumberUsage = sellerNumbersUsed / SELLER_NUMBER_CAPACITY;
  return {
    basars: basars.map((b) => {
      const scanCacheBytes = b.scanArticles * SCAN_CACHE_BYTES_PER_ARTICLE;
      const scanCacheUsage = scanCacheBytes / VERCEL_RESPONSE_LIMIT_BYTES;
      const salesUsage = b.sales / RAW_FETCH_CAP;
      const sellerUsage = b.maxSellers > 0 ? b.activeSellers / b.maxSellers : 0;
      return {
        ...b,
        scanCacheBytes,
        scanCacheUsage,
        scanCacheLevel: levelAbove(scanCacheUsage, 0.7, 0.9),
        salesUsage,
        salesLevel: levelAbove(salesUsage, 0.8, 1.0),
        sellerUsage,
        sellerLevel: levelAbove(sellerUsage, 0.9, Infinity),
      };
    }),
    mail: {
      pending: mail.pending,
      failed: mail.failed,
      oldestPendingMinutes,
      // Eine wartende Mail ohne Datum (sollte nicht vorkommen) zählt als frisch.
      pendingLevel: levelAbove(oldestPendingMinutes ?? 0, 60, 24 * 60),
      failedLevel: levelAbove(mail.failed, 1, Infinity),
    },
    sellerNumbersUsed,
    sellerNumberUsage,
    sellerNumberLevel: levelAbove(sellerNumberUsage, 0.8, 0.95),
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
