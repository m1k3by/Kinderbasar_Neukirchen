'use client';

import { useState, useEffect } from 'react';
import Header from '../../components/Header';
import { getNavLinks } from '../../lib/navLinks';

type Level = 'ok' | 'warn' | 'bad';

interface StatusResponse {
  checkedAt: string;
  db: {
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
    statsReset: string | null;
    latencyMs: number;
    connectionUsage: number;
    connectionLevel: Level;
    cacheHitRatio: number | null;
    cacheLevel: Level;
    idleInTransactionLevel: Level;
    waitingOnLockLevel: Level;
    longestQueryLevel: Level;
    deadlockLevel: Level;
    latencyLevel: Level;
  };
  server: {
    region: string;
    rssBytes: number;
    limitMb: number | null;
    uptimeSeconds: number;
    memoryUsage: number | null;
    memoryLevel: Level;
  };
  links: { supabase: string | null; vercel: string };
}

const DOT: Record<Level, string> = { ok: 'bg-green-500', warn: 'bg-yellow-400', bad: 'bg-red-500' };
const MB = 1024 * 1024;

const num = (v: number, digits = 0) =>
  v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function Card({ title, value, level, hint }: { title: string; value: string; level?: Level; hint?: string }) {
  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow p-5">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        {level && <span className={`inline-block w-3 h-3 rounded-full ${DOT[level]}`} aria-label={level} />}
        {title}
      </div>
      <div className="text-2xl font-bold text-gray-800 mt-1">{value}</div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}

export default function StatusPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    measure();
  }, []);

  async function measure() {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/admin/status');
      if (!res.ok) throw new Error('Status konnte nicht geladen werden');
      setData(await res.json());
    } catch {
      setError('Status konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }

  const db = data?.db;
  const server = data?.server;

  return (
    <div className="min-h-screen bg-gray-100">
      <Header links={getNavLinks({ role: 'admin' }, 'status')} />

      <div className="max-w-6xl mx-auto p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Systemstatus</h1>
          <p className="text-gray-600">
            Momentaufnahme beim Öffnen der Seite. Es wird nicht automatisch aktualisiert – jede Messung kostet
            einen Funktionsaufruf und eine kleine Datenbankabfrage.
          </p>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={measure}
            disabled={loading}
            className="px-4 py-2 rounded-md bg-yellow-500 text-white font-medium hover:bg-yellow-600 disabled:opacity-50 transition-colors"
          >
            Neu messen
          </button>
          {data && (
            <span className="text-sm text-gray-500">
              Gemessen um {new Date(data.checkedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>
        )}

        {loading && !data ? (
          <div className="p-8 text-center text-gray-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2">Messe…</p>
          </div>
        ) : (
          db && server && data && (
            <>
              <h2 className="text-xl font-semibold text-gray-800 mb-3">Datenbank</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-2">
                <Card
                  title="Verbindungen"
                  level={db.connectionLevel}
                  value={`${db.connections} / ${db.maxConnections - db.reservedConnections} (${num(db.connectionUsage * 100)} %)`}
                  hint={`davon aktiv: ${db.active}`}
                />
                <Card title="Hängende Transaktionen" level={db.idleInTransactionLevel} value={num(db.idleInTransaction)} />
                <Card title="Wartet auf Sperre" level={db.waitingOnLockLevel} value={num(db.waitingOnLock)} />
                <Card title="Längste laufende Abfrage" level={db.longestQueryLevel} value={`${num(db.longestQuerySeconds, 1)} s`} />
                <Card
                  title="Cache-Trefferquote"
                  level={db.cacheLevel}
                  value={db.cacheHitRatio === null ? '–' : `${num(db.cacheHitRatio * 100, 2)} %`}
                  hint="unter 99 % muss oft von der Platte gelesen werden"
                />
                <Card title="Antwortzeit DB" level={db.latencyLevel} value={`${num(db.latencyMs)} ms`} />
                <Card title="Deadlocks" level={db.deadlockLevel} value={num(db.deadlocks)} />
                <Card title="Datenbankgröße" value={`${num(db.dbBytes / MB, 1)} MB`} />
                <Card title="Auslagerung auf Platte" value={`${num(db.tempBytes / MB, 1)} MB`} />
                <Card title="Commits / Rollbacks" value={`${num(db.commits)} / ${num(db.rollbacks)}`} />
              </div>
              <p className="text-xs text-gray-500 mb-8">
                Zähler (Cache, Deadlocks, Auslagerung, Commits) laufen seit{' '}
                {db.statsReset ? new Date(db.statsReset).toLocaleDateString('de-DE') : 'Serverstart'}.
              </p>

              <h2 className="text-xl font-semibold text-gray-800 mb-3">Server (diese Instanz)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-2">
                <Card title="Region" value={server.region} />
                <Card
                  title="RAM"
                  level={server.memoryLevel}
                  value={
                    server.limitMb && server.memoryUsage !== null
                      ? `${num(server.rssBytes / MB)} MB / ${num(server.limitMb)} MB (${num(server.memoryUsage * 100)} %)`
                      : `${num(server.rssBytes / MB)} MB`
                  }
                />
                <Card title="Laufzeit der Instanz" value={`${num(server.uptimeSeconds / 60)} Minuten`} />
              </div>
              <p className="text-xs text-gray-500 mb-8">
                Vercel startet Instanzen nach Bedarf; diese Werte gelten nur für die Instanz, die gerade geantwortet hat.
              </p>

              <h2 className="text-xl font-semibold text-gray-800 mb-3">Nicht hier messbar</h2>
              <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow p-5 space-y-2 text-sm text-gray-700">
                <p>
                  CPU, RAM und Platten-I/O der Datenbank →{' '}
                  {data.links.supabase ? (
                    <a href={data.links.supabase} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      Supabase-Dashboard
                    </a>
                  ) : (
                    'Supabase-Dashboard'
                  )}
                </p>
                <p>
                  Kontingent Rechenzeit (Active CPU), Aufrufe, Datentransfer →{' '}
                  <a href={data.links.vercel} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    Vercel-Dashboard → Usage
                  </a>
                </p>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
