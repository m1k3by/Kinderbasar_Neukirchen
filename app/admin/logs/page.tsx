'use client';

import { useState, useEffect, useMemo } from 'react';
import Header from '../../components/Header';
import { getNavLinks } from '../../lib/navLinks';

interface ErrorLogRow {
  id: string;
  source: 'SERVER' | 'CLIENT';
  route: string | null;
  message: string;
  stack: string | null;
  sellerId: number | null;
  role: string | null;
  userAgent: string | null;
  resolved: boolean;
  createdAt: string;
}

interface Aggregates {
  total: number;
  unresolved: number;
  clientErrors: number;
}

const SOURCE_LABEL: Record<string, string> = { SERVER: 'Server', CLIENT: 'Browser' };
const SOURCE_BADGE: Record<string, string> = {
  SERVER: 'bg-red-100 text-red-700',
  CLIENT: 'bg-orange-100 text-orange-700',
};

export default function LogsPage() {
  const [logs, setLogs] = useState<ErrorLogRow[]>([]);
  const [aggregates, setAggregates] = useState<Aggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/admin/errors');
      if (!res.ok) throw new Error('Fehler beim Laden der Fehlerliste');
      const data = await res.json();
      setLogs(data.logs ?? []);
      setAggregates(data.aggregates ?? null);
    } catch {
      setError('Fehler beim Laden der Fehlerliste');
    } finally {
      setLoading(false);
    }
  }

  async function setResolved(id: string, resolved: boolean) {
    const res = await fetch('/api/admin/errors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, resolved }),
    });
    if (!res.ok) {
      setError('Der Eintrag konnte nicht geändert werden');
      return;
    }
    await fetchLogs();
  }

  async function deleteResolved() {
    if (!confirm('Alle als erledigt markierten Einträge löschen?')) return;
    const res = await fetch('/api/admin/errors?resolved=1', { method: 'DELETE' });
    if (!res.ok) {
      setError('Die Einträge konnten nicht gelöscht werden');
      return;
    }
    await fetchLogs();
  }

  const visibleLogs = useMemo(
    () => (onlyOpen ? logs.filter((l) => !l.resolved) : logs),
    [logs, onlyOpen]
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <Header links={getNavLinks({ role: 'admin' }, 'logs')} />

      <div className="max-w-6xl mx-auto p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Fehlerprotokoll</h1>
          <p className="text-gray-600">
            Alles, was auf dem Server oder im Browser eines Nutzers schiefgegangen ist – neueste zuerst.
            Einträge älter als 30 Tage werden täglich automatisch entfernt.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {aggregates && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow p-5 text-center">
              <div className="text-3xl font-bold text-gray-800">{aggregates.total}</div>
              <div className="text-sm text-gray-500 mt-1">Fehler gesamt</div>
            </div>
            <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow p-5 text-center">
              <div className="text-3xl font-bold text-red-600">{aggregates.unresolved}</div>
              <div className="text-sm text-gray-500 mt-1">Offen</div>
            </div>
            <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow p-5 text-center">
              <div className="text-3xl font-bold text-orange-600">{aggregates.clientErrors}</div>
              <div className="text-sm text-gray-500 mt-1">Im Browser</div>
            </div>
          </div>
        )}

        <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-semibold text-gray-800">Fehler ({visibleLogs.length})</h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyOpen}
                  onChange={(e) => setOnlyOpen(e.target.checked)}
                  className="w-4 h-4 accent-yellow-500"
                />
                Nur offene
              </label>
              <button
                onClick={deleteResolved}
                className="text-sm px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Erledigte löschen
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2">Lade Fehlerprotokoll…</p>
            </div>
          ) : visibleLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p className="text-lg">Keine Einträge</p>
              <p className="text-sm mt-1">
                {onlyOpen ? 'Kein offener Fehler – alles erledigt.' : 'Bisher ist nichts schiefgegangen.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                    <th className="px-4 py-2 font-medium">Zeit</th>
                    <th className="px-4 py-2 font-medium">Quelle</th>
                    <th className="px-4 py-2 font-medium">Stelle</th>
                    <th className="px-4 py-2 font-medium">Meldung</th>
                    <th className="px-4 py-2 font-medium">Nutzer</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleLogs.map((log) => (
                    <tr
                      key={log.id}
                      className={`align-top hover:bg-gray-50 transition-colors ${log.resolved ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${SOURCE_BADGE[log.source] ?? 'bg-gray-100 text-gray-600'}`}>
                          {SOURCE_LABEL[log.source] ?? log.source}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 max-w-[14rem] break-words">{log.route ?? '–'}</td>
                      <td className="px-4 py-2.5 text-gray-800 max-w-md break-words">
                        {log.message}
                        {log.stack && (
                          <>
                            <button
                              onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                              className="ml-2 text-xs text-blue-600 hover:underline whitespace-nowrap"
                            >
                              {expanded === log.id ? 'Details ausblenden' : 'Details'}
                            </button>
                            {expanded === log.id && (
                              <pre className="mt-2 p-2 bg-gray-900 text-gray-100 text-xs rounded overflow-x-auto whitespace-pre-wrap">
                                {log.stack}
                                {log.userAgent ? `\n\n${log.userAgent}` : ''}
                              </pre>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                        {log.sellerId ? `Nr. ${log.sellerId}` : <span className="text-gray-300">–</span>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <button
                          onClick={() => setResolved(log.id, !log.resolved)}
                          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          {log.resolved ? 'Wieder öffnen' : 'Erledigt'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
