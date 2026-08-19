'use client';

import { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../../components/Header';
import { parseSizes } from '../../../lib/sizes';
import { getNavLinks } from '../../../lib/navLinks';
import { maxArticlesFor } from '../../../lib/articleLimits';

interface Article {
  id: string;
  title: string;
  sizeLabel?: string;
  gender?: string;
  price: number;
  qrCode: string;
  status: 'AVAILABLE' | 'SOLD' | 'RETURNED';
  soldAt?: string;
  createdAt: string;
}

interface BasarSeller {
  id: string;
  sellerId: number;
  seller?: { sellerId: number };
  maxArticlesOverride?: number;
}

interface BasarDetail {
  id: string;
  title: string;
  eventDate: string;
  location?: string;
  maxArticlesPerSeller: number;
  maxArticlesPerEmployee?: number | null;
  commissionPercent: number;
  entryFee: number;
  status: 'DRAFT' | 'OPEN' | 'ACTIVE' | 'CLOSED';
  allowedSizes?: string;
  myParticipation?: { isActive: boolean; activatedAt: string | null } | null;
}

interface Settlement {
  grossRevenue: number;
  commissionAmount: number;
  entryFeeAmount: number;
  netPayout: number;
}

interface SellerArchiveEntry {
  id: string;
  title: string;
  sizeLabel?: string;
  price: number;
  alreadyInBasar: boolean;
  soldPreviously: boolean;
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
  const [message, setMessage] = useState('');
  const [messageOk, setMessageOk] = useState(true);
  const [form, setForm] = useState({ title: '', sizeLabel: '', gender: '', price: '' });
  const [archiveItems, setArchiveItems] = useState<SellerArchiveEntry[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<Set<string>>(new Set());
  const [isEmployee, setIsEmployee] = useState(false);
  const [isCashier, setIsCashier] = useState(false);
  const [allowedSizes, setAllowedSizes] = useState<string[]>([]);
  const [sizeError, setSizeError] = useState('');
  const [showSizeTooltip, setShowSizeTooltip] = useState(false);
  // Oberkategorie des Eingabeformulars. Sie wird NICHT gespeichert – sie steuert nur, welche
  // Felder sichtbar sind. Ein Nicht-Kleidungsstück ist dadurch schlicht ein Artikel ohne
  // Größe und ohne Geschlecht; dafür braucht es keine Schemaänderung.
  // Bewusst nicht Teil von `form`: nach dem Absenden wird das Formular geleert, die Kategorie
  // bleibt aber stehen – wer zehn Spielsachen erfasst, will nicht zehnmal umschalten.
  const [isClothing, setIsClothing] = useState(true);
  const titleInputRef = useRef<HTMLInputElement>(null);

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
      const [basarRes, articlesRes, meRes] = await Promise.all([
        fetch(`/api/basars/${basarId}`),
        fetch(`/api/basars/${basarId}/articles`),
        fetch('/api/me'),
      ]);

      let basarData: BasarDetail | null = null;
      if (basarRes.ok) {
        basarData = await basarRes.json();
        setBasar(basarData);
        setAllowedSizes(parseSizes(basarData?.allowedSizes));
      }

      // CLOSED basars are viewable (read-only settlement/archive) – no redirect

      if (articlesRes.ok) {
        const data = await articlesRes.json();
        setArticles(data.articles ?? []);
        setBasarSeller(data.basarSeller ?? null);
      }
      const isActiveParticipant = basarData?.myParticipation?.isActive ?? false;
      setActiveSellerStatus(isActiveParticipant);
      if (meRes.ok && sellerId) {
        const me = await meRes.json();
        if (me.role !== 'admin') {
          setSellerName(`${me.firstName} ${me.lastName}`);
          setIsEmployee(me.isEmployee || false);
          setIsCashier(me.isCashier || false);
          // Archiv für jeden OPEN-Basar laden, unabhängig von der Teilnahme – die Übernahme
          // aus dem Archiv ist Artikelanlage und setzt keine Anmeldung mehr voraus.
          if (basarData?.status === 'OPEN') {
            const archRes = await fetch(`/api/seller-articles?basarId=${basarId}`);
            if (archRes.ok) {
              const archData = await archRes.json();
              setArchiveItems(archData.sellerArticles ?? []);
            }
          }
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

  async function handleImportFromArchive() {
    const ids = [...selectedArchiveIds];
    if (ids.length === 0) return;

    // Optimistic: clear selection + mark as alreadyInBasar immediately
    setSelectedArchiveIds(new Set());
    setArchiveItems(prev => prev.map(a => ids.includes(a.id) ? { ...a, alreadyInBasar: true } : a));

    try {
      const res = await fetch(`/api/basars/${basarId}/articles/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerArticleIds: ids }),
      });
      const data = await res.json();
      if (res.ok) {
        setArticles(prev => [...prev, ...data.articles]);
        if (!basarSeller) setBasarSeller(data.basarSeller);
        showMsg(`✓ ${data.articles.length} Artikel aus Archiv importiert`, true);
      } else {
        // Revert
        setArchiveItems(prev => prev.map(a => ids.includes(a.id) ? { ...a, alreadyInBasar: false } : a));
        showMsg(data.error || 'Fehler beim Importieren', false);
      }
    } catch {
      setArchiveItems(prev => prev.map(a => ids.includes(a.id) ? { ...a, alreadyInBasar: false } : a));
      showMsg('Netzwerkfehler', false);
    }
  }

  function selectCategory(clothing: boolean) {
    setIsClothing(clothing);
    if (!clothing) {
      // Größe und Geschlecht sofort verwerfen statt nur auszublenden – sonst würde ein vorher
      // getippter Wert unsichtbar im State liegen und beim Absenden mitgeschickt.
      setForm(f => ({ ...f, sizeLabel: '', gender: '' }));
      setSizeError('');
      setShowSizeTooltip(false);
    }
  }

  async function handleAddArticle(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.price) return;

    // Validate price step
    const priceVal = parseFloat(form.price);
    if (isNaN(priceVal) || Math.round(priceVal * 100) % 50 !== 0 || priceVal < 0.5) {
      showMsg('Der Preis muss ein Vielfaches von 0,50 € sein (z.B. 0,50 – 1,00 – 1,50 …)', false);
      return;
    }

    // Validate size – nur bei Kleidung, sonst gibt es gar keine Größe zu prüfen.
    const trimmedSize = isClothing ? form.sizeLabel.trim() : '';
    if (trimmedSize && allowedSizes.length > 0 && !allowedSizes.includes(trimmedSize)) {
      setSizeError(`"${trimmedSize}" ist keine gültige Größe. Bitte ⓘ klicken für alle Optionen.`);
      return;
    }

    // Optimistic: reset form + add temp article immediately
    const tempId = `temp-${Date.now()}`;
    const tempArticle: Article = {
      id: tempId,
      title: form.title,
      // Bei „Keine Kleidung" bleiben beide Felder leer – unabhängig davon, was vor dem
      // Umschalten im Formular stand.
      sizeLabel: isClothing ? (form.sizeLabel || undefined) : undefined,
      gender: isClothing ? (form.gender || undefined) : undefined,
      price: parseFloat(form.price),
      qrCode: '',
      status: 'AVAILABLE',
      createdAt: new Date().toISOString(),
    };
    setArticles(prev => [tempArticle, ...prev]);
    setForm({ title: '', sizeLabel: '', gender: '', price: '' });
    setSizeError('');
    setTimeout(() => titleInputRef.current?.focus(), 0);

    try {
      const res = await fetch(`/api/basars/${basarId}/articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: tempArticle.title, sizeLabel: tempArticle.sizeLabel, gender: tempArticle.gender, price: tempArticle.price }),
      });
      const data = await res.json();
      if (res.ok) {
        // Replace temp article with real one from server
        setArticles(prev => prev.map(a => a.id === tempId ? data.article : a));
        if (!basarSeller) setBasarSeller(data.basarSeller);
        showMsg('✓ Artikel hinzugefügt', true);
      } else {
        // Revert on error
        setArticles(prev => prev.filter(a => a.id !== tempId));
        setForm({ title: tempArticle.title, sizeLabel: tempArticle.sizeLabel ?? '', gender: tempArticle.gender ?? '', price: String(tempArticle.price) });
        showMsg(data.error || 'Fehler', false);
      }
    } catch {
      setArticles(prev => prev.filter(a => a.id !== tempId));
      setForm({ title: tempArticle.title, sizeLabel: tempArticle.sizeLabel ?? '', gender: tempArticle.gender ?? '', price: String(tempArticle.price) });
      showMsg('Netzwerkfehler', false);
    }
  }

  async function handleDelete(artId: string) {
    if (!confirm('Artikel wirklich löschen?')) return;
    // Optimistic: remove immediately
    const removed = articles.find(a => a.id === artId);
    setArticles(prev => prev.filter(a => a.id !== artId));
    const res = await fetch(`/api/basars/${basarId}/articles/${artId}`, { method: 'DELETE' });
    if (res.ok) {
      showMsg('Artikel gelöscht', true);
    } else {
      // Revert
      if (removed) setArticles(prev => [...prev, removed].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      const data = await res.json().catch(() => ({}));
      showMsg(data.error || 'Fehler', false);
    }
  }

  function showMsg(text: string, ok: boolean) {
    setMessage(text);
    setMessageOk(ok);
    setTimeout(() => setMessage(''), 4000);
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Header links={getNavLinks({ role: isEmployee ? 'employee' : 'seller', isEmployee, isCashier }, 'verkaeufer')} />
      <div className="text-center py-20 text-gray-500">Laden…</div>
    </div>
  );

  if (!basar) return (
    <div className="min-h-screen bg-gray-50">
      <Header links={getNavLinks({ role: isEmployee ? 'employee' : 'seller', isEmployee, isCashier }, 'verkaeufer')} />
      <div className="text-center py-20 text-red-500">Basar nicht gefunden</div>
    </div>
  );

  const maxArticles = maxArticlesFor(basar, { isEmployee }, basarSeller?.maxArticlesOverride);
  const soldCount = articles.filter(a => a.status === 'SOLD').length;
  const soldRevenue = articles.filter(a => a.status === 'SOLD').reduce((s, a) => s + Number(a.price), 0);
  // Nur der Basar-Status entscheidet, nicht die Teilnahme: Artikel dürfen vorbereitet
  // werden, bevor man sich anmeldet (die API sieht das genauso, siehe
  // app/api/basars/[id]/articles/route.ts).
  const canAddArticles = basar.status === 'OPEN';
  const isReadOnly = basar.status === 'ACTIVE' || basar.status === 'CLOSED';
  const archiveAvailable = archiveItems.filter(a => !a.alreadyInBasar && !a.soldPreviously);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        links={getNavLinks({ role: isEmployee ? 'employee' : 'seller', isEmployee, isCashier }, 'verkaeufer')}
        sellerInfo={sellerName && sellerId ? { name: sellerName, sellerId } : null}
      />
      <div className="max-w-3xl mx-auto p-4 md:p-6">

        {/* Diese Seite ist eine Unterseite von /seller und hat keinen eigenen Tab mehr –
            der Rücksprung muss deshalb auf der Seite selbst stehen. */}
        <Link
          href="/seller"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4"
        >
          ← Zurück zum Verkäuferbereich
        </Link>

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
              Deine Verkäufernummer: <span className="text-xl font-bold text-yellow-600">#{basarSeller.seller?.sellerId ?? basarSeller.sellerId}</span>
            </div>
          )}
        </div>

        {/* Closed basar notice */}
        {basar.status === 'CLOSED' && (
          <div className="bg-gray-100 border border-gray-200 rounded-xl p-4 mb-5 text-gray-600 text-sm">
            Dieser Basar ist beendet. Du siehst hier deine Abrechnung und eine Übersicht deiner Artikel (schreibgeschützt).
          </div>
        )}

        {/* Hinweis auf fehlende Teilnahme – ausdrücklich KEINE Sperre: Artikel dürfen auch
            ohne aktive Anmeldung angelegt werden. Der Hinweis erinnert nur daran, dass zum
            Verkaufen zusätzlich die Anmeldung nötig ist. Ziel ist immer /seller – die
            Teilnahme-Umschaltung liegt ausschließlich dort, auch für Mitarbeiter. */}
        {basar.status === 'OPEN' && !activeSellerStatus && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-5 text-orange-800">
            <strong>Hinweis:</strong> Du bist für diesen Basar aktuell nicht als Teilnehmer angemeldet.
            Artikel kannst du trotzdem schon anlegen – damit sie verkauft werden können, melde dich im{' '}
            <Link href="/seller" className="underline font-semibold">Verkäuferbereich</Link> für den Basar an.
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
              <a
                href={`/api/basars/${basarId}/settlements/${basarSeller?.seller?.sellerId ?? basarSeller?.sellerId ?? sellerId}/abrechnung.pdf`}
                download
                target="_blank"
                rel="noopener"
                className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm rounded-lg transition-colors"
              >
                ↓ PDF
              </a>
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

        {/* Archive import section */}
        {canAddArticles && archiveAvailable.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl mb-5 overflow-hidden">

            {/* Clickable header – entire row toggles the section */}
            <button
              type="button"
              onClick={() => setShowArchive(p => !p)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-amber-100 active:bg-amber-200 transition-colors text-left group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl flex-shrink-0">📦</span>
                <div className="min-w-0">
                  <h2 className="font-bold text-gray-800 text-base leading-snug">
                    Artikel aus früherem Basar übernehmen
                  </h2>
                  <p className="text-xs text-amber-700 mt-0.5 font-medium">
                    {archiveAvailable.length} Artikel zum Import bereit
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <span className="px-2.5 py-1 bg-amber-400 text-amber-950 text-xs font-bold rounded-full leading-none">
                  {archiveAvailable.length}
                </span>
                <span className="text-sm font-semibold text-amber-700 hidden sm:inline">
                  {showArchive ? 'Ausblenden' : 'Anzeigen'}
                </span>
                <svg
                  className={`w-5 h-5 text-amber-600 transition-transform duration-200 ${showArchive ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Body – always visible */}
            <div className="px-5 pb-5">
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-2">
                <p className="text-sm text-red-800 flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5">⚠️</span>
                  <span>
                    <strong>Artikel müssen in diesen Basar übernommen werden</strong> – sonst können sie
                    an der Kasse <strong>nicht gescannt und nicht verkauft</strong> werden!
                  </span>
                </p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">
                <p className="text-sm text-green-800 flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5">✓</span>
                  <span>
                    <strong>Dein QR-Code bleibt gültig</strong> – nach der Übernahme
                    sind keine neuen Etiketten nötig.
                  </span>
                </p>
              </div>

              {showArchive ? (
                <>
                  <p className="text-xs text-gray-500 mb-2">Artikel auswählen und auf <strong>Importieren</strong> klicken.</p>
                  <div className="space-y-1.5 mb-3 max-h-64 overflow-y-auto pr-1">
                    {archiveAvailable.map(a => (
                      <label key={a.id} className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-amber-100 hover:border-amber-300 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedArchiveIds.has(a.id)}
                          onChange={() => {
                            setSelectedArchiveIds(prev => {
                              const next = new Set(prev);
                              next.has(a.id) ? next.delete(a.id) : next.add(a.id);
                              return next;
                            });
                          }}
                          className="w-4 h-4 accent-yellow-500 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm text-gray-800 truncate block">{a.title}</span>
                          {a.sizeLabel && <span className="text-xs text-gray-500">{a.sizeLabel}</span>}
                        </div>
                        <span className="text-sm font-bold text-gray-700 flex-shrink-0">{fmt(a.price)} €</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedArchiveIds(new Set(archiveAvailable.map(a => a.id)))}
                      className="text-xs text-amber-700 hover:underline font-medium"
                    >
                      Alle auswählen
                    </button>
                    <button
                      type="button"
                      onClick={handleImportFromArchive}
                      disabled={selectedArchiveIds.size === 0}
                      className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold text-sm rounded-lg transition-colors disabled:opacity-50"
                    >
                      {selectedArchiveIds.size > 0 ? `${selectedArchiveIds.size} Importieren` : 'Importieren'}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowArchive(true)}
                  className="w-full py-2.5 border-2 border-dashed border-amber-300 rounded-lg text-sm font-semibold text-amber-700 hover:bg-amber-100 hover:border-amber-400 transition-colors"
                >
                  Artikel anzeigen & auswählen →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Article form */}
        {canAddArticles && (
          <div className="bg-white rounded-xl shadow-sm p-5 mb-5">
            <h2 className="font-semibold text-gray-700 mb-3">
              Neuen Artikel hinzufügen
              <span className={`ml-2 text-sm font-normal ${articles.length >= maxArticles ? 'text-orange-600 font-semibold' : 'text-gray-400'}`}>
                ({articles.length}/{maxArticles})
              </span>
            </h2>

            {/* Erklärt den ausgegrauten Knopf. Bewusst dauerhaft sichtbar statt als
                Meldung beim Klick: ein disabled-Button feuert kein onClick, die
                Erklärung käme also nie an. */}
            {articles.length >= maxArticles && (
              <div className="mb-3 px-4 py-3 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-800">
                <strong>Maximale Artikelanzahl erreicht.</strong> Du hast alle {maxArticles} Artikel
                angelegt, die für diesen Basar erlaubt sind. Zum Anlegen eines weiteren Artikels
                musst du unten einen vorhandenen löschen.
              </div>
            )}
            <form onSubmit={handleAddArticle} className="grid md:grid-cols-3 gap-3">
              {/* Oberkategorie: steuert nur die Sichtbarkeit von Größe und Geschlecht. */}
              <div className="md:col-span-3">
                <span className="block text-xs font-medium text-gray-600 mb-1">Art des Artikels</span>
                <div
                  role="radiogroup"
                  aria-label="Art des Artikels"
                  className="relative flex w-full max-w-xs bg-gray-100 rounded-xl p-1 select-none"
                >
                  {/* Gleitender Knopf. Er ist genau so breit wie eine Hälfte abzüglich des
                      Innenabstands – dadurch entspricht `translate-x-full` exakt dem Weg zur
                      rechten Position, ohne feste Pixelwerte. */}
                  <span
                    aria-hidden="true"
                    className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-yellow-500 shadow-sm transition-transform duration-200 ease-out ${
                      isClothing ? 'translate-x-0' : 'translate-x-full'
                    }`}
                  />
                  {([
                    { clothing: true, label: '👕 Kleidung' },
                    { clothing: false, label: '🧸 Keine Kleidung' },
                  ] as const).map(opt => (
                    <button
                      key={opt.label}
                      type="button"
                      role="radio"
                      aria-checked={isClothing === opt.clothing}
                      onClick={() => selectCategory(opt.clothing)}
                      className={`relative z-10 flex-1 py-2 px-2 text-sm font-semibold rounded-lg transition-colors ${
                        isClothing === opt.clothing ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {!isClothing && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    Für Spielsachen, Kindersitze und Sonstiges – Größe und Geschlecht entfallen.
                  </p>
                )}
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Beschreibung * (max. 30 Zeichen)</label>
                <input
                  ref={titleInputRef}
                  required maxLength={30}
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={isClothing ? 'z.B. Jeans blau, Winterjacke…' : 'z.B. Holzeisenbahn, Kindersitz…'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
                <div className={`text-right text-xs mt-0.5 ${form.title.length >= 28 ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>{form.title.length}/30</div>
              </div>
              {isClothing && (
              <div className="md:col-span-3">
                <span className="block text-xs font-medium text-gray-600 mb-1">Für wen?</span>
                {/* Die drei Optionen und „Auswahl aufheben" standen früher in einer gemeinsamen
                    Flex-Zeile. Zusammen sind sie breiter als ein iPhone-Viewport, wodurch der
                    Knopf aus der Zeile herausgedrückt wurde und am rechten Rand klebte.
                    Der Knopf steht deshalb jetzt grundsätzlich in einer eigenen Zeile unter den
                    Optionen – das hängt an keiner Breitenberechnung und kann auf keinem Gerät
                    danebengehen. Die Optionen selbst dürfen zusätzlich umbrechen, falls die
                    Schrift durch Systemeinstellungen größer gerendert wird. */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {(['Junge', 'Mädchen', 'Unisex'] as const).map(g => (
                    <label key={g} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="gender"
                        value={g}
                        checked={form.gender === g}
                        onChange={() => setForm(f => ({ ...f, gender: g }))}
                        className="accent-yellow-500 w-4 h-4 shrink-0"
                      />
                      <span className="text-sm text-gray-700">{g}</span>
                    </label>
                  ))}
                </div>
                {form.gender && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, gender: '' }))}
                    className="mt-2 text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    Auswahl aufheben
                  </button>
                )}
              </div>
              )}
              {isClothing && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="block text-xs font-medium text-gray-600">Größe</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowSizeTooltip(o => !o)}
                      className="w-4 h-4 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs flex items-center justify-center leading-none"
                      title="Unterstützte Größen anzeigen"
                    >
                      i
                    </button>
                    {showSizeTooltip && (
                      <div className="absolute left-0 top-6 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-72">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-semibold text-sm text-gray-800">Unterstützte Größen</span>
                          <button type="button" onClick={() => setShowSizeTooltip(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
                        </div>
                        {[
                          { label: 'Kleidung (Buchstaben)', filter: (s: string) => /^(XXS|XS|S|M|L|XL|XXL|3XL|4XL|5XL)$/.test(s) },
                          { label: 'Kleidung (cm)', filter: (s: string) => /^\d+$/.test(s) && parseInt(s) >= 50 && parseInt(s) <= 176 },
                          { label: 'Hosen (W-Größen)', filter: (s: string) => /^W\d+$/.test(s) },
                          { label: 'Schuhe', filter: (s: string) => /^\d+$/.test(s) && parseInt(s) >= 18 && parseInt(s) <= 49 },
                        ].map(group => {
                          const items = allowedSizes.filter(group.filter);
                          if (!items.length) return null;
                          return (
                            <div key={group.label} className="mb-2 last:mb-0">
                              <p className="text-xs text-gray-700 font-semibold mb-1">{group.label}</p>
                              <div className="flex flex-wrap gap-1">
                                {items.map(s => (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => { setForm(f => ({ ...f, sizeLabel: s })); setSizeError(''); setShowSizeTooltip(false); }}
                                    className="px-1.5 py-0.5 bg-gray-100 hover:bg-yellow-100 border border-gray-200 rounded text-xs font-mono font-bold text-gray-900 cursor-pointer"
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        <p className="text-xs text-gray-500 mt-2 border-t pt-2">Auf eine Größe klicken, um sie direkt einzufügen.</p>
                      </div>
                    )}
                  </div>
                </div>
                <input
                  list="size-options"
                  maxLength={40}
                  value={form.sizeLabel}
                  onChange={e => {
                    setForm(f => ({ ...f, sizeLabel: e.target.value }));
                    setSizeError('');
                  }}
                  onBlur={e => {
                    const v = e.target.value.trim();
                    if (v && allowedSizes.length > 0 && !allowedSizes.includes(v)) {
                      setSizeError(`"${v}" ist keine gültige Größe. Bitte ⓘ klicken für alle Optionen.`);
                    } else {
                      setSizeError('');
                    }
                  }}
                  placeholder="z.B. 110, M, W32…"
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                    sizeError ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
                <datalist id="size-options">
                  {allowedSizes.map(s => <option key={s} value={s} />)}
                </datalist>
                {sizeError && <p className="text-xs text-red-600 mt-1">{sizeError}</p>}
              </div>
              )}
              {/* Ohne Größenfeld bliebe in der 3-Spalten-Zeile eine Lücke – der Preis füllt sie. */}
              <div className={isClothing ? undefined : 'md:col-span-2'}>
                <label className="block text-xs font-medium text-gray-600 mb-1">Preis (€) *</label>
                <input
                  required type="number" min="0.50" step="0.50"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="0,50"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={articles.length >= maxArticles}
                  className="w-full py-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  + Hinzufügen
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Article list */}
        {articles.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700">Meine Artikel ({articles.length})</h2>
              {/* target="_blank" ist auf dem iPhone Pflicht, nicht Geschmackssache: die App
                  läuft als PWA mit display:standalone (public/manifest.json), also ohne
                  Adressleiste, Tabs und Zurück-Knopf. Wird dieses eine Fenster zum PDF
                  navigiert, führt kein Weg zurück – die App muss beendet und neu gestartet
                  werden. Mit _blank übernimmt Safari das PDF, das App-Fenster bleibt stehen.
                  Gilt für jeden PDF-Link in dieser Anwendung. */}
              {basar.status === 'OPEN' && (
                <a
                  href={`/api/basars/${basarId}/labels.pdf`}
                  download
                  target="_blank"
                  rel="noopener"
                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                >
                  🖨 Etiketten als PDF
                </a>
              )}
            </div>
            {basar.status === 'OPEN' && (
              <p className="px-5 py-2.5 text-xs text-gray-700 bg-amber-50 border-b border-amber-100">
                Beim Drucken <strong>{'„Tatsächliche Größe" / 100 %'}</strong> wählen – nicht{' '}
                {'„An Seite anpassen".'} Papierformat A4, Etikettenbögen 70 × 36 mm (z. B. Avery
                3475).{' '}
                <a
                  href={`/api/basars/${basarId}/labels.pdf?calibration=1`}
                  download
                  target="_blank"
                  rel="noopener"
                  className="underline hover:no-underline"
                >
                  Testseite für Normalpapier
                </a>
              </p>
            )}
            <div className="divide-y divide-gray-100">
              {articles.map(article => (
                <div key={article.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{article.title}</p>
                    <p className="text-xs text-gray-500">
                      {article.sizeLabel && `Größe: ${article.sizeLabel} · `}
                      {article.gender && (
                        <span className="inline-block mr-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-600">{article.gender}</span>
                      )}
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

        {articles.length === 0 && canAddArticles && (
          <div className="text-center py-12 text-gray-400">
            Noch keine Artikel. Füge deinen ersten Artikel oben hinzu!
          </div>
        )}
      </div>
    </div>
  );
}
