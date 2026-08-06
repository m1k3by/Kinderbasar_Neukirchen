'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import Header from '../../../components/Header';
import BasarFormFields, { EMPTY_BASAR_FORM, basarFormFromApi, type BasarFormState } from '../BasarFormFields';

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
  basarSellers: BasarSellerEntry[];
  _count?: { basarSellers: number; sales: number };
}

interface BasarSellerEntry {
  id: string;
  sellerId: number;
  isActive: boolean;
  seller: { sellerId: number; firstName: string; lastName: string; email: string };
  _count: { articles: number };
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Entwurf', OPEN: 'Offen', ACTIVE: 'Aktiv', CLOSED: 'Geschlossen',
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700', OPEN: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-green-100 text-green-700', CLOSED: 'bg-red-100 text-red-700',
};
const NEXT_STATUS_LABEL: Record<string, string> = {
  DRAFT: '→ Öffnen', OPEN: '→ Aktivieren', ACTIVE: '→ Schließen',
};

export default function AdminBasarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [basar, setBasar] = useState<Basar | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'overview' | 'sellers'>('overview');
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<BasarFormState>(EMPTY_BASAR_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadBasar(); }, [id]);

  async function loadBasar() {
    setLoading(true);
    try {
      const res = await fetch(`/api/basars/${id}`);
      if (res.ok) {
        const data = await res.json();
        setBasar(data);
        setForm(basarFormFromApi(data));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/basars/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setMessage('Gespeichert');
        setEditMode(false);
        loadBasar();
      } else {
        const data = await res.json();
        setMessage(data.error || 'Fehler');
      }
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  }

  async function handleAdvanceStatus() {
    if (!basar) return;
    const nextMap: Record<string, string> = { DRAFT: 'OPEN', OPEN: 'ACTIVE', ACTIVE: 'CLOSED' };
    const next = nextMap[basar.status];
    if (!next) return;
    if (!confirm(`Status zu "${STATUS_LABELS[next]}" ändern?`)) return;
    const res = await fetch(`/api/basars/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) loadBasar();
    else { const data = await res.json(); setMessage(data.error || 'Fehler'); setTimeout(() => setMessage(''), 4000); }
  }

  const filteredSellers = (basar?.basarSellers ?? []).filter(bs =>
    search === '' ||
    bs.seller.firstName.toLowerCase().includes(search.toLowerCase()) ||
    bs.seller.lastName.toLowerCase().includes(search.toLowerCase()) ||
    bs.seller.email.toLowerCase().includes(search.toLowerCase()) ||
    String(bs.seller.sellerId).includes(search)
  );

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Header links={[
        { href: '/admin', label: 'Basarliste' },
        { href: '/admin/basars', label: 'Basare', active: true },
        { href: '/admin/list', label: 'Helferliste' },
        { href: '/admin/tasks', label: 'Aufgaben' },
        { href: '/', label: 'Logout' },
      ]} />
      <div className="text-center py-20 text-gray-500">Laden…</div>
    </div>
  );

  if (!basar) return (
    <div className="min-h-screen bg-gray-50">
      <Header links={[
        { href: '/admin', label: 'Basarliste' },
        { href: '/admin/basars', label: 'Basare', active: true },
        { href: '/admin/list', label: 'Helferliste' },
        { href: '/admin/tasks', label: 'Aufgaben' },
        { href: '/', label: 'Logout' },
      ]} />
      <div className="text-center py-20 text-red-500">Basar nicht gefunden</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        links={[
          { href: '/admin', label: 'Basarliste' },
          { href: '/admin/basars', label: 'Basare', active: true },
          { href: '/admin/list', label: 'Helferliste' },
          { href: '/admin/tasks', label: 'Aufgaben' },
          { href: '/', label: 'Logout' },
        ]}
      />
      <div className="max-w-5xl mx-auto p-6">
        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg font-medium ${message.includes('Fehler') || message.includes('error') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
            {message}
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[basar.status]}`}>
                {STATUS_LABELS[basar.status]}
              </span>
              <h1 className="text-2xl font-bold text-gray-800">{basar.title}</h1>
            </div>
            <p className="text-gray-500">
              {new Date(basar.eventDate).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
              {basar.location && ` · ${basar.location}`}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {!editMode && basar.status !== 'CLOSED' && (
              <button onClick={() => setEditMode(true)}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors">
                Bearbeiten
              </button>
            )}
            {NEXT_STATUS_LABEL[basar.status] && (
              <button onClick={handleAdvanceStatus}
                className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-gray-900 text-sm font-medium rounded-lg transition-colors">
                {NEXT_STATUS_LABEL[basar.status]}
              </button>
            )}
          </div>
        </div>

        {/* Edit form */}
        {editMode && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <form onSubmit={handleSave} className="grid md:grid-cols-2 gap-4">
              <BasarFormFields form={form} setForm={setForm} economicsLocked={basar.status === 'ACTIVE'} />
              <div className="md:col-span-2 flex gap-3 justify-end">
                <button type="button" onClick={() => setEditMode(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Abbrechen</button>
                <button type="submit" disabled={saving} className="px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Speichern…' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
          {(['overview', 'sellers'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'overview' ? 'Übersicht' : `Verkäufer (${basar._count?.basarSellers ?? 0})`}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { label: 'Verkäufer', value: basar._count?.basarSellers ?? 0, sub: `/ ${basar.maxSellers} max.` },
              { label: 'Provision', value: `${basar.commissionPercent}%`, sub: '' },
              { label: 'Gebühr', value: `${Number(basar.entryFee).toFixed(2)} €`, sub: 'Teilnahme' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl shadow-sm p-5 text-center">
                <div className="text-3xl font-bold text-gray-800">{card.value}</div>
                <div className="text-sm text-gray-500 mt-1">{card.label} {card.sub && <span className="text-gray-400">{card.sub}</span>}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'sellers' && (
          <div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche nach Name, E-Mail oder Nummer…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-yellow-500" />
            {filteredSellers.length === 0 ? (
              <div className="text-center py-8 text-gray-400">Keine Verkäufer gefunden</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Nr.</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">E-Mail</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Artikel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredSellers.map(bs => (
                      <tr key={bs.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-bold text-gray-700">#{bs.seller.sellerId}</td>
                        <td className="px-4 py-3 text-gray-800">{bs.seller.firstName} {bs.seller.lastName}
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${bs.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {bs.isActive ? 'aktiv' : 'inaktiv'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{bs.seller.email}</td>
                        <td className="px-4 py-3 text-right text-gray-700 font-medium">{bs._count.articles}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
