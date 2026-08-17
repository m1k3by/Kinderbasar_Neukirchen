'use client';

import { useState, useEffect, use, Fragment } from 'react';
import Link from 'next/link';
import Header from '../../../components/Header';
import { getNavLinks, basarsAdminActiveKey, type NavUser } from '../../../lib/navLinks';
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

interface CashierStat {
  cashierId: number | null;
  name: string;
  salesCount: number;
  revenue: number;
  firstScan: string | null;
  lastScan: string | null;
}
interface RateRow {
  label: string;
  offered: number;
  sold: number;
}
interface Stats {
  totals: {
    salesCount: number; revenue: number; cancelledCount: number;
    articlesOffered: number; articlesSold: number; activeSellers: number;
  };
  cashiers: CashierStat[];
  priceBands: RateRow[];
  sizes: RateRow[];
  categories: RateRow[];
}

interface TxItem {
  saleId: string;
  articleTitle: string;
  sizeLabel: string | null;
  qrCode: string;
  salePrice: number;
  isCancelled: boolean;
  sellerId: number;
  sellerName: string;
}
interface Transaction {
  txId: string | null;
  cashierId: number | null;
  cashierName: string;
  soldAt: string;
  total: number;
  items: TxItem[];
}

function fmt(n: number) {
  return `${n.toFixed(2).replace('.', ',')} €`;
}

function quote(offered: number, sold: number) {
  return offered > 0 ? Math.round((sold / offered) * 100) : 0;
}

function quoteColor(pct: number) {
  if (pct >= 60) return 'text-green-600 bg-green-500';
  if (pct >= 30) return 'text-yellow-600 bg-yellow-500';
  return 'text-red-600 bg-red-500';
}

function RateTable({ title, rows }: { title: string; rows: RateRow[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden mt-4">
      <div className="px-4 py-3 border-b border-gray-200 font-semibold text-gray-700">{title}</div>
      {rows.length === 0 ? (
        <div className="text-center py-8 text-gray-400">Keine Artikel</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Bezeichnung</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Angeboten</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Verkauft</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Quote</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const pct = quote(r.offered, r.sold);
              const [textColor, barColor] = quoteColor(pct).split(' ');
              return (
                <tr key={r.label} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-800">
                    {r.label}
                    <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 w-32">
                      <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{r.offered}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{r.sold}</td>
                  <td className={`px-4 py-3 text-right font-medium ${textColor}`}>{pct} %</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TransactionList({ transactions, onStorno, showCashier }: {
  transactions: Transaction[]; onStorno: (saleId: string) => void; showCashier?: boolean;
}) {
  if (transactions.length === 0) {
    return <div className="text-center py-4 text-gray-400">Keine Kassenvorgänge</div>;
  }
  return (
    <div className="space-y-3">
      {transactions.map(t => (
        <div key={t.txId ?? t.items[0]?.saleId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200 text-sm">
            <span className="text-gray-600">
              {new Date(t.soldAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              {' · '}{t.items.length} {t.items.length === 1 ? 'Position' : 'Positionen'}
              {showCashier && (
                <span className="text-gray-400"> · {t.cashierName}{t.cashierId !== null && ` #${t.cashierId}`}</span>
              )}
            </span>
            <span className="font-semibold text-gray-800">{fmt(t.total)}</span>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {t.items.map(i => (
                <tr key={i.saleId}>
                  <td className={`px-3 py-2 text-gray-800 ${i.isCancelled ? 'line-through text-gray-400' : ''}`}>
                    {i.articleTitle}{i.sizeLabel && <span className="text-gray-400"> ({i.sizeLabel})</span>}
                  </td>
                  <td className={`px-3 py-2 text-gray-500 ${i.isCancelled ? 'line-through text-gray-400' : ''}`}>
                    {i.sellerName} <span className="text-gray-400">#{i.sellerId}</span>
                  </td>
                  <td className={`px-3 py-2 text-right text-gray-700 ${i.isCancelled ? 'line-through text-gray-400' : ''}`}>
                    {fmt(i.salePrice)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {i.isCancelled ? (
                      <span className="text-xs text-gray-400 font-medium">storniert</span>
                    ) : (
                      <button type="button" onClick={() => onStorno(i.saleId)}
                        className="text-xs text-red-600 hover:underline font-medium">
                        Stornieren
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function formatDuration(fromIso: string, toIso: string) {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export default function AdminBasarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [basar, setBasar] = useState<Basar | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'overview' | 'sellers' | 'stats'>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [expandedCashier, setExpandedCashier] = useState<string | null>(null);
  const [cashierTx, setCashierTx] = useState<Record<string, Transaction[]>>({});
  const [cashierTxLoading, setCashierTxLoading] = useState<Record<string, boolean>>({});
  const [txSearch, setTxSearch] = useState('');
  const [txSearchResults, setTxSearchResults] = useState<Transaction[] | null>(null);
  const [txSearchLoading, setTxSearchLoading] = useState(false);
  const [txError, setTxError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<BasarFormState>(EMPTY_BASAR_FORM);
  const [saving, setSaving] = useState(false);
  // Default to admin nav until /api/me resolves – see app/admin/basars/page.tsx for why
  // this matters (cashiers can also reach /admin/basars/**).
  const [navUser, setNavUser] = useState<NavUser>({ role: 'admin' });

  useEffect(() => { loadBasar(); loadMe(); }, [id]);

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

  function handleTabChange(t: 'overview' | 'sellers' | 'stats') {
    setTab(t);
    if (t === 'stats' && !stats && !statsLoading) {
      setStatsLoading(true);
      fetch(`/api/basars/${id}/stats`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) setStats(data); })
        .finally(() => setStatsLoading(false));
    }
  }

  // Suche über alle Kassiervorgänge – debounced, damit nicht pro Tastendruck eine Anfrage
  // rausgeht. Leeres Suchfeld → null, dann zeigt die stats-Tab wieder die normale
  // Kassiereransicht statt der flachen Trefferliste.
  useEffect(() => {
    const q = txSearch.trim();
    if (!q) { setTxSearchResults(null); return; }
    setTxSearchLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/basars/${id}/transactions?q=${encodeURIComponent(q)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => setTxSearchResults(data ? data.transactions : []))
        .finally(() => setTxSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [txSearch, id]);

  function toggleCashier(c: CashierStat) {
    const key = c.cashierId === null ? 'null' : String(c.cashierId);
    if (expandedCashier === key) { setExpandedCashier(null); return; }
    setExpandedCashier(key);
    if (!cashierTx[key]) {
      setCashierTxLoading(prev => ({ ...prev, [key]: true }));
      fetch(`/api/basars/${id}/transactions?cashierId=${key}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) setCashierTx(prev => ({ ...prev, [key]: data.transactions })); })
        .finally(() => setCashierTxLoading(prev => ({ ...prev, [key]: false })));
    }
  }

  function patchTransactions(list: Transaction[], saleId: string): Transaction[] {
    return list.map(t => {
      if (!t.items.some(i => i.saleId === saleId)) return t;
      const items = t.items.map(i => i.saleId === saleId ? { ...i, isCancelled: true } : i);
      const total = items.filter(i => !i.isCancelled).reduce((sum, i) => sum + i.salePrice, 0);
      return { ...t, items, total };
    });
  }

  async function handleStorno(saleId: string) {
    if (!confirm('Diesen Verkauf wirklich stornieren?')) return;

    const prevCashierTx = cashierTx;
    const prevSearchResults = txSearchResults;

    setCashierTx(prev => {
      const next: Record<string, Transaction[]> = {};
      for (const [key, list] of Object.entries(prev)) next[key] = patchTransactions(list, saleId);
      return next;
    });
    setTxSearchResults(prev => prev ? patchTransactions(prev, saleId) : prev);

    try {
      const res = await fetch(`/api/sales/${saleId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCashierTx(prevCashierTx);
        setTxSearchResults(prevSearchResults);
        setTxError(data.error || 'Storno fehlgeschlagen');
        setTimeout(() => setTxError(''), 6000);
      }
    } catch {
      setCashierTx(prevCashierTx);
      setTxSearchResults(prevSearchResults);
      setTxError('Storno fehlgeschlagen – Netzwerkfehler');
      setTimeout(() => setTxError(''), 6000);
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

  const tabLabels: Record<'overview' | 'sellers' | 'stats', string> = {
    overview: 'Übersicht',
    sellers: `Verkäufer (${basar?._count?.basarSellers ?? 0})`,
    stats: 'Statistik',
  };

  const filteredSellers = (basar?.basarSellers ?? []).filter(bs =>
    search === '' ||
    bs.seller.firstName.toLowerCase().includes(search.toLowerCase()) ||
    bs.seller.lastName.toLowerCase().includes(search.toLowerCase()) ||
    bs.seller.email.toLowerCase().includes(search.toLowerCase()) ||
    String(bs.seller.sellerId).includes(search)
  );

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Header links={getNavLinks(navUser, basarsAdminActiveKey(navUser))} />
      <div className="text-center py-20 text-gray-500">Laden…</div>
    </div>
  );

  if (!basar) return (
    <div className="min-h-screen bg-gray-50">
      <Header links={getNavLinks(navUser, basarsAdminActiveKey(navUser))} />
      <div className="text-center py-20 text-red-500">Basar nicht gefunden</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header links={getNavLinks(navUser, basarsAdminActiveKey(navUser))} />
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
            {navUser.role === 'admin' && !editMode && basar.status !== 'CLOSED' && (
              <button onClick={() => setEditMode(true)}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors">
                Bearbeiten
              </button>
            )}
            {navUser.role === 'admin' && NEXT_STATUS_LABEL[basar.status] && (
              <button onClick={handleAdvanceStatus}
                className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-gray-900 text-sm font-medium rounded-lg transition-colors">
                {NEXT_STATUS_LABEL[basar.status]}
              </button>
            )}
          </div>
        </div>

        {/* Edit form */}
        {editMode && navUser.role === 'admin' && (
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

        {/* Tabs – "Verkäufer" nur für Admins: GET /api/basars/[id] liefert die Verkäuferliste
            (Namen, E-Mails) nur an role==='admin', für alle anderen wäre der Tab immer leer. */}
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
          {(navUser.role === 'admin' ? (['overview', 'sellers', 'stats'] as const) : (['overview'] as const)).map(t => (
            <button key={t} onClick={() => handleTabChange(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {tabLabels[t]}
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

        {tab === 'sellers' && navUser.role === 'admin' && (
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

        {tab === 'stats' && navUser.role === 'admin' && (
          <div>
            {statsLoading ? (
              <div className="text-center py-8 text-gray-400">Laden…</div>
            ) : !stats || (stats.totals.salesCount === 0 && stats.totals.articlesOffered === 0) ? (
              // Nur ausblenden, wenn es wirklich nichts zu zeigen gibt. Preis- und
              // Größenverteilung beziehen sich auf ANGEBOTENE Artikel und sind gerade
              // vor dem ersten Verkauf am nützlichsten – etwa um zu sehen, welche
              // Größen im laufenden Anmeldezeitraum noch fehlen.
              <div className="text-center py-8 text-gray-400">Noch keine Artikel und keine Verkäufe</div>
            ) : (
              <>
                <div className="grid md:grid-cols-3 gap-4 mb-4">
                  {[
                    { label: 'Verkäufe', value: stats.totals.salesCount, sub: '' },
                    { label: 'Umsatz', value: fmt(stats.totals.revenue), sub: '' },
                    { label: 'Stornos', value: stats.totals.cancelledCount, sub: '' },
                    {
                      label: 'Artikel angeboten', value: stats.totals.articlesOffered,
                      sub: `davon ${stats.totals.articlesSold} verkauft (${stats.totals.articlesOffered > 0 ? Math.round((stats.totals.articlesSold / stats.totals.articlesOffered) * 100) : 0} %)`,
                    },
                    { label: 'Aktive Verkäufer', value: stats.totals.activeSellers, sub: '' },
                  ].map(card => (
                    <div key={card.label} className="bg-white rounded-xl shadow-sm p-5 text-center">
                      <div className="text-3xl font-bold text-gray-800">{card.value}</div>
                      <div className="text-sm text-gray-500 mt-1">{card.label}</div>
                      {card.sub && <div className="text-xs text-gray-400 mt-1">{card.sub}</div>}
                    </div>
                  ))}
                </div>

                <input value={txSearch} onChange={e => setTxSearch(e.target.value)}
                  placeholder="Kassenvorgänge durchsuchen (Artikel, QR-Code, Verkäufer, Kassierer)…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-yellow-500" />

                {txError && (
                  <div className="mb-4 px-4 py-3 rounded-lg font-medium bg-red-100 text-red-800">{txError}</div>
                )}

                {txSearch.trim() ? (
                  <div className="bg-white rounded-xl shadow-sm p-4">
                    {txSearchLoading ? (
                      <div className="text-center py-8 text-gray-400">Suche…</div>
                    ) : (
                      <TransactionList transactions={txSearchResults ?? []} onStorno={handleStorno} showCashier />
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-gray-600">Kassierer</th>
                          <th className="text-right px-4 py-3 font-semibold text-gray-600">Scans</th>
                          <th className="text-right px-4 py-3 font-semibold text-gray-600">Umsatz</th>
                          <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Erster Scan</th>
                          <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Letzter Scan</th>
                          <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Dauer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {stats.cashiers.map(c => {
                          const key = c.cashierId === null ? 'null' : String(c.cashierId);
                          const isOpen = expandedCashier === key;
                          return (
                            <Fragment key={key}>
                              <tr className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-gray-800">
                                  <button type="button" onClick={() => toggleCashier(c)} aria-expanded={isOpen}
                                    className="flex items-center gap-1.5 text-left">
                                    <span className={`inline-block text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                                    <span>{c.name}{c.cashierId !== null && <span className="text-gray-400"> #{c.cashierId}</span>}</span>
                                  </button>
                                  <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 w-32 ml-5">
                                    <div className="h-1.5 bg-yellow-500 rounded-full"
                                      style={{ width: `${stats.totals.salesCount > 0 ? (c.salesCount / stats.totals.salesCount) * 100 : 0}%` }} />
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right text-gray-700 font-medium">{c.salesCount}</td>
                                <td className="px-4 py-3 text-right text-gray-700">{fmt(c.revenue)}</td>
                                <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                                  {c.firstScan ? new Date(c.firstScan).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–'}
                                </td>
                                <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                                  {c.lastScan ? new Date(c.lastScan).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–'}
                                </td>
                                <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                                  {c.firstScan && c.lastScan ? formatDuration(c.firstScan, c.lastScan) : '–'}
                                </td>
                              </tr>
                              {isOpen && (
                                <tr>
                                  <td colSpan={6} className="px-4 py-3 bg-gray-50">
                                    {cashierTxLoading[key] ? (
                                      <div className="text-center py-4 text-gray-400">Laden…</div>
                                    ) : (
                                      <TransactionList transactions={cashierTx[key] ?? []} onStorno={handleStorno} />
                                    )}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <RateTable title="Preisverteilung" rows={stats.priceBands} />
                <RateTable title="Größen & Kategorien" rows={[...stats.categories, ...stats.sizes]} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
