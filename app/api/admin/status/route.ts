import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/apiAuth';
import { assessDb, assessDisk, assessLimits, assessServer, supabaseProjectRef, type DbStatsRow } from '../../../lib/systemStatus';

/**
 * Plattenfüllstand per Supabase Management API. Braucht SUPABASE_ACCESS_TOKEN (Personal Access
 * Token mit Recht infra_disk_config_read). Scheitert der Abruf, zeigt die Seite den Rest trotzdem.
 */
async function fetchDisk(ref: string | null) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token || !ref) return { state: 'no-token' as const };
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/disk/util`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Supabase API ${res.status}`);
    const body = await res.json();
    return { state: 'ok' as const, measuredAt: body.timestamp ?? null, ...assessDisk(body.metrics) };
  } catch (error) {
    console.error('GET /api/admin/status disk error:', error);
    return { state: 'error' as const };
  }
}

/** GET /api/admin/status – eine Momentaufnahme (eine Abfrage), gelesen von app/admin/status. */
export async function GET() {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const ref = supabaseProjectRef(process.env.POSTGRES_PRISMA_URL);
    const diskPromise = fetchDisk(ref); // läuft parallel zu den Datenbankabfragen

    const t0 = performance.now();
    // Alle Casts sind nötig: ohne sie liefert Prisma BigInt, das JSON.stringify nicht kann.
    const rows = await prisma.$queryRaw<DbStatsRow[]>`
      SELECT
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS "maxConnections",
        (SELECT setting::int FROM pg_settings WHERE name = 'superuser_reserved_connections') AS "reservedConnections",
        (SELECT count(*)::int FROM pg_stat_activity WHERE backend_type = 'client backend') AS "connections",
        (SELECT count(*)::int FROM pg_stat_activity WHERE backend_type = 'client backend' AND state = 'active') AS "active",
        (SELECT count(*)::int FROM pg_stat_activity WHERE backend_type = 'client backend' AND state = 'idle in transaction') AS "idleInTransaction",
        (SELECT count(*)::int FROM pg_stat_activity WHERE wait_event_type = 'Lock') AS "waitingOnLock",
        (SELECT coalesce(extract(epoch FROM max(now() - query_start)), 0)::float8 FROM pg_stat_activity
           WHERE backend_type = 'client backend' AND state = 'active' AND pid <> pg_backend_pid()) AS "longestQuerySeconds",
        (SELECT sum(pg_database_size(datname))::float8 FROM pg_database) AS "dbBytes",
        d.blks_hit::float8 AS "blocksHit", d.blks_read::float8 AS "blocksRead",
        d.temp_bytes::float8 AS "tempBytes", d.deadlocks::float8 AS "deadlocks",
        d.xact_commit::float8 AS "commits", d.xact_rollback::float8 AS "rollbacks",
        d.stats_reset AS "statsReset"
      FROM pg_stat_database d WHERE d.datname = current_database()
    `;
    const latencyMs = Math.round(performance.now() - t0);

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('pg_stat_database lieferte keine Zeile');
    }
    const row = rows[0];

    // Typisierte Aufrufe statt Raw-SQL: tsc prüft die Spaltennamen. Die where-Klauseln sind
    // exakt die der Routen, deren Grenzen hier überwacht werden (scan-cache, transactions).
    const [basars, mailPending, mailFailed, oldestPending, sellerNumbersUsed] = await Promise.all([
      prisma.basar.findMany({
        where: { isArchived: false },
        select: { id: true, title: true, status: true, isTest: true, maxSellers: true },
        orderBy: { eventDate: 'desc' },
      }),
      prisma.mailQueue.count({ where: { status: 'PENDING' } }),
      prisma.mailQueue.count({ where: { status: 'FAILED' } }),
      prisma.mailQueue.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      prisma.seller.count({ where: { sellerId: { gte: 1000, lte: 9999 } } }),
    ]);
    const basarCounts = await Promise.all(
      basars.map(async (b) => {
        const [activeSellers, scanArticles] = await Promise.all([
          prisma.basarSeller.count({ where: { basarId: b.id, isActive: true } }),
          prisma.article.count({ where: { basarSeller: { basarId: b.id }, status: { in: ['AVAILABLE', 'SOLD'] } } }),
        ]);
        return { ...b, activeSellers, scanArticles };
      }),
    );
    const limits = assessLimits({
      basars: basarCounts,
      mail: { pending: mailPending, failed: mailFailed, oldestPendingAt: oldestPending?.createdAt ?? null },
      sellerNumbersUsed,
      now: new Date(),
    });

    const rssBytes = process.memoryUsage().rss;
    const limitMb = Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE) || null;
    const disk = await diskPromise;

    return NextResponse.json({
      disk,
      checkedAt: new Date().toISOString(),
      db: {
        ...row,
        statsReset: row.statsReset ? new Date(row.statsReset).toISOString() : null,
        latencyMs,
        ...assessDb(row, latencyMs),
      },
      limits,
      server: {
        region: process.env.VERCEL_REGION ?? 'lokal',
        rssBytes,
        limitMb,
        uptimeSeconds: Math.round(process.uptime()),
        ...assessServer({ rssBytes, limitMb }),
      },
      links: {
        supabase: ref ? `https://supabase.com/dashboard/project/${ref}/reports/database` : null,
        vercel: 'https://vercel.com/basar-neukirchens-projects/basar_neukirchen/usage',
      },
    });
  } catch (error) {
    console.error('GET /api/admin/status error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
