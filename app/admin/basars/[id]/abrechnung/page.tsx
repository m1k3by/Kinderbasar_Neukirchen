'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import Header from '../../../../components/Header';
import { getNavLinks, basarsAdminActiveKey, type NavUser } from '../../../../lib/navLinks';

interface Settlement {
  id: string;
  basarId: string;
  basarSellerId: string;
  grossRevenue: number;
  commissionAmount: number;
  entryFeeAmount: number;
  netPayout: number;
  generatedAt: string;
  basarSeller: {
    seller: { firstName: string; lastName: string; sellerId: number };
    _count?: { articles: number };
  };
}

interface BasarInfo {
  id: string;
  title: string;
  status: string;
  commissionPercent: number;
  entryFee: number;
}

export default function AbrechnungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: basarId } = use(params);
  const [basar, setBasar] = useState<BasarInfo | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  // Default to admin nav until /api/me resolves – see app/admin/basars/page.tsx for why
  // this matters (cashiers can also reach /admin/basars/**).
  const [navUser, setNavUser] = useState<NavUser>({ role: 'admin' });

  useEffect(() => { loadData(); loadMe(); }, [basarId]);

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

  async function loadData() {
    setLoading(true);
    try {
      const [basarRes, settlRes] = await Promise.all([
        fetch(`/api/basars/${basarId}`),
        fetch(`/api/basars/${basarId}/settlements`),
      ]);
      if (basarRes.ok) setBasar(await basarRes.json());
      if (settlRes.ok) {
        const data = await settlRes.json();
        setSettlements(data.settlements ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!confirm('Abrechnung für alle Verkäufer erstellen? Bestehende Abrechnungen werden aktualisiert.')) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/basars/${basarId}/settlements`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setMessage(`✓ ${data.created} Abrechnungen erstellt`);
        loadData();
      } else {
        const data = await res.json();
        setMessage(data.error || 'Fehler');
      }
    } finally {
      setGenerating(false);
      setTimeout(() => setMessage(''), 5000);
    }
  }

  const totalGross = settlements.reduce((s, x) => s + Number(x.grossRevenue), 0);
  const totalCommission = settlements.reduce((s, x) => s + Number(x.commissionAmount), 0);
  const totalPayout = settlements.reduce((s, x) => s + Number(x.netPayout), 0);

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Header links={getNavLinks(navUser, basarsAdminActiveKey(navUser))} />
      <div className="text-center py-20 text-gray-500">Laden…</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header links={getNavLinks(navUser, basarsAdminActiveKey(navUser))} />
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Abrechnung</h1>
            {basar && <p className="text-gray-500">{basar.title}</p>}
          </div>
          {navUser.role === 'admin' && basar?.status === 'CLOSED' && (
            <div className="flex items-center gap-2">
              {settlements.length > 0 && (
                <a
                  href={`/api/basars/${basarId}/settlements/abrechnungen.pdf`}
                  download
                  target="_blank"
                  rel="noopener"
                  className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold rounded-lg transition-colors"
                >
                  ↓ Alle als ein PDF ({settlements.length})
                </a>
              )}
              <button onClick={handleGenerate} disabled={generating}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold rounded-lg transition-colors disabled:opacity-50">
                {generating ? 'Erstelle…' : settlements.length > 0 ? '↻ Neu berechnen' : 'Abrechnung erstellen'}
              </button>
            </div>
          )}
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg font-medium ${message.startsWith('✓') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {message}
          </div>
        )}

        {basar?.status !== 'CLOSED' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 text-yellow-800">
            Abrechnung ist nur für geschlossene Basare verfügbar.
          </div>
        )}

        {settlements.length > 0 && (
          <>
            {/* KPI */}
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              {[
                { label: 'Gesamtumsatz', value: `${totalGross.toFixed(2)} €`, color: 'text-gray-800' },
                { label: 'Provision', value: `${totalCommission.toFixed(2)} €`, color: 'text-orange-600' },
                { label: 'Auszahlungssumme', value: `${totalPayout.toFixed(2)} €`, color: 'text-green-600' },
              ].map(card => (
                <div key={card.label} className="bg-white rounded-xl shadow-sm p-5 text-center">
                  <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                  <div className="text-sm text-gray-500 mt-1">{card.label}</div>
                </div>
              ))}
            </div>

            {/* Druckhinweis – Pflicht für jede PDF-Download-Stelle, siehe CLAUDE.md */}
            <p className="text-xs text-gray-500 mb-3">
              Beim Drucken „Tatsächliche Größe“ / 100 % wählen, nicht „An Seite anpassen“.
              Das Sammel-PDF enthält alle Abrechnungen hintereinander (eine je Verkäufer, nach
              Nummer sortiert) – bei vielen Verkäufern dauert die Erzeugung einen Moment.
            </p>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Nr.</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Brutto</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Provision</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Netto</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {settlements.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-bold text-gray-700">#{s.basarSeller.seller.sellerId}</td>
                      <td className="px-4 py-3 text-gray-800">{s.basarSeller.seller.firstName} {s.basarSeller.seller.lastName}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{Number(s.grossRevenue).toFixed(2)} €</td>
                      <td className="px-4 py-3 text-right text-orange-600 hidden md:table-cell">- {Number(s.commissionAmount).toFixed(2)} €</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">{Number(s.netPayout).toFixed(2)} €</td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={`/api/basars/${basarId}/settlements/${s.basarSeller.seller.sellerId}/abrechnung.pdf`}
                          download
                          target="_blank"
                          rel="noopener"
                          className="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs rounded transition-colors"
                        >
                          ↓ PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 font-bold text-gray-700">Gesamt</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-700">{totalGross.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-right font-bold text-orange-600 hidden md:table-cell">- {totalCommission.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">{totalPayout.toFixed(2)} €</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        {settlements.length === 0 && basar?.status === 'CLOSED' && (
          <div className="text-center py-12 text-gray-400">
            {navUser.role === 'admin'
              ? 'Noch keine Abrechnung generiert. Klicke auf „Abrechnung erstellen".'
              : 'Noch keine Abrechnung generiert.'}
          </div>
        )}
      </div>
    </div>
  );
}
