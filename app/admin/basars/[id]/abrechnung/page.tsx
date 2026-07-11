'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import Header from '../../../../components/Header';

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

  useEffect(() => { loadData(); }, [basarId]);

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

  async function handleExportPDF(settlement: Settlement) {
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });
      const { seller } = settlement.basarSeller;

      doc.setFontSize(20);
      doc.text('Abrechnung Kinderbasar', 20, 20);
      doc.setFontSize(12);
      doc.text(basar?.title ?? '', 20, 30);
      doc.text(`Verkäufer #${seller.sellerId}: ${seller.firstName} ${seller.lastName}`, 20, 40);
      doc.text(`Erstellt: ${new Date(settlement.generatedAt).toLocaleDateString('de-DE')}`, 20, 48);

      doc.setFillColor(240, 240, 240);
      doc.rect(15, 55, 180, 50, 'F');
      doc.setFontSize(11);
      doc.text('Brutto-Erlös:', 20, 67);
      doc.text(`${Number(settlement.grossRevenue).toFixed(2)} €`, 170, 67, { align: 'right' });
      doc.text(`Provision (${basar?.commissionPercent ?? 0}%):`, 20, 78);
      doc.text(`- ${Number(settlement.commissionAmount).toFixed(2)} €`, 170, 78, { align: 'right' });
      doc.text('Teilnahmegebühr:', 20, 89);
      doc.text(`- ${Number(settlement.entryFeeAmount).toFixed(2)} €`, 170, 89, { align: 'right' });

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Netto-Auszahlung:', 20, 108);
      doc.text(`${Number(settlement.netPayout).toFixed(2)} €`, 170, 108, { align: 'right' });

      doc.save(`Abrechnung-${seller.sellerId}-${seller.lastName}.pdf`);
    } catch (err) {
      console.error('PDF error:', err);
      setMessage('Fehler beim Erstellen des PDFs');
      setTimeout(() => setMessage(''), 3000);
    }
  }

  const totalGross = settlements.reduce((s, x) => s + Number(x.grossRevenue), 0);
  const totalCommission = settlements.reduce((s, x) => s + Number(x.commissionAmount), 0);
  const totalPayout = settlements.reduce((s, x) => s + Number(x.netPayout), 0);

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Header links={[
        { href: '/admin', label: 'Basarliste' },
        { href: '/admin/basars', label: 'Basare', active: true },
        { href: '/admin/list', label: 'Helferliste' },
        { href: '/admin/tasks', label: 'Aufgaben' },
        { href: '/admin/settings', label: 'Einstellungen' },
        { href: '/', label: 'Logout' },
      ]} />
      <div className="text-center py-20 text-gray-500">Laden…</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header links={[
        { href: '/admin', label: 'Basarliste' },
        { href: '/admin/basars', label: 'Basare', active: true },
        { href: '/admin/list', label: 'Helferliste' },
        { href: '/admin/tasks', label: 'Aufgaben' },
        { href: '/admin/settings', label: 'Einstellungen' },
        { href: '/', label: 'Logout' },
      ]} />
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Abrechnung</h1>
            {basar && <p className="text-gray-500">{basar.title}</p>}
          </div>
          {basar?.status === 'CLOSED' && (
            <button onClick={handleGenerate} disabled={generating}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold rounded-lg transition-colors disabled:opacity-50">
              {generating ? 'Erstelle…' : settlements.length > 0 ? '↻ Neu berechnen' : 'Abrechnung erstellen'}
            </button>
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
                        <button onClick={() => handleExportPDF(s)}
                          className="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs rounded transition-colors">
                          ↓ PDF
                        </button>
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
            Noch keine Abrechnung generiert. Klicke auf „Abrechnung erstellen".
          </div>
        )}
      </div>
    </div>
  );
}
