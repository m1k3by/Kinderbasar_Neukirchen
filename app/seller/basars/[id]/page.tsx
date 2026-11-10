'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../../components/Header';
import { getNavLinks } from '../../../lib/navLinks';
import { formatArticleLimit, maxArticlesFor } from '../../../lib/articleLimits';
import { settlementAmounts } from '../../../lib/payout';

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
  // Persönlicher Provisionssatz in Prozent. Prisma.Decimal kommt als JSON-String an
  // (GET /api/basars/[id]/articles liefert die ganze Zeile); null = Satz des Basars.
  commissionOverride?: string | number | null;
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
  /** Testbasar: nur für Eingeladene sichtbar (app/lib/basarAccess.ts). Die Route liefert es immer. */
  isTest: boolean;
  myParticipation?: { isActive: boolean; activatedAt: string | null; viaOrga?: boolean } | null;
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
  const [message, setMessage] = useState('');
  const [messageOk, setMessageOk] = useState(true);
  const [isEmployee, setIsEmployee] = useState(false);
  const [isOrga, setIsOrga] = useState(false);
  const [isCashier, setIsCashier] = useState(false);
  // Etiketten-Dialog: 'choice' = Abfrage ganzer Bogen oder Einzelauswahl, 'pick' = Auswahlliste.
  // 'downloading': nach dem Antippen des Druck-Links. Vorher schloss sich der Dialog sofort, und
  // bis das PDF da war, zeigte die Seite nichts – auf dem Handy wirkte das wie „passiert nichts"
  // (10.10.2026). Der Server braucht gemessen 0,2–0,9 s (60–400 Etiketten), dazu Netz und Kaltstart.
  const [labelDialog, setLabelDialog] = useState<null | 'choice' | 'pick' | 'downloading'>(null);
  const [labelDownloadSettled, setLabelDownloadSettled] = useState(false);
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set());
  // Angebrochener Etikettenbogen: Plätze 0–23 (zeilenweise von oben links), die schon
  // verbraucht sind und frei bleiben müssen. Leer = vollständiger Bogen.
  const [usedSlots, setUsedSlots] = useState<Set<number>>(new Set());
  // Entwurf im Bogen-Overlay; erst „Übernehmen" schreibt ihn nach usedSlots.
  const [slotDraft, setSlotDraft] = useState<Set<number> | null>(null);

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
          setIsOrga(me.isOrga || false);
          setIsCashier(me.isCashier || false);
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

  // Rückmeldung nach dem Antippen des Etiketten-Links. Der Download bleibt ein <a> (PDF-Regel 7,
  // siehe Dialog), deshalb erfährt die Seite nicht, wann die Datei angekommen ist. Sie kann nur
  // zeigen, was gerade passiert:
  //  - Wechselt das Handy für das PDF in einen neuen Tab (iPhone, Desktop) und kommt man danach
  //    zurück, wird die Seite erst unsichtbar, dann wieder sichtbar → Dialog schließt sich.
  //  - Lädt es still in die Downloads (Android), bleibt die Seite sichtbar. Dann wechselt der
  //    Text nach einigen Sekunden auf „sollte jetzt da sein", geschlossen wird über „Fertig".
  useEffect(() => {
    if (labelDialog !== 'downloading') return;
    const timer = setTimeout(() => setLabelDownloadSettled(true), 5000);
    let wasHidden = document.visibilityState === 'hidden';
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') wasHidden = true;
      else if (wasHidden) setLabelDialog(null);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      // Beim Verlassen zurücksetzen, nicht beim nächsten Eintritt: sonst zeichnet der nächste
      // Download für einen Bildaufbau noch den alten Haken, bevor der Effekt ihn löscht
      // (gemessen am 10.10.2026: erst „✓ … sollte jetzt da sein", dann „PDF wird erstellt").
      setLabelDownloadSettled(false);
    };
  }, [labelDialog]);

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

  const maxArticles = maxArticlesFor(basar, { isEmployee, isOrga }, basarSeller?.maxArticlesOverride);
  const soldCount = articles.filter(a => a.status === 'SOLD').length;
  // In ganzen Cent summiert, wie das SUM der Datenbank in der Abrechnung. Als Gleitkommasumme
  // hinge die Genauigkeit am Preisraster: 0,50er-Schritte sind binär exakt, 0,10er nicht.
  const soldRevenue =
    articles.filter(a => a.status === 'SOLD').reduce((cents, a) => cents + Math.round(Number(a.price) * 100), 0) / 100;
  // Vorschau mit derselben Formel wie die Abrechnung (app/lib/payout.ts) – inklusive
  // persönlichem Satz, Teilnahmegebühr und 10-Cent-Rundung. Eine eigene, vereinfachte
  // Rechnung hier würde einen Betrag versprechen, den die Abrechnung nicht zahlt.
  const commissionPercent = Number(basarSeller?.commissionOverride ?? basar.commissionPercent);
  const payoutPreview = settlementAmounts(soldRevenue, commissionPercent, Number(basar.entryFee));
  // Nur der Basar-Status entscheidet, nicht die Teilnahme: Artikel dürfen vorbereitet
  // werden, bevor man sich anmeldet (die API sieht das genauso, siehe
  // app/api/basars/[id]/articles/route.ts).
  const canAddArticles = basar.status === 'OPEN';
  const isReadOnly = basar.status === 'ACTIVE' || basar.status === 'CLOSED';

  // Neueste zuerst – bewusst aus createdAt gerechnet und nicht aus der Reihenfolge von
  // `articles`: das optimistische Anlegen stellt neue Artikel vorne ein, ein fehlgeschlagenes
  // Löschen sortiert wieder aufsteigend. Die Array-Reihenfolge stimmt also je nach
  // Vorgeschichte mal so und mal so.
  const labelPickList = [...articles].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Sind alle ausgewählt, entfällt der Parameter – dann ist es derselbe Aufruf wie „Alle",
  // und die URL bleibt kurz.
  // ponytail: IDs in der URL, bei ~200 Artikeln rund 5 KB. Trägt jeder Browser; erst wenn
  // jemand vierstellig auswählt (Orga hat kein Artikellimit), bräuchte es POST + Token.
  const labelQuery = new URLSearchParams();
  if (selectedLabelIds.size > 0 && selectedLabelIds.size < articles.length) {
    labelQuery.set('ids', [...selectedLabelIds].join(','));
  }
  if (usedSlots.size > 0) {
    labelQuery.set('skip', [...usedSlots].sort((a, b) => a - b).join(','));
  }
  const labelQs = labelQuery.toString();
  const labelHref = `/api/basars/${basarId}/labels.pdf${labelQs ? `?${labelQs}` : ''}`;

  const toggleLabel = (id: string) => {
    setSelectedLabelIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
          <h1 className="text-2xl font-bold text-gray-800">{basar.title}{basar.isTest && <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800">TEST</span>}</h1>
          <p className="text-gray-500 mt-1">
            {new Date(basar.eventDate).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
            {basar.location && ` · ${basar.location}`}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {Number(basar.commissionPercent).toFixed(0)}% Provision · Max. {formatArticleLimit(maxArticles)} Artikel
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
            {/* Zwei Spalten am Handy, vier ab sm: vier Beträge nebeneinander passen auf
                375 px nicht, ohne dass die Ziffern umbrechen. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <div className="text-center bg-gray-50 rounded-lg p-3">
                <div className="text-xl sm:text-2xl font-bold text-gray-800">{articles.length}</div>
                <div className="text-xs text-gray-500">Artikel gesamt</div>
              </div>
              <div className="text-center bg-green-50 rounded-lg p-3">
                <div className="text-xl sm:text-2xl font-bold text-green-600">{soldCount}</div>
                <div className="text-xs text-gray-500">Verkauft</div>
              </div>
              <div className="text-center bg-blue-50 rounded-lg p-3">
                <div className="text-xl sm:text-2xl font-bold text-blue-600 whitespace-nowrap">{fmt(soldRevenue)} €</div>
                <div className="text-xs text-gray-500">Erlös bisher</div>
              </div>
              <div className="text-center bg-emerald-50 rounded-lg p-3 ring-1 ring-emerald-200">
                <div className="text-xl sm:text-2xl font-bold text-emerald-700 whitespace-nowrap">{fmt(payoutPreview.netPayout)} €</div>
                <div className="text-xs text-gray-500">Auszahlung</div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Auszahlung = Erlös abzüglich {fmt(commissionPercent).replace(/,00$/, '')} % Provision
              {Number(basar.entryFee) > 0 && ` und ${fmt(Number(basar.entryFee))} € Teilnahmegebühr`},
              auf 10 Cent gerundet. Stand jetzt – verbindlich ist die Abrechnung nach dem Basar.
            </p>
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
              <div className="flex justify-between"><span className="text-gray-600">Verkaufserlös</span><span className="font-medium">{fmt(Number(settlement.grossRevenue))} €</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Provision ({basar.commissionPercent}%)</span><span className="font-medium text-orange-600">– {fmt(Number(settlement.commissionAmount))} €</span></div>
              {Number(settlement.entryFeeAmount) > 0 && (
                <div className="flex justify-between"><span className="text-gray-600">Teilnahmegebühr</span><span className="font-medium text-orange-600">– {fmt(Number(settlement.entryFeeAmount))} €</span></div>
              )}
              {/* Wie im PDF: der Auszahlbetrag ist auf 10 Cent gerundet, deshalb das exakte
                  Ergebnis daneben – sonst scheint die Spalte darüber falsch zu rechnen. */}
              {Math.abs(
                Number(settlement.grossRevenue) - Number(settlement.commissionAmount)
                  - Number(settlement.entryFeeAmount) - Number(settlement.netPayout)
              ) >= 0.005 && (
                <div className="flex justify-between"><span className="text-gray-600">Ergebnis</span><span className="font-medium">{fmt(Math.max(0, Number(settlement.grossRevenue) - Number(settlement.commissionAmount) - Number(settlement.entryFeeAmount)))} €</span></div>
              )}
              <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
                <span className="font-bold text-gray-800 text-base">Auszahlung</span>
                <span className="text-2xl font-extrabold text-green-600">{fmt(Number(settlement.netPayout))} €</span>
              </div>
            </div>
          </div>
        )}

        {/* Anlegen, Bearbeiten, Taggen und Übernehmen gibt es nur noch an einer Stelle:
            „Meine Artikel" (/seller/articles). Bis 11.2026 hatte diese Seite ein eigenes
            Formular und eine eigene Archiv-Übernahme – zwei Oberflächen für dasselbe. */}
        {canAddArticles && (
          <Link
            href="/seller/articles"
            className="flex items-center justify-between gap-4 bg-yellow-50 border border-yellow-200 rounded-xl p-5 mb-5 hover:bg-yellow-100 transition-colors"
          >
            <div>
              <h2 className="font-bold text-gray-800">
                Artikel anlegen, bearbeiten oder übernehmen
                <span className={`ml-2 text-sm font-normal ${articles.length >= maxArticles ? 'text-orange-600 font-semibold' : 'text-gray-500'}`}>
                  ({articles.length}/{formatArticleLimit(maxArticles)})
                </span>
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                In <strong>Meine Artikel</strong> legst du neue Artikel direkt in diesem Basar an und übernimmst
                Artikel aus früheren Basaren – mit Tags und Filtern.
              </p>
            </div>
            <span className="text-yellow-600 font-bold text-xl flex-shrink-0">→</span>
          </Link>
        )}

        {/* Article list */}
        {articles.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700">Artikel in diesem Basar ({articles.length})</h2>
              {/* Öffnet die Abfrage „ganzer Bogen oder einzelne Artikel". Der eigentliche
                  Download bleibt auch dort ein <a> – siehe Kommentar am Dialog. */}
              {basar.status === 'OPEN' && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLabelIds(new Set());
                    setUsedSlots(new Set());
                    setLabelDialog('choice');
                  }}
                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                >
                  🖨 Etiketten als PDF
                </button>
              )}
            </div>
            {basar.status === 'OPEN' && (
              <p className="px-5 py-2.5 text-xs text-gray-700 bg-amber-50 border-b border-amber-100">
                Auf Etikettenbögen immer <strong>{'„Tatsächliche Größe" / 100 %'}</strong> wählen.
                Auf Normalpapier zum Ausschneiden darf {'„An Seite anpassen"'} gewählt werden, falls
                der Drucker oben oder unten etwas abschneidet. Papierformat A4, Etikettenbögen
                70 × 36 mm (z. B. Avery 3475).{' '}
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
            Noch keine Artikel in diesem Basar. Lege sie oben über „Meine Artikel“ an.
          </div>
        )}

        {/* Etiketten-Dialog: ganzer Bogen oder einzelne Artikel.
            Der Druckknopf ist in beiden Fällen ein <a> und kein window.open(): die App läuft
            als PWA mit display:standalone (public/manifest.json), also ohne Adressleiste,
            Tabs und Zurück-Knopf. Wird dieses eine Fenster zum PDF navigiert, führt kein Weg
            zurück – die App müsste beendet und neu gestartet werden. Mit target="_blank"
            übernimmt Safari das PDF und das App-Fenster bleibt stehen. Gilt für jeden
            PDF-Link in dieser Anwendung.
            Höhe über max-h-[85vh] mit scrollender Mitte: damit passt der Dialog auch auf ein
            Telefon im Querformat, ohne dass der Druckknopf unten aus dem Bild rutscht. */}
        {labelDialog && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setLabelDialog(null)}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-800">Etiketten drucken</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {labelDialog === 'downloading'
                    ? 'Dein PDF'
                    : labelDialog === 'choice'
                    ? 'Den ganzen Bogen drucken oder nur einzelne Artikel?'
                    : `${selectedLabelIds.size} von ${articles.length} ausgewählt`}
                </p>
              </div>

              {labelDialog === 'downloading' ? (
                <div className="p-5" role="status" aria-live="polite">
                  <div className="flex items-center gap-3">
                    {labelDownloadSettled ? (
                      <span className="text-2xl text-green-600" aria-hidden="true">✓</span>
                    ) : (
                      <span className="h-6 w-6 rounded-full border-[3px] border-blue-200 border-t-blue-500 animate-spin flex-shrink-0" aria-hidden="true" />
                    )}
                    <p className="font-semibold text-gray-800">
                      {labelDownloadSettled ? 'Das PDF sollte jetzt da sein.' : 'PDF wird erstellt …'}
                    </p>
                  </div>
                  <p className="text-sm text-gray-600 mt-3">
                    Je nach Handy öffnet es sich in einem <strong>neuen Tab</strong> oder landet in deinen
                    {' '}<strong>Downloads</strong> – dann siehst du oben eine Benachrichtigung oder unten eine
                    Download-Leiste.{!labelDownloadSettled && ' Das dauert meist ein, zwei Sekunden.'}
                  </p>
                </div>
              ) : labelDialog === 'choice' ? (
                <div className="p-5 space-y-3">
                  <a
                    href={labelHref}
                    download
                    target="_blank"
                    rel="noopener"
                    onClick={() => setLabelDialog('downloading')}
                    className="block w-full text-center px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
                  >
                    Alle Artikel ({articles.length})
                  </a>
                  <button
                    type="button"
                    onClick={() => setLabelDialog('pick')}
                    className="block w-full px-4 py-3 border-2 border-dashed border-blue-300 text-blue-700 font-semibold rounded-lg hover:bg-blue-50 hover:border-blue-400 transition-colors"
                  >
                    Einzelne Artikel auswählen →
                  </button>
                </div>
              ) : (
                <>
                  <div className="px-5 py-2.5 border-b border-gray-100 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedLabelIds(prev =>
                          prev.size === articles.length ? new Set() : new Set(articles.map(a => a.id))
                        )
                      }
                      className="text-sm text-blue-600 hover:underline font-medium"
                    >
                      {selectedLabelIds.size === articles.length ? 'Auswahl aufheben' : 'Alle auswählen'}
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
                    {labelPickList.map(a => (
                      <label
                        key={a.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 hover:border-blue-300 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={selectedLabelIds.has(a.id)}
                          onChange={() => toggleLabel(a.id)}
                          className="w-5 h-5 accent-blue-500 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm text-gray-800 truncate block">{a.title}</span>
                          <span className="text-xs text-gray-500">
                            {a.sizeLabel && `Größe: ${a.sizeLabel} · `}{fmt(Number(a.price))} €
                            {a.status === 'SOLD' && ' · verkauft'}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}

              {labelDialog !== 'downloading' && (
                <div className="px-5 py-2.5 border-t border-gray-100 flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-700">
                    {usedSlots.size === 0
                      ? 'Etikettenbogen: vollständig'
                      : `Etikettenbogen: angebrochen, ${24 - usedSlots.size} von 24 frei`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSlotDraft(new Set(usedSlots))}
                    className="text-blue-600 hover:underline font-medium whitespace-nowrap"
                  >
                    {usedSlots.size === 0 ? 'Bogen ist angebrochen?' : 'Ändern'}
                  </button>
                </div>
              )}

              {/* Pflichthinweis an der Download-Stelle: ohne „Tatsächliche Größe" skaliert der
                  Druckdialog den Bogen und die Etiketten passen nicht mehr auf die Stanzung. */}
              <div className="px-5 py-2.5 text-xs text-gray-700 bg-amber-50 border-t border-amber-100">
                Auf Etikettenbögen immer <strong>{'„Tatsächliche Größe" / 100 %'}</strong> wählen.
                Auf Normalpapier zum Ausschneiden darf {'„An Seite anpassen"'} gewählt werden, falls
                der Drucker oben oder unten etwas abschneidet.
              </div>

              <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => (labelDialog === 'pick' ? setLabelDialog('choice') : setLabelDialog(null))}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm"
                >
                  {labelDialog === 'pick' ? '← Zurück' : labelDialog === 'downloading' ? 'Fertig' : 'Abbrechen'}
                </button>
                {labelDialog === 'pick' && (
                  // Ein <a> kennt kein disabled – ohne Auswahl wird es deshalb über
                  // aria-disabled und pointer-events-none stillgelegt.
                  <a
                    href={labelHref}
                    download
                    target="_blank"
                    rel="noopener"
                    aria-disabled={selectedLabelIds.size === 0}
                    onClick={e => {
                      if (selectedLabelIds.size === 0) e.preventDefault();
                      else setLabelDialog('downloading');
                    }}
                    className={`px-4 py-2 bg-blue-500 text-white font-semibold text-sm rounded-lg transition-colors ${
                      selectedLabelIds.size === 0
                        ? 'opacity-50 pointer-events-none'
                        : 'hover:bg-blue-600'
                    }`}
                  >
                    {selectedLabelIds.size > 0
                      ? `${selectedLabelIds.size} Etiketten drucken`
                      : 'Etiketten drucken'}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bogen-Overlay über dem Etikettendialog: 3 × 8 Plätze wie auf dem Avery-3475-Bogen.
            Grün = frei, wird bedruckt; grau = schon verbraucht, bleibt leer. */}
        {slotDraft && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
            onClick={() => setSlotDraft(null)}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[90vh] flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-labelledby="slot-title"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 id="slot-title" className="text-lg font-bold text-gray-800">Angebrochener Bogen</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Tippe die Felder an, die schon abgezogen oder bedruckt sind. Dort wird nichts gedruckt.
                </p>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-3">
                {/* Seitenverhältnis wie der Bogen (210 × 297 mm), damit die Lage auf einen Blick passt. */}
                <div className="grid grid-cols-3 gap-1 aspect-[210/297] max-h-[55vh] mx-auto p-1 border border-gray-300 rounded bg-gray-50">
                  {Array.from({ length: 24 }, (_, i) => {
                    const used = slotDraft.has(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={!used}
                        aria-label={`Feld ${i + 1}: ${used ? 'verbraucht' : 'frei'}`}
                        onClick={() =>
                          setSlotDraft(prev => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                        className={`rounded text-xs font-semibold transition-colors ${
                          used
                            ? 'bg-gray-300 text-gray-500 line-through'
                            : 'bg-green-500 text-white hover:bg-green-600'
                        }`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
                <p className="text-sm text-gray-600 mt-3 text-center">
                  {24 - slotDraft.size} von 24 Feldern frei
                  {slotDraft.size === 24 && ' – mindestens eines muss frei bleiben'}
                </p>
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSlotDraft(new Set())}
                  className="px-3 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm"
                >
                  Alle frei
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSlotDraft(null)}
                    className="px-3 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    disabled={slotDraft.size === 24}
                    onClick={() => {
                      setUsedSlots(slotDraft);
                      setSlotDraft(null);
                    }}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition-colors"
                  >
                    Übernehmen
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
