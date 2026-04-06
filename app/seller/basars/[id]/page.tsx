'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../../components/Header';

interface Article {
  id: string;
  title: string;
  sizeLabel?: string;
  price: number;
  qrCode: string;
  status: 'AVAILABLE' | 'SOLD' | 'RETURNED';
  soldAt?: string;
  createdAt: string;
}

interface BasarSeller {
  id: string;
  sellerNumber: number;
  maxArticlesOverride?: number;
}

interface BasarDetail {
  id: string;
  title: string;
  eventDate: string;
  location?: string;
  maxArticlesPerSeller: number;
  commissionPercent: number;
  entryFee: number;
  status: 'DRAFT' | 'OPEN' | 'ACTIVE' | 'CLOSED';
}

interface Settlement {
  grossRevenue: number;
  commissionAmount: number;
  entryFeeAmount: number;
  netPayout: number;
}

const fmt = (n: number) => n.toFixed(2).replace('.', ',');

export default function SellerBasarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: basarId } = use(params);
  const router = useRouter();
  const [sellerId, setSellerId] = useState<number | null>(null);
  const [sellerName, setSellerName] = useState('');
  const [activeSellerStatus, setActiveSellerStatus] = useState(false);
  const [basar, setBasar] = useState<BasarDetail | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [basarSeller, setBasarSeller] = useState<BasarSeller | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageOk, setMessageOk] = useState(true);
  const [form, setForm] = useState({ title: '', sizeLabel: '', price: '' });

  useEffect(() => {
    const cookies = document.cookie.split(';');
    const cookie = cookies.find(c => c.trim().startsWith('sellerId='));
    if (!cookie) { router.push('/login'); return; }
    const id = parseInt(cookie.split('=')[1], 10);
    setSellerId(id);
  }, [router]);

  useEffect(() => {
    if (!sellerId) return;
    loadAll();
  }, [sellerId, basarId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [basarRes, articlesRes, sellersRes] = await Promise.all([
        fetch(`/api/basars/${basarId}`),
        fetch(`/api/basars/${basarId}/articles`),
        fetch('/api/sellers'),
      ]);

      if (basarRes.ok) setBasar(await basarRes.json());
      if (articlesRes.ok) {
        const data = await articlesRes.json();
        setArticles(data.articles ?? []);
        setBasarSeller(data.basarSeller ?? null);
      }
      if (sellersRes.ok && sellerId) {
        const sellers = await sellersRes.json();
        const me = sellers.find((s: any) => s.sellerId === sellerId);
        if (me) {
          setSellerName(`${me.firstName} ${me.lastName}`);
          setActiveSellerStatus(me.sellerStatusActive ?? false);
        }
      }

      // Load settlement if basar is closed
      if (basar?.status === 'CLOSED' && sellerId) {
        const stRes = await fetch(`/api/basars/${basarId}/settlements/${sellerId}`);
        if (stRes.ok) {
          const stData = await stRes.json();
          setSettlement(stData.basarSeller?.settlement ?? null);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  // Re-check settlement once basar info is loaded
  useEffect(() => {
    if (basar?.status === 'CLOSED' && sellerId) {
      fetch(`/api/basars/${basarId}/settlements/${sellerId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setSettlement(data.basarSeller?.settlement ?? null); });
    }
  }, [basar?.status, sellerId, basarId]);

  async function handleAddArticle(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.price) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/basars/${basarId}/articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, sizeLabel: form.sizeLabel, price: parseFloat(form.price) }),
      });
      const data = await res.json();
      if (res.ok) {
        setArticles(prev => [...prev, data.article]);
        if (!basarSeller) setBasarSeller(data.basarSeller);
        setForm({ title: '', sizeLabel: '', price: '' });
        showMsg('✓ Artikel hinzugefügt', true);
      } else {
        showMsg(data.error || 'Fehler', false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(artId: string) {
    if (!confirm('Artikel wirklich löschen?')) return;
    const res = await fetch(`/api/basars/${basarId}/articles/${artId}`, { method: 'DELETE' });
    if (res.ok) {
      setArticles(prev => prev.filter(a => a.id !== artId));
      showMsg('Artikel gelöscht', true);
    } else {
      const data = await res.json();
      showMsg(data.error || 'Fehler', false);
    }
  }

  function showMsg(text: string, ok: boolean) {
    setMessage(text);
    setMessageOk(ok);
    setTimeout(() => setMessage(''), 4000);
  }

  async function handlePrintLabels() {
    if (articles.length === 0) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const rows = articles.map(a => `
      <div class="label">
        <img src="/api/articles/${a.qrCode}/qr" alt="QR" class="qr" />
        <div class="cell vknr">Verk. #${basarSeller?.sellerNumber ?? '?'}</div>
        <div class="cell title">${escapeHtml(a.title)}</div>
        <div class="cell size">${a.sizeLabel ? escapeHtml(a.sizeLabel) : '–'}</div>
        <div class="cell price">${fmt(Number(a.price))} €</div>
      </div>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><title>Etiketten</title>
    <style>
      @page { size: A4; margin: 10mm; }
      body { font-family: Arial, sans-serif; margin: 0; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
      .label {
        display: grid;
        grid-template-columns: 28mm 1fr 1fr;
        grid-template-rows: 1fr 1fr;
        gap: 0 3mm;
        border: 1px solid #bbb;
        padding: 3mm;
        border-radius: 2mm;
        page-break-inside: avoid;
        min-height: 28mm;
        box-sizing: border-box;
      }
      .qr {
        width: 28mm;
        height: 28mm;
        grid-column: 1;
        grid-row: 1 / span 2;
        align-self: center;
        flex-shrink: 0;
      }
      .cell {
        display: flex;
        align-items: center;
        overflow: hidden;
        padding: 1mm 0;
      }
      .vknr { font-size: 9pt; color: #555; font-weight: bold; grid-column: 2; grid-row: 1; }
      .title { font-size: 9pt; font-weight: bold; word-break: break-word; grid-column: 3; grid-row: 1; }
      .size  { font-size: 9pt; color: #444; grid-column: 2; grid-row: 2; }
      .price { font-size: 15pt; font-weight: bold; color: #000; grid-column: 3; grid-row: 2; justify-content: flex-end; }
      @media print { button { display: none; } }
    </style></head><body>
    <button onclick="window.print()" style="margin:4mm;padding:6px 16px;font-size:13px;cursor:pointer;">🖨 Drucken</button>
    <div class="grid">${rows}</div>
    </body></html>`);
    win.document.close();
  }

  function escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function handleExportPDF() {
    if (!settlement) return;
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });
      doc.setFontSize(18);
      doc.text('Meine Abrechnung – Kinderbasar', 20, 20);
      doc.setFontSize(12);
      doc.text(basar?.title ?? '', 20, 30);
      doc.text(`Verkäufer #${basarSeller?.sellerNumber}: ${sellerName}`, 20, 40);
      doc.setFontSize(11);
      doc.text(`Brutto-Erlös:`, 20, 60);
      doc.text(`${fmt(Number(settlement.grossRevenue))} €`, 170, 60, { align: 'right' });
      doc.text(`Provision (${basar?.commissionPercent ?? 0}%):`, 20, 70);
      doc.text(`- ${fmt(Number(settlement.commissionAmount))} €`, 170, 70, { align: 'right' });
      doc.text(`Teilnahmegebühr:`, 20, 80);
      doc.text(`- ${fmt(Number(settlement.entryFeeAmount))} €`, 170, 80, { align: 'right' });
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`Netto-Auszahlung:`, 20, 96);
      doc.text(`${fmt(Number(settlement.netPayout))} €`, 170, 96, { align: 'right' });
      doc.save(`Abrechnung-${sellerName.replace(' ', '-')}.pdf`);
    } catch (err) {
      console.error(err);
      showMsg('Fehler beim PDF-Export', false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Header links={[{ href: '/seller/basars', label: '← Mein Basar' }]} />
      <div className="text-center py-20 text-gray-500">Laden…</div>
    </div>
  );

  if (!basar) return (
    <div className="min-h-screen bg-gray-50">
      <Header links={[{ href: '/seller/basars', label: '← Mein Basar' }]} />
      <div className="text-center py-20 text-red-500">Basar nicht gefunden</div>
    </div>
  );

  const maxArticles = basarSeller?.maxArticlesOverride ?? basar.maxArticlesPerSeller;
  const soldCount = articles.filter(a => a.status === 'SOLD').length;
  const soldRevenue = articles.filter(a => a.status === 'SOLD').reduce((s, a) => s + Number(a.price), 0);
  const canAddArticles = basar.status === 'OPEN' && activeSellerStatus;
  const isReadOnly = basar.status === 'ACTIVE' || basar.status === 'CLOSED';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        links={[{ href: '/seller/basars', label: '← Mein Basar' }]}
        sellerInfo={sellerName && sellerId ? { name: sellerName, sellerId } : null}
      />
      <div className="max-w-3xl mx-auto p-4 md:p-6">

        {/* Basar info */}
        <div className="bg-white rounded-xl shadow-sm p-5 mb-5">
          <h1 className="text-2xl font-bold text-gray-800">{basar.title}</h1>
          <p className="text-gray-500 mt-1">
            {new Date(basar.eventDate).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
            {basar.location && ` · ${basar.location}`}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {Number(basar.commissionPercent).toFixed(0)}% Provision · Max. {maxArticles} Artikel
            {Number(basar.entryFee) > 0 && ` · ${fmt(Number(basar.entryFee))} € Teilnahmegebühr`}
          </p>
          {basarSeller && (
            <div className="mt-2 inline-flex items-center gap-2 bg-yellow-50 px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-700">
              Deine Verkäufernummer: <span className="text-xl font-bold text-yellow-600">#{basarSeller.sellerNumber}</span>
            </div>
          )}
        </div>

        {/* Not active warning */}
        {basar.status === 'OPEN' && !activeSellerStatus && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-5 text-orange-800">
            <strong>Hinweis:</strong> Dein Verkäuferstatus ist aktuell inaktiv. Aktiviere ihn auf der{' '}
            <a href="/employee" className="underline font-semibold">Helfer-Seite</a>, um Artikel anlegen zu können.
          </div>
        )}

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg font-medium border ${messageOk ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
            {message}
          </div>
        )}

        {/* Active basar: sales counter */}
        {isReadOnly && articles.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-5 mb-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-700">Verkaufsstand</h2>
              {basar.status === 'ACTIVE' && (
                <button onClick={loadAll} className="text-sm text-yellow-600 hover:underline">↻ Aktualisieren</button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="text-center bg-gray-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-gray-800">{articles.length}</div>
                <div className="text-xs text-gray-500">Artikel gesamt</div>
              </div>
              <div className="text-center bg-green-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-green-600">{soldCount}</div>
                <div className="text-xs text-gray-500">Verkauft</div>
              </div>
              <div className="text-center bg-blue-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-blue-600">{fmt(soldRevenue)} €</div>
                <div className="text-xs text-gray-500">Erlös bisher</div>
              </div>
            </div>
          </div>
        )}

        {/* Settlement */}
        {basar.status === 'CLOSED' && settlement && (
          <div className="bg-white rounded-xl shadow-md p-5 mb-5 border-l-4 border-green-500">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Deine Abrechnung</h2>
              <button onClick={handleExportPDF} className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm rounded-lg transition-colors">
                ↓ PDF
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Brutto-Erlös</span><span className="font-medium">{fmt(Number(settlement.grossRevenue))} €</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Provision ({basar.commissionPercent}%)</span><span className="font-medium text-orange-600">– {fmt(Number(settlement.commissionAmount))} €</span></div>
              {Number(settlement.entryFeeAmount) > 0 && (
                <div className="flex justify-between"><span className="text-gray-600">Teilnahmegebühr</span><span className="font-medium text-orange-600">– {fmt(Number(settlement.entryFeeAmount))} €</span></div>
              )}
              <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
                <span className="font-bold text-gray-800 text-base">Netto-Auszahlung</span>
                <span className="text-2xl font-extrabold text-green-600">{fmt(Number(settlement.netPayout))} €</span>
              </div>
            </div>
          </div>
        )}

        {/* Article form */}
        {canAddArticles && (
          <div className="bg-white rounded-xl shadow-sm p-5 mb-5">
            <h2 className="font-semibold text-gray-700 mb-3">
              Neuen Artikel hinzufügen
              <span className="ml-2 text-sm font-normal text-gray-400">({articles.length}/{maxArticles})</span>
            </h2>
            <form onSubmit={handleAddArticle} className="grid md:grid-cols-3 gap-3">
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Beschreibung * (max. 120 Zeichen)</label>
                <input
                  required maxLength={120}
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="z.B. Jeans Gr. 110, Winterjacke blau…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
                <div className="text-right text-xs text-gray-400 mt-0.5">{form.title.length}/120</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Größe / Bezeichnung</label>
                <input
                  maxLength={40}
                  value={form.sizeLabel}
                  onChange={e => setForm(f => ({ ...f, sizeLabel: e.target.value }))}
                  placeholder="z.B. 110, M, 38/32…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Preis (€) *</label>
                <input
                  required type="number" min="0.10" step="0.10"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="0,50"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={submitting || articles.length >= maxArticles}
                  className="w-full py-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Hinzufügen…' : '+ Hinzufügen'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Article list */}
        {articles.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700">Meine Artikel ({articles.length})</h2>
              {basar.status === 'OPEN' && articles.length > 0 && (
                <button
                  onClick={handlePrintLabels}
                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  🖨 Etiketten drucken
                </button>
              )}
            </div>
            <div className="divide-y divide-gray-100">
              {articles.map(article => (
                <div key={article.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{article.title}</p>
                    <p className="text-xs text-gray-500">
                      {article.sizeLabel && `Größe: ${article.sizeLabel} · `}
                      {fmt(Number(article.price))} €
                      {article.status === 'SOLD' && article.soldAt && (
                        <span className="ml-1 text-gray-400">· verkauft {new Date(article.soldAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full flex-shrink-0 ${
                    article.status === 'SOLD' ? 'bg-green-100 text-green-700' :
                    article.status === 'RETURNED' ? 'bg-gray-100 text-gray-500' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {article.status === 'SOLD' ? '✓ Verkauft' : article.status === 'RETURNED' ? 'Zurück' : 'Verfügbar'}
                  </span>
                  {!isReadOnly && (
                    <button
                      onClick={() => handleDelete(article.id)}
                      className="p-1 text-red-400 hover:text-red-600 transition-colors flex-shrink-0"
                      title="Löschen"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {articles.length === 0 && basar.status === 'OPEN' && activeSellerStatus && (
          <div className="text-center py-12 text-gray-400">
            Noch keine Artikel. Füge deinen ersten Artikel oben hinzu!
          </div>
        )}
      </div>
    </div>
  );
}
