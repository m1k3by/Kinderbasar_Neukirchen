'use client';

import { useEffect, useRef, useState } from 'react';
import Header from '../../components/Header';
import ManualLookup from '../../components/ManualLookup';
import { getNavLinks } from '../../lib/navLinks';
import { STATUS_LABELS, type BasarStatusValue } from '../../lib/basarStatus';
import type { LookupArticle } from '../../lib/manualLookup';
import {
  buildScannerConfig,
  hasNativeBarcodeDetector,
  scannerTuning,
  SCANNER_VIEWPORT_HEIGHT,
} from '../../lib/scannerConfig';

interface CheckSeller {
  sellerId: number;
  firstName: string;
  lastName: string;
  email: string;
  isEmployee: boolean;
  isOrga: boolean;
  isCashier: boolean;
}

interface Occurrence {
  articleId: string;
  title: string;
  sizeLabel: string | null;
  gender: string | null;
  price: number;
  status: 'AVAILABLE' | 'SOLD' | 'RETURNED';
  soldAt: string | null;
  salePrice: number | null;
  basar: { id: string; title: string; status: BasarStatusValue; isArchived: boolean };
}

interface CheckResult {
  qrCode: string;
  seller: CheckSeller;
  archive: { title: string; sizeLabel: string | null; gender: string | null; price: number } | null;
  occurrences: Occurrence[];
}

type Via = 'scan' | 'manuell';
type View =
  | { kind: 'idle' }
  | { kind: 'loading'; raw: string; via: Via }
  | { kind: 'ok'; raw: string; via: Via; data: CheckResult }
  | { kind: 'error'; raw: string; via: Via; message: string };

const ARTICLE_STATUS: Record<Occurrence['status'], string> = {
  AVAILABLE: 'Verfügbar',
  SOLD: 'Verkauft',
  RETURNED: 'Zurückgegeben',
};

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/**
 * Etiketten-Check (nur Admin): Etikett scannen oder Artikel manuell suchen und sehen, was
 * dahintersteckt – Artikel, Verkäufer, in welchem Basar mit welchem Status. Jederzeit nutzbar,
 * unabhängig vom Status eines Basars (Daten: GET /api/admin/article-check).
 *
 * Bewusst ohne jede Kassenfunktion: kein Warenkorb, kein Verkauf, kein Aufruf einer
 * schreibenden Route. Die Seite liest ausschließlich.
 */
export default function EtikettenCheckPage() {
  const [scanning, setScanning] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupArticles, setLookupArticles] = useState<LookupArticle[] | null>(null);
  const [lookupError, setLookupError] = useState('');

  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  // Bleibt ein Etikett im Bild, liefert der Scanner denselben Code mehrmals pro Sekunde.
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);

  async function check(raw: string, via: Via) {
    setView({ kind: 'loading', raw, via });
    try {
      const res = await fetch(`/api/admin/article-check/${encodeURIComponent(raw)}`);
      const data = await res.json();
      if (!res.ok) {
        setView({ kind: 'error', raw, via, message: data.error || 'Prüfung fehlgeschlagen.' });
        return;
      }
      setView({ kind: 'ok', raw, via, data });
    } catch {
      setView({ kind: 'error', raw, via, message: 'Keine Verbindung zum Server.' });
    }
  }

  // ponytail: Start/Stopp wie an der Kasse (app/admin/basars/[id]/kasse/page.tsx), ohne deren
  // iOS-Wiederaufnahme nach App-Wechsel – hier genügt ein erneutes „Scannen". Nach dem Basar
  // beide in einen gemeinsamen Hook ziehen; vorher wird die Kasse nicht angefasst.
  async function startScanner() {
    setScannerError('');
    setScanning(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('check-reader');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        buildScannerConfig(scannerTuning(hasNativeBarcodeDetector())),
        async (decoded: string) => {
          const last = lastScanRef.current;
          if (last && last.code === decoded && Date.now() - last.at < 2500) return;
          lastScanRef.current = { code: decoded, at: Date.now() };
          try { await scanner.pause(); } catch { /* ignore */ }
          await check(decoded, 'scan');
          await new Promise(r => setTimeout(r, 800));
          try { await scanner.resume(); } catch { /* ignore */ }
        },
        () => { /* einzelne Fehlversuche beim Dekodieren sind normal */ }
      );
    } catch (err) {
      setScannerError('Kamera nicht verfügbar: ' + ((err as Error)?.message || String(err)));
      setScanning(false);
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch { /* ignore */ }
      scannerRef.current = null;
    }
    setScanning(false);
  }

  useEffect(() => () => { stopScanner(); }, []);

  async function openLookup() {
    setLookupOpen(true);
    if (lookupArticles) return;
    setLookupError('');
    try {
      const res = await fetch('/api/admin/article-check');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLookupArticles(data.articles);
    } catch {
      setLookupError('Artikelliste konnte nicht geladen werden.');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header links={getNavLinks({ role: 'admin' }, 'etikettencheck')} />
      <div className="max-w-2xl mx-auto p-3 sm:p-4">
        <div className="bg-white rounded-xl shadow-md p-3 sm:p-4 mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <h1 className="text-lg font-bold text-gray-800">Etiketten-Check</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={lookupOpen ? () => setLookupOpen(false) : openLookup}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${lookupOpen ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-800 hover:bg-blue-200'}`}
              >
                ⌨ Manuell
              </button>
              <button
                onClick={scanning ? stopScanner : startScanner}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${scanning ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'}`}
              >
                {scanning ? '■ Stop' : '▶ Scannen'}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Prüft ein Etikett: ist der QR-Code lesbar, zu welchem Artikel gehört er, wo steht er.
            Nur zur Kontrolle – hier wird nichts verkauft oder verändert.
          </p>

          {scannerError && <p className="text-red-600 text-sm mb-2">{scannerError}</p>}

          {lookupOpen && (
            lookupError ? (
              <p className="mb-3 text-sm text-red-700">{lookupError}</p>
            ) : !lookupArticles ? (
              <p className="mb-3 text-sm text-gray-500">Artikelliste wird geladen…</p>
            ) : (
              <ManualLookup
                articles={lookupArticles}
                inCart={new Set()}
                neutralCount
                onSelect={a => { setLookupOpen(false); check(a.qrCode, 'manuell'); }}
                onClose={() => setLookupOpen(false)}
              />
            )
          )}

          <div
            className={`w-full rounded-lg bg-gray-100 relative overflow-hidden ${scanning ? 'block' : 'hidden'}`}
            style={{ height: scanning ? SCANNER_VIEWPORT_HEIGHT : 0 }}
          >
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
              <div id="check-reader" className="w-full" />
            </div>
          </div>
        </div>

        <CheckResultCard view={view} />
      </div>
    </div>
  );
}

function CheckResultCard({ view }: { view: View }) {
  if (view.kind === 'idle') {
    return (
      <p className="text-center text-sm text-gray-400 py-6">
        ▶ Scannen drücken und ein Etikett vor die Kamera halten – oder manuell suchen.
      </p>
    );
  }

  if (view.kind === 'loading') {
    return <div className="bg-white rounded-xl shadow-md p-4 text-sm text-gray-500">Prüfe {view.raw} …</div>;
  }

  if (view.kind === 'error') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <p className="font-semibold text-red-800">✕ {view.message}</p>
        {view.via === 'scan' && (
          <p className="text-xs text-red-700 mt-1">
            Gelesener Inhalt: <code className="break-all">{view.raw}</code>
          </p>
        )}
      </div>
    );
  }

  const { data, via } = view;
  // Die Etikettdaten stehen im Archiv; Altbestand ohne Archiveintrag nimmt den jüngsten Basar.
  const label = data.archive ?? data.occurrences[0];
  const s = data.seller;
  const rolle = s.isEmployee ? (s.isOrga ? 'Mitarbeiter (Orga)' : 'Mitarbeiter') : 'Verkäufer';

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      <div className={via === 'scan' ? 'bg-green-600 text-white px-4 py-2.5' : 'bg-blue-600 text-white px-4 py-2.5'}>
        <p className="font-semibold">{via === 'scan' ? '✓ QR-Code lesbar und zugeordnet' : 'Artikel gefunden (manuell)'}</p>
        {via === 'manuell' && (
          <p className="text-xs opacity-90">Manuell gesucht – der QR-Code selbst wurde dabei nicht geprüft.</p>
        )}
      </div>

      <div className="p-4 space-y-4">
        <section>
          <h2 className="text-xs font-semibold uppercase text-gray-500 mb-1">Artikel</h2>
          <p className="text-lg font-bold text-gray-900 break-words">{label.title}</p>
          <p className="text-sm text-gray-700">
            {label.sizeLabel ? `Größe ${label.sizeLabel}` : 'ohne Größe'}
            {label.gender && ` · ${label.gender}`} · <strong>{euro(label.price)}</strong>
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Code: <code className="break-all">{data.qrCode}</code>
          </p>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase text-gray-500 mb-1">Verkäufer</h2>
          <p className="text-sm text-gray-900">
            <strong>Nr. {s.sellerId}</strong> · {s.firstName} {s.lastName}
          </p>
          <p className="text-sm text-gray-700 break-all">{s.email}</p>
          <p className="text-xs text-gray-500">
            {rolle}
            {s.isCashier && ' · Kassierer'}
          </p>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase text-gray-500 mb-1">Wo steht der Artikel?</h2>
          {data.occurrences.length === 0 ? (
            <p className="text-sm text-gray-700">
              In keinem Basar angelegt – nur im Archiv des Verkäufers.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.occurrences.map(o => (
                <li key={o.articleId} className="border border-gray-200 rounded-lg px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-gray-900 break-words">
                      {o.basar.title}
                      {o.basar.isArchived && <span className="text-gray-400"> (archiviert)</span>}
                    </span>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                      o.status === 'SOLD' ? 'bg-green-100 text-green-700'
                        : o.status === 'RETURNED' ? 'bg-gray-100 text-gray-600'
                          : 'bg-blue-100 text-blue-700'
                    }`}>
                      {ARTICLE_STATUS[o.status]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Basar: {STATUS_LABELS[o.basar.status] ?? o.basar.status}
                    {o.status === 'SOLD' && o.soldAt &&
                      ` · verkauft am ${new Date(o.soldAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`}
                    {o.salePrice !== null && o.salePrice !== o.price && ` für ${euro(o.salePrice)}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
