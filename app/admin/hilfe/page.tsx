'use client';

import { useState, useEffect, useMemo } from 'react';
import Header from '../../components/Header';
import { getNavLinks } from '../../lib/navLinks';

interface ChatLogRow {
  id: string;
  sellerId: number | null;
  role: string;
  question: string;
  matchedFaqId: string | null;
  resultType: 'answer' | 'suggestions' | 'none' | string;
  helpful: boolean | null;
  createdAt: string;
}

interface Aggregates {
  total: number;
  unanswered: number;
  unhelpful: number;
}

const RESULT_LABEL: Record<string, string> = {
  answer: 'Antwort',
  suggestions: 'Vorschläge',
  none: 'Keine Antwort',
};

const RESULT_BADGE: Record<string, string> = {
  answer: 'bg-green-100 text-green-700',
  suggestions: 'bg-yellow-100 text-yellow-700',
  none: 'bg-red-100 text-red-700',
};

export default function HilfeStatistikPage() {
  const [logs, setLogs] = useState<ChatLogRow[]>([]);
  const [aggregates, setAggregates] = useState<Aggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyUnanswered, setOnlyUnanswered] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/chat-feedback');
      if (!res.ok) throw new Error('Fehler beim Laden der Hilfe-Statistik');
      const data = await res.json();
      setLogs(data.logs ?? []);
      setAggregates(data.aggregates ?? null);
    } catch (err) {
      setError('Fehler beim Laden der Hilfe-Statistik');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const visibleLogs = useMemo(
    () => (onlyUnanswered ? logs.filter((l) => l.resultType === 'none') : logs),
    [logs, onlyUnanswered]
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <Header
        links={getNavLinks({ role: 'admin' }, 'hilfe')}
      />

      <div className="max-w-6xl mx-auto p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Hilfe-Assistent – Statistik</h1>
          <p className="text-gray-600">Fragen, die Verkäufer, Mitarbeiter und Kassierer dem Hilfe-Assistenten gestellt haben</p>
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
              <div className="text-sm text-gray-500 mt-1">Fragen gesamt</div>
            </div>
            <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow p-5 text-center">
              <div className="text-3xl font-bold text-red-600">{aggregates.unanswered}</div>
              <div className="text-sm text-gray-500 mt-1">Unbeantwortet</div>
            </div>
            <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow p-5 text-center">
              <div className="text-3xl font-bold text-orange-600">{aggregates.unhelpful}</div>
              <div className="text-sm text-gray-500 mt-1">Nicht hilfreich</div>
            </div>
          </div>
        )}

        <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-semibold text-gray-800">
              Letzte Fragen ({visibleLogs.length})
            </h2>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyUnanswered}
                onChange={(e) => setOnlyUnanswered(e.target.checked)}
                className="w-4 h-4 accent-yellow-500"
              />
              Nur Unbeantwortet
            </label>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2">Lade Hilfe-Statistik…</p>
            </div>
          ) : visibleLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p className="text-lg">Keine Einträge</p>
              <p className="text-sm mt-1">
                {onlyUnanswered ? 'Keine unbeantworteten Fragen vorhanden.' : 'Noch niemand hat den Hilfe-Assistenten gefragt.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                    <th className="px-4 py-2 font-medium">Zeit</th>
                    <th className="px-4 py-2 font-medium">Rolle</th>
                    <th className="px-4 py-2 font-medium">Frage</th>
                    <th className="px-4 py-2 font-medium">Ergebnis</th>
                    <th className="px-4 py-2 font-medium">Hilfreich</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap capitalize">{log.role}</td>
                      <td className="px-4 py-2.5 text-gray-800 max-w-md">{log.question}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${RESULT_BADGE[log.resultType] ?? 'bg-gray-100 text-gray-600'}`}>
                          {RESULT_LABEL[log.resultType] ?? log.resultType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {log.helpful === true ? '👍' : log.helpful === false ? '👎' : <span className="text-gray-300">–</span>}
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
