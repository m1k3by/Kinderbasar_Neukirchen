'use client';

import { useEffect, useState } from 'react';

/**
 * „Letzter Bon“ und „Meine Verkäufe“ an der Kasse – strikt nur Ansicht.
 *
 * Das Banner kommt aus einem lokalen Snapshot (nur die erfolgreich gebuchten Positionen), das
 * Overlay lädt die Server-Wahrheit inklusive Storno-Status von GET …/transactions. Kein
 * Seitenwechsel: die App läuft als PWA ohne Zurück-Knopf, ein Overlay in der Kasse-Seite
 * lässt Warenkorb und Zustand unberührt.
 */

export interface LastBon {
  txId: string;
  /** ISO-Zeitpunkt des Kassierens (Client-Uhr, nur fürs Banner). */
  at: string;
  count: number;
  total: number;
}

interface TxItem {
  saleId: string;
  articleTitle: string;
  sizeLabel: string | null;
  salePrice: number;
  isCancelled: boolean;
  sellerId: number;
}
interface Tx {
  txId: string | null;
  cashierId: number | null;
  cashierName: string;
  soldAt: string;
  total: number;
  items: TxItem[];
}
interface Summary { bons: number; articles: number; total: number }

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; transactions: Tx[]; nextCursor: string | null; summary: Summary };

function fmt(n: number) {
  return `${n.toFixed(2).replace('.', ',')} €`;
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function Positionen({ items }: { items: TxItem[] }) {
  return (
    <ul className="divide-y divide-gray-100">
      {items.map(i => (
        <li key={i.saleId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
          <div className={`min-w-0 ${i.isCancelled ? 'line-through text-gray-400' : 'text-gray-800'}`}>
            <p className="truncate">{i.articleTitle}</p>
            <p className="text-xs text-gray-400">#{i.sellerId}{i.sizeLabel && ` · ${i.sizeLabel}`}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <span className={i.isCancelled ? 'line-through text-gray-400' : 'font-semibold text-gray-800'}>{fmt(i.salePrice)}</span>
            {i.isCancelled && <span className="ml-2 text-xs text-gray-400">storniert</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Overlay({ basarId, view, lastBon, isAdmin, onShowList, onClose }: {
  basarId: string; view: 'bon' | 'list'; lastBon: LastBon | null; isAdmin: boolean;
  onShowList: () => void; onClose: () => void;
}) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  const txId = lastBon?.txId;
  useEffect(() => {
    let cancelled = false;
    setLoad({ status: 'loading' });
    const qs = view === 'bon' ? `txId=${encodeURIComponent(txId ?? '')}` : 'limit=50';
    fetch(`/api/basars/${basarId}/transactions?${qs}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => { if (!cancelled) setLoad({ status: 'ok', transactions: d.transactions, nextCursor: d.nextCursor, summary: d.summary }); })
      .catch(() => { if (!cancelled) setLoad({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [basarId, view, txId]);

  async function loadMore() {
    if (load.status !== 'ok' || !load.nextCursor) return;
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/basars/${basarId}/transactions?limit=50&cursor=${encodeURIComponent(load.nextCursor)}`);
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setLoad({ ...load, transactions: [...load.transactions, ...d.transactions], nextCursor: d.nextCursor });
    } catch {
      setLoad({ status: 'error' });
    } finally {
      setLoadingMore(false);
    }
  }

  const bon = load.status === 'ok' && view === 'bon' ? load.transactions[0] : undefined;
  const listLabel = isAdmin ? 'Alle Verkäufe' : 'Alle meine Verkäufe';

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-2">
        <button type="button" onClick={onClose} className="mb-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg">
          ‹ Zurück zur Kasse
        </button>

        {load.status === 'loading' && <p className="text-center text-sm text-gray-400 py-6">Lädt…</p>}
        {load.status === 'error' && <p className="text-center text-sm text-red-600 py-6">Konnte nicht geladen werden.</p>}

        {view === 'bon' && load.status === 'ok' && (
          <>
            <h2 className="text-base font-semibold text-gray-800 mb-2">
              Bon {time(bon?.soldAt ?? lastBon?.at ?? new Date().toISOString())}
            </h2>
            {bon ? (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <Positionen items={bon.items} />
                <div className="flex justify-between px-3 py-2 border-t border-gray-200 bg-gray-50 text-sm font-semibold text-gray-800">
                  <span>Summe</span><span>{fmt(bon.total)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Bon nicht gefunden.</p>
            )}
            <p className="text-xs text-gray-400 mt-2">Nur Ansicht – hier lässt sich nichts ändern.</p>
            <button type="button" onClick={onShowList} className="mt-3 w-full px-3 py-2 text-sm font-medium text-blue-800 bg-blue-100 rounded-lg">
              {listLabel} ›
            </button>
          </>
        )}

        {view === 'list' && load.status === 'ok' && (
          <>
            <h2 className="text-base font-semibold text-gray-800 mb-2">{isAdmin ? 'Alle Verkäufe' : 'Meine Verkäufe'}</h2>
            <div className="grid grid-cols-3 gap-2 mb-3 text-center">
              {([['Bons', String(load.summary.bons)], ['Artikel', String(load.summary.articles)], ['Summe', fmt(load.summary.total)]] as const).map(([label, value]) => (
                <div key={label} className="bg-white rounded-lg shadow-sm py-2">
                  <p className="text-sm font-bold text-gray-800">{value}</p>
                  <p className="text-xs text-gray-400">{label}</p>
                </div>
              ))}
            </div>
            {load.transactions.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-4">Noch keine Verkäufe.</p>
            ) : (
              <div className="space-y-2">
                {load.transactions.map(t => {
                  const key = t.txId ?? t.items[0]?.saleId;
                  const open = openKeys.has(key);
                  const storniert = t.items.filter(i => i.isCancelled).length;
                  return (
                    <div key={key} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpenKeys(prev => { const next = new Set(prev); if (!next.delete(key)) next.add(key); return next; })}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 text-sm text-left ${open ? 'border-b border-gray-200' : ''}`}
                      >
                        <span className="text-gray-600">
                          <span className={`inline-block text-gray-400 mr-1.5 ${open ? 'rotate-90' : ''}`}>▶</span>
                          {time(t.soldAt)} · {t.items.length - storniert} Art.
                          {storniert > 0 && <span className="text-red-600"> ({storniert} storn.)</span>}
                          {isAdmin && <span className="text-gray-400"> · {t.cashierName}</span>}
                        </span>
                        <span className="font-semibold text-gray-800">{fmt(t.total)}</span>
                      </button>
                      {open && <Positionen items={t.items} />}
                    </div>
                  );
                })}
              </div>
            )}
            {load.nextCursor && (
              <button type="button" onClick={loadMore} disabled={loadingMore} className="mt-3 w-full px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg disabled:opacity-50">
                {loadingMore ? 'Lädt…' : 'Mehr laden'}
              </button>
            )}
            <p className="text-xs text-gray-400 mt-3">Nur Ansicht – hier lässt sich nichts ändern.</p>
          </>
        )}
      </div>
    </div>
  );
}

export type BonView = 'bon' | 'list' | null;

/**
 * Der Zustand `view` liegt in der Kasse-Seite: die Liste lässt sich dort zusätzlich über einen
 * Knopf im Scanner-Kopf öffnen – auch ohne Banner, etwa nach einem Neuladen. Wer öffnet, stoppt
 * vorher den Scanner (siehe openBonView in page.tsx).
 */
export default function BonHistory({ basarId, lastBon, isAdmin, view, setView, onOpen }: {
  basarId: string; lastBon: LastBon | null; isAdmin: boolean;
  view: BonView; setView: (v: BonView) => void;
  /** Beim Öffnen aufgerufen – die Kasse stoppt damit den Scanner hinter dem Overlay. */
  onOpen: () => void;
}) {
  function open(v: 'bon' | 'list') {
    onOpen();
    setView(v);
  }

  return (
    <>
      {lastBon && (
        <button
          type="button"
          onClick={() => open('bon')}
          className="w-full flex items-center justify-between gap-2 mb-2 px-3 py-2 rounded-lg border bg-green-50 border-green-200 text-green-800 text-xs sm:text-sm text-left"
        >
          <span>Letzter Bon · {time(lastBon.at)} · {lastBon.count} Art.</span>
          <span className="font-semibold">{fmt(lastBon.total)} ›</span>
        </button>
      )}
      {view && (
        <Overlay
          basarId={basarId}
          view={view}
          lastBon={lastBon}
          isAdmin={isAdmin}
          onShowList={() => setView('list')}
          onClose={() => setView(null)}
        />
      )}
    </>
  );
}
