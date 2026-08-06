'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import { getNavLinks, type NavUser } from '../../lib/navLinks';
import BasarFormFields, { EMPTY_BASAR_FORM, type BasarFormState } from './BasarFormFields';

interface Basar {
  id: string;
  title: string;
  description?: string;
  eventDate: string;
  location?: string;
  maxSellers: number;
  maxArticlesPerSeller: number;
  commissionPercent: number;
  entryFee: number;
  status: 'DRAFT' | 'OPEN' | 'ACTIVE' | 'CLOSED';
  isArchived: boolean;
  _count?: { basarSellers: number };
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Entwurf', OPEN: 'Offen', ACTIVE: 'Aktiv', CLOSED: 'Geschlossen',
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  OPEN: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-green-100 text-green-700',
  CLOSED: 'bg-red-100 text-red-700',
};
const NEXT_STATUS_LABEL: Record<string, string> = {
  DRAFT: '→ Öffnen', OPEN: '→ Aktivieren', ACTIVE: '→ Schließen',
};

export default function AdminBasarsPage() {
  const [basars, setBasars] = useState<Basar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<BasarFormState>(EMPTY_BASAR_FORM);
  // Default to admin nav until /api/me resolves – this page is admin-focused, but
  // /admin/basars/** is also reachable by cashiers (see middleware.ts), so a cashier's
  // nav must be corrected as soon as we know who's asking.
  const [navUser, setNavUser] = useState<NavUser>({ role: 'admin' });

  useEffect(() => { loadBasars(); loadMe(); }, []);

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

  async function loadBasars() {
    setLoading(true);
    try {
      const res = await fetch('/api/basars');
      if (res.ok) {
        const data = await res.json();
        setBasars(data.basars);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/basars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setMessage('Basar erfolgreich angelegt');
        setShowForm(false);
        setForm(EMPTY_BASAR_FORM);
        loadBasars();
      } else {
        const data = await res.json();
        setMessage(data.error || 'Fehler beim Anlegen');
      }
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 4000);
    }
  }

  async function handleAdvanceStatus(basar: Basar) {
    if (!confirm(`Status von "${basar.title}" ändern: ${STATUS_LABELS[basar.status]} → ${STATUS_LABELS[({ DRAFT: 'OPEN', OPEN: 'ACTIVE', ACTIVE: 'CLOSED', CLOSED: 'CLOSED' } as Record<string, string>)[basar.status]]}?`)) return;
    const res = await fetch(`/api/basars/${basar.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) loadBasars();
    else {
      const data = await res.json();
      setMessage(data.error || 'Fehler');
      setTimeout(() => setMessage(''), 4000);
    }
  }

  async function handleArchive(basar: Basar) {
    if (!confirm(`"${basar.title}" archivieren? Der Basar verschwindet aus der Liste und ist nur noch im Archiv sichtbar.`)) return;
    const res = await fetch(`/api/basars/${basar.id}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    if (res.ok) {
      setMessage(`"${basar.title}" wurde archiviert`);
      loadBasars();
    } else {
      const data = await res.json();
      setMessage(data.error || 'Fehler');
    }
    setTimeout(() => setMessage(''), 4000);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header links={getNavLinks(navUser, 'basare')} />
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Basare verwalten</h1>
          {navUser.role === 'admin' && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold rounded-lg transition-colors"
            >
              {showForm ? 'Abbrechen' : '+ Neuer Basar'}
            </button>
          )}
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg font-medium ${message.includes('erfolgreich') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {message}
          </div>
        )}

        {showForm && navUser.role === 'admin' && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Neuer Basar</h2>
            <form onSubmit={handleCreate} className="grid md:grid-cols-2 gap-4">
              <BasarFormFields form={form} setForm={setForm} />
              <div className="md:col-span-2 flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Abbrechen</button>
                <button type="submit" disabled={saving} className="px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Speichern…' : 'Basar anlegen'}
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500">Laden…</div>
        ) : basars.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Noch keine Basare angelegt.</div>
        ) : (
          <div className="space-y-4">
            {basars.map(basar => (
              <div key={basar.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[basar.status]}`}>
                        {STATUS_LABELS[basar.status]}
                      </span>
                      <h2 className="text-lg font-bold text-gray-800 truncate">{basar.title}</h2>
                    </div>
                    <p className="text-sm text-gray-500">
                      {new Date(basar.eventDate).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                      {basar.location && ` · ${basar.location}`}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {basar._count?.basarSellers ?? 0} Verkäufer · Max. {basar.maxArticlesPerSeller} Artikel · {basar.commissionPercent}% Provision · {Number(basar.entryFee).toFixed(2)} € Gebühr
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-2 flex-wrap justify-end">
                    <Link href={`/admin/basars/${basar.id}`}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors">
                      Details
                    </Link>
                    {basar.status === 'ACTIVE' && (
                      <Link href={`/admin/basars/${basar.id}/kasse`}
                        className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors">
                        Kasse
                      </Link>
                    )}
                    {basar.status === 'CLOSED' && (
                      <Link href={`/admin/basars/${basar.id}/abrechnung`}
                        className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
                        Abrechnung
                      </Link>
                    )}
                    {navUser.role === 'admin' && NEXT_STATUS_LABEL[basar.status] && (
                      <button onClick={() => handleAdvanceStatus(basar)}
                        className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-gray-900 text-sm font-medium rounded-lg transition-colors">
                        {NEXT_STATUS_LABEL[basar.status]}
                      </button>
                    )}
                    {navUser.role === 'admin' && basar.status === 'CLOSED' && (
                      <button onClick={() => handleArchive(basar)}
                        className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-600 text-sm font-medium rounded-lg transition-colors">
                        Archivieren
                      </button>
                    )}
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
