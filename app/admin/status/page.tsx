'use client';

import { useState, useEffect, type ReactNode } from 'react';
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
    dbSizeUsage: number;
    dbSizeLevel: Level;
  };
  limits: {
    basars: {
      id: string;
      title: string;
      status: string;
      isTest: boolean;
      maxSellers: number;
      activeSellers: number;
      scanArticles: number;
      sales: number;
      scanCacheBytes: number;
      scanCacheUsage: number;
      scanCacheLevel: Level;
      salesUsage: number;
      salesLevel: Level;
      sellerUsage: number;
      sellerLevel: Level;
    }[];
    mail: {
      pending: number;
      failed: number;
      oldestPendingMinutes: number | null;
      pendingLevel: Level;
      failedLevel: Level;
    };
    sellerNumbersUsed: number;
    sellerNumberUsage: number;
    sellerNumberLevel: Level;
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

const MB = 1024 * 1024;

// Farben wie Grafana; als Konstanten, damit Gauge, Stat und Panels dieselben nutzen.
const COLOR: Record<Level, string> = { ok: '#73bf69', warn: '#fade2a', bad: '#f2495c' };
const BLUE = '#5794f2';
const TRACK = '#2c3235';
const MUTED = '#8e8e8e';
const LINK = '#6e9fff';
const LEVEL_TEXT: Record<Level, string> = { ok: 'ok', warn: 'Warnung', bad: 'kritisch' };

// Quelle: https://vercel.com/docs/functions/usage-and-pricing (Stand 11/2026)
const HOBBY_QUOTA: { name: string; value: string; note?: string }[] = [
  { name: 'Active CPU', value: '4 h', note: 'nur echte Rechenzeit, Warten auf I/O zählt nicht' },
  { name: 'Provisioned Memory', value: '360 GB-h', note: 'Speicher × Laufzeit der Instanz, Warten zählt mit' },
  { name: 'Aufrufe', value: '1 Mio.' },
  { name: 'Max. Laufzeit je Funktion', value: '300 s' },
  { name: 'Max. Antwortgröße', value: '4,5 MB' },
];

const num = (v: number, digits = 0) =>
  v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

// 1.234.567 passt nicht in eine Kachel → „1,2 Mio.“; die genaue Zahl steht darunter.
const compact = (v: number) => v.toLocaleString('de-DE', { notation: 'compact', maximumFractionDigits: 1 });

function Panel({
  title,
  hint,
  className = '',
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-md border border-[#2c3235] bg-[#181b1f] p-3 min-w-0 ${className}`}>
      <h3 className="flex items-center gap-1 text-xs uppercase tracking-wide text-[#8e8e8e]">
        <span className="truncate">{title}</span>
        {hint && (
          <span title={hint} aria-label={hint} className="cursor-help normal-case">
            ⓘ
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

function Stat({ title, value, level, hint, sub }: { title: string; value: string; level?: Level; hint?: string; sub?: string }) {
  return (
    <Panel title={title} hint={hint}>
      <div
        className="mt-2 text-3xl md:text-4xl font-semibold tabular-nums break-words"
        style={{ color: level ? COLOR[level] : BLUE }}
        title={level ? LEVEL_TEXT[level] : undefined}
        aria-label={level ? `${value}, ${LEVEL_TEXT[level]}` : undefined}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-[#8e8e8e] tabular-nums">{sub}</div>}
    </Panel>
  );
}

const STATUS_TEXT: Record<string, string> = { DRAFT: 'Entwurf', OPEN: 'Offen', ACTIVE: 'Aktiv', CLOSED: 'Beendet' };

const ageText = (minutes: number) => (minutes < 60 ? `${num(minutes)} Min.` : `${num(minutes / 60, 1)} Std.`);

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h2 className="mt-5 mb-2 flex items-center gap-2 text-sm font-medium text-[#d8d9da]">
        <span className="text-[#8e8e8e]">▾</span>
        {title}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">{children}</div>
    </>
  );
}

const CX = 60;
const CY = 60;
const R = 48;
const point = (t: number, r: number) => [CX + r * Math.cos(Math.PI * (1 - t)), CY - r * Math.sin(Math.PI * (1 - t))];

/** Halbkreis-Gauge. value 0..1 oder null (grauer Bogen ohne Füllung). */
function Gauge({
  title,
  hint,
  value,
  level,
  text,
  detail,
  ticks = [],
}: {
  title: string;
  hint?: string;
  value: number | null;
  level: Level;
  text: string;
  detail: string;
  ticks?: number[];
}) {
  const arc = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  const fill = value === null ? 0 : Math.min(1, Math.max(0, value));
  const color = value === null ? MUTED : COLOR[level];
  const label = value === null ? text : `${text}, ${LEVEL_TEXT[level]}`;
  return (
    <Panel title={title} hint={hint} className="col-span-2">
      <div className="mx-auto mt-1 max-w-[260px]" title={label} role="img" aria-label={`${title}: ${label}. ${detail}`}>
        <svg viewBox="0 0 120 74" className="w-full h-auto" aria-hidden="true">
          <path d={arc} fill="none" stroke={TRACK} strokeWidth={9} pathLength={100} />
          {fill > 0 && (
            <path d={arc} fill="none" stroke={color} strokeWidth={9} pathLength={100} strokeDasharray={`${fill * 100} 100`} />
          )}
          {ticks.map((t) => {
            const [x1, y1] = point(t, R - 7);
            const [x2, y2] = point(t, R + 6);
            return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d8d9da" strokeWidth={0.8} />;
          })}
          <text x={CX} y={CY - 6} textAnchor="middle" fontSize={17} fontWeight={600} fill={color} className="tabular-nums">
            {text}
          </text>
          <text x={CX} y={CY + 9} textAnchor="middle" fontSize={7} fill={MUTED} className="tabular-nums">
            {detail}
          </text>
        </svg>
      </div>
    </Panel>
  );
}

function Refresh({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function Skeleton() {
  return (
    <div className="mt-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2" aria-busy="true" aria-label="Messe…">
      {[2, 2, 1, 1, 1, 1, 1, 1].map((span, i) => (
        <div
          key={i}
          className={`animate-pulse rounded-md border border-[#2c3235] bg-[#181b1f] ${span === 2 ? 'col-span-2 h-40' : 'h-24'}`}
        />
      ))}
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
    <div className="min-h-screen bg-[#111217] text-[#d8d9da]">
      <Header links={getNavLinks({ role: 'admin' }, 'status')} />

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-80">
            <h1 className="text-xl font-semibold">Systemstatus</h1>
            <p className="mt-1 text-xs text-[#8e8e8e]">
              Momentaufnahme beim Öffnen der Seite. Es wird nicht automatisch aktualisiert – jede Messung kostet
              einen Funktionsaufruf und eine kleine Datenbankabfrage.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <span className="text-xs text-[#8e8e8e] tabular-nums">
                Gemessen um{' '}
                {new Date(data.checkedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <button
              onClick={measure}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md border border-[#2c3235] bg-[#22252b] px-3 py-1.5 text-sm hover:bg-[#2c3235] disabled:opacity-50 transition-colors"
            >
              <Refresh spinning={loading} />
              Neu messen
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="mt-4 rounded-md border border-[#f2495c] bg-[#f2495c]/10 px-4 py-3 text-sm text-[#f2495c]">
            {error}
          </div>
        )}

        {loading && !data ? (
          <Skeleton />
        ) : (
          db &&
          server &&
          data && (
            <>
              <Row title="App-Grenzen">
                {data.limits.basars.length === 0 && (
                  <Panel title="Kein laufender Basar" className="col-span-2 md:col-span-4 lg:col-span-6">
                    <p className="mt-2 text-sm text-[#8e8e8e]">Es gibt keinen nicht archivierten Basar.</p>
                  </Panel>
                )}
                {data.limits.basars.map((b) => (
                  <div key={b.id} className="col-span-2 md:col-span-4 lg:col-span-6">
                    <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm text-[#d8d9da]">
                      {b.title}
                      <span className="rounded border border-[#2c3235] px-1.5 py-0.5 text-xs text-[#8e8e8e]">
                        {STATUS_TEXT[b.status] ?? b.status}
                      </span>
                      {b.isTest && <span className="rounded border border-[#fade2a] px-1.5 py-0.5 text-xs text-[#fade2a]">Test</span>}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                      <Gauge
                        title="Kassen-Katalog"
                        hint="Geschätzt. Die Kasse lädt alle Artikel in einer Antwort; über 4,5 MB lehnt Vercel sie ab und die Kasse kann nicht mehr offline scannen."
                        value={b.scanCacheUsage}
                        level={b.scanCacheLevel}
                        text={`${num(b.scanCacheUsage * 100)} %`}
                        detail={`~${num(b.scanCacheBytes / MB, 1)} / 4,5 MB · ${num(b.scanArticles)} Artikel`}
                        ticks={[0.7, 0.9]}
                      />
                      <Gauge
                        title="Verkäufe in Admin-Liste"
                        hint="Ab 5.000 Verkäufen zeigen ‚Alle Verkäufe‘ und die Kassenvorgänge nicht mehr alles."
                        value={b.salesUsage}
                        level={b.salesLevel}
                        text={`${num(b.salesUsage * 100)} %`}
                        detail={`${num(b.sales)} / 5.000`}
                        ticks={[0.8, 1]}
                      />
                      <Stat
                        title="Plätze"
                        value={`${num(b.activeSellers)} / ${num(b.maxSellers)}`}
                        level={b.sellerLevel}
                        hint="Aktive Teilnehmer gegen die Platzgrenze. Ausgebucht ist kein Fehler."
                      />
                    </div>
                  </div>
                ))}
                <Stat
                  title="Mails wartend"
                  value={num(data.limits.mail.pending)}
                  level={data.limits.mail.pendingLevel}
                  sub={data.limits.mail.oldestPendingMinutes === null ? undefined : `älteste seit ${ageText(data.limits.mail.oldestPendingMinutes)}`}
                />
                <Stat title="Mails fehlgeschlagen" value={num(data.limits.mail.failed)} level={data.limits.mail.failedLevel} />
                <Gauge
                  title="Verkäufernummern"
                  value={data.limits.sellerNumberUsage}
                  level={data.limits.sellerNumberLevel}
                  text={`${num(data.limits.sellerNumberUsage * 100)} %`}
                  detail={`${num(data.limits.sellerNumbersUsed)} / 9.000`}
                  ticks={[0.8, 0.95]}
                />
              </Row>

              <Row title="Datenbank">
                <Gauge
                  title="Verbindungsauslastung"
                  value={db.connectionUsage}
                  level={db.connectionLevel}
                  text={`${num(db.connectionUsage * 100)} %`}
                  detail={`${db.connections} / ${db.maxConnections - db.reservedConnections} Verbindungen`}
                  ticks={[0.7, 0.9]}
                />
                <Gauge
                  title="Cache-Trefferquote"
                  hint="unter 99 % muss oft von der Platte gelesen werden"
                  value={db.cacheHitRatio}
                  level={db.cacheLevel}
                  text={db.cacheHitRatio === null ? '–' : `${num(db.cacheHitRatio * 100, 2)} %`}
                  detail={db.cacheHitRatio === null ? 'noch keine Lesezugriffe' : `${num(db.blocksHit)} Treffer / ${num(db.blocksRead)} Platte`}
                  ticks={[0.95, 0.99]}
                />
                <Gauge
                  title="Datenbankgröße"
                  hint="Supabase Free: 500 MB. Darüber droht Supabase mit Einschränkungen (Fair Use)."
                  value={db.dbSizeUsage}
                  level={db.dbSizeLevel}
                  text={`${num(db.dbSizeUsage * 100)} %`}
                  detail={`${num(db.dbBytes / MB, 1)} / 500 MB`}
                  ticks={[0.7, 0.9]}
                />
                <Stat title="Davon aktiv" value={num(db.active)} />
                <Stat title="Hängende Transaktionen" level={db.idleInTransactionLevel} value={num(db.idleInTransaction)} />
                <Stat title="Wartet auf Sperre" level={db.waitingOnLockLevel} value={num(db.waitingOnLock)} />
                <Stat title="Längste Abfrage" level={db.longestQueryLevel} value={`${num(db.longestQuerySeconds, 1)} s`} />
                <Stat title="Antwortzeit DB" level={db.latencyLevel} value={`${num(db.latencyMs)} ms`} />
                <Stat title="Deadlocks" level={db.deadlockLevel} value={num(db.deadlocks)} />
                <Stat title="Auslagerung auf Platte" value={`${num(db.tempBytes / MB, 1)} MB`} />
                <Stat title="Commits" value={compact(db.commits)} sub={num(db.commits)} />
                <Stat title="Rollbacks" value={compact(db.rollbacks)} sub={num(db.rollbacks)} />
              </Row>
              <p className="mt-2 text-xs text-[#8e8e8e]">
                Zähler (Cache, Deadlocks, Auslagerung, Commits) laufen seit{' '}
                {db.statsReset ? new Date(db.statsReset).toLocaleDateString('de-DE') : 'Serverstart'}.
              </p>

              <Row title="Server · Vercel Functions">
                <Gauge
                  title="RAM"
                  value={server.limitMb && server.memoryUsage !== null ? server.memoryUsage : null}
                  level={server.memoryLevel}
                  text={
                    server.limitMb && server.memoryUsage !== null
                      ? `${num(server.memoryUsage * 100)} %`
                      : `${num(server.rssBytes / MB)} MB`
                  }
                  detail={
                    server.limitMb && server.memoryUsage !== null
                      ? `${num(server.rssBytes / MB)} / ${num(server.limitMb)} MB`
                      : 'Grenze unbekannt'
                  }
                  ticks={[0.8, 0.9]}
                />
                <Stat title="Region" value={server.region} />
                <Stat title="Instanz-Laufzeit" value={`${num(server.uptimeSeconds / 60)} Min.`} />
                <Panel title="Rechenmodell: Fluid Compute" className="col-span-2 md:col-span-4 lg:col-span-2">
                  <p className="mt-2 text-xs leading-relaxed">
                    Eine Funktionsinstanz bearbeitet mehrere Anfragen gleichzeitig; während eine Anfrage auf die
                    Datenbank wartet, rechnet sie an der nächsten. Instanzen starten nach Bedarf; RAM, Region und
                    Laufzeit gelten nur für die Instanz, die gerade geantwortet hat.
                  </p>
                  <h4 className="mt-3 text-xs uppercase tracking-wide text-[#8e8e8e]">Hobby-Kontingent pro Monat</h4>
                  <table className="mt-1 w-full text-xs">
                    <tbody>
                      {HOBBY_QUOTA.map((q) => (
                        <tr key={q.name} className="border-t border-[#2c3235] align-top">
                          <td className="py-1 pr-2">
                            {q.name}
                            {q.note && <span className="block text-[#8e8e8e]">{q.note}</span>}
                          </td>
                          <td className="py-1 text-right whitespace-nowrap tabular-nums" style={{ color: BLUE }}>
                            {q.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <a
                    href={data.links.vercel}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-xs hover:underline"
                    style={{ color: LINK }}
                  >
                    Aktueller Verbrauch → Vercel Usage
                  </a>
                </Panel>
              </Row>

              <Row title="Nicht hier messbar">
                <Panel title="Externe Dashboards" className="col-span-2 md:col-span-4 lg:col-span-6">
                  <ul className="mt-2 space-y-1 text-sm">
                    <li>
                      CPU, RAM und Platten-I/O der Datenbank →{' '}
                      {data.links.supabase ? (
                        <a href={data.links.supabase} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: LINK }}>
                          Supabase-Dashboard
                        </a>
                      ) : (
                        'Supabase-Dashboard'
                      )}
                    </li>
                    <li>
                      Active CPU, Provisioned Memory, Aufrufe →{' '}
                      <a href={data.links.vercel} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: LINK }}>
                        Vercel-Dashboard → Usage
                      </a>
                    </li>
                  </ul>
                </Panel>
              </Row>
            </>
          )
        )}
      </div>
    </div>
  );
}
