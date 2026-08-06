'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '../../../components/Header';
import { getNavLinks, type NavUser } from '../../../lib/navLinks';

interface Basar {
  id: string;
  title: string;
  eventDate: string;
  location?: string;
  status: 'DRAFT' | 'OPEN' | 'ACTIVE' | 'CLOSED';
  isArchived: boolean;
  _count?: { basarSellers: number };
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Entwurf', OPEN: 'Offen', ACTIVE: 'Aktiv', CLOSED: 'Geschlossen',
};

export default function BasarArchivPage() {
  const [basars, setBasars] = useState<Basar[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  // Default to admin nav until /api/me resolves – see app/admin/basars/page.tsx for why
  // this matters (cashiers can also reach /admin/basars/**).
  const [navUser, setNavUser] = useState<NavUser>({ role: 'admin' });

  useEffect(() => { loadArchive(); loadMe(); }, []);

  async function loadMe() {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) return;
      const me = await res.json();
      if (me.role === 'admin') {
        setNavUser({ role: 'admin' });
      } else {
        setNavUser({ role: me.isEmployee ? 'employee' : 'seller', isEmployee: me.isEmployee, isCashier: me.isCashier });
      }
    } catch { /* ignore – keep admin default */ }
  }

  async function loadArchive() {
    setLoading(true);
    try {
      const res = await fetch('/api/basars?archived=true');
      if (res.ok) {
        const data = await res.json();
        setBasars(data.basars);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleUnarchive(basar: Basar) {
    if (!confirm(`"${basar.title}" aus dem Archiv wiederherstellen?`)) return;
    const res = await fetch(`/api/basars/${basar.id}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    });
    if (res.ok) {
      setMessage(`"${basar.title}" wurde wiederhergestellt`);
      loadArchive();
    } else {
      const data = await res.json();
      setMessage(data.error || 'Fehler');
    }
    setTimeout(() => setMessage(''), 4000);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header links={getNavLinks(navUser, 'archiv')} />
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Basare – Archiv</h1>
            <p className="text-sm text-gray-500 mt-1">Archivierte Basare sind in der Hauptliste nicht mehr sichtbar.</p>
          </div>
          <Link href="/admin/basars"
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors text-sm">
            ← Zur Basarliste
          </Link>
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg font-medium ${message.includes('wiederhergestellt') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {message}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500">Laden…</div>
        ) : basars.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Das Archiv ist leer.</div>
        ) : (
          <div className="space-y-3">
            {basars.map(basar => (
              <div key={basar.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 opacity-80">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-0.5">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                        {STATUS_LABELS[basar.status]}
                      </span>
                      <h2 className="text-base font-bold text-gray-600 truncate">{basar.title}</h2>
                    </div>
                    <p className="text-sm text-gray-400">
                      {new Date(basar.eventDate).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                      {basar.location && ` · ${basar.location}`}
                      {` · ${basar._count?.basarSellers ?? 0} Verkäufer`}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Link href={`/admin/basars/${basar.id}`}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium rounded-lg transition-colors">
                      Details
                    </Link>
                    <Link href={`/admin/basars/${basar.id}/abrechnung`}
                      className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm font-medium rounded-lg transition-colors">
                      Abrechnung
                    </Link>
                    <button onClick={() => handleUnarchive(basar)}
                      className="px-3 py-1.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 text-sm font-medium rounded-lg transition-colors">
                      Wiederherstellen
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
