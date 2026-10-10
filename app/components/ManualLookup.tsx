'use client';

import { useState } from 'react';
import { lookupSellerArticles, type LookupArticle } from '../lib/manualLookup';

/** Wie auf dem Etikett: Komma, zwei Nachkommastellen – damit der Abgleich mit dem Schild leicht fällt. */
const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

interface Props {
  articles: LookupArticle[];
  /** QR-Codes, die schon im Warenkorb liegen – werden angezeigt, aber nicht noch einmal angeboten. */
  inCart: Set<string>;
  onSelect: (article: LookupArticle) => void;
  onClose: () => void;
  /**
   * Im Etiketten-Check zählen auch verkaufte Artikel – dort wäre „verfügbar" falsch.
   * An der Kasse (Standard) bleibt es dabei, denn dort ist nur Verfügbares relevant.
   */
  neutralCount?: boolean;
}

/*
 * Eingabefelder durchgehend mit text-base (16 px): iOS Safari zoomt bei kleinerer Schrift
 * beim Fokussieren in die Seite und zoomt danach nicht zurück. An der Kasse wird überwiegend
 * am Handy gearbeitet.
 */
const inputClass =
  'w-full min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-base bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400';

/**
 * Manuelle Eingabe, wenn ein QR-Code nicht lesbar ist: Verkäufernummer vom Etikett eintippen,
 * dann aus dessen noch nicht verkauften Artikeln über Bezeichnung, Größe und Preis den
 * richtigen eingrenzen. Die Auswahl übernimmt die Kasse wie einen Scan (siehe handleQrScan),
 * inklusive Serverprüfung.
 *
 * Layout in zwei Spalten, auch am kleinsten Handy (320 px): Nummer und Bezeichnung über die
 * volle Breite, Größe und Preis nebeneinander – beide sind kurz.
 */
export default function ManualLookup({ articles, inCart, onSelect, onClose, neutralCount = false }: Props) {
  const [sellerInput, setSellerInput] = useState('');
  const [title, setTitle] = useState('');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');

  const sellerId = parseInt(sellerInput, 10);
  const result = Number.isFinite(sellerId)
    ? lookupSellerArticles(articles, sellerId, { title, size, price })
    : null;
  const canFilter = !!result && result.available > 0;
  const filtered = !!(title.trim() || size.trim() || price.trim());

  return (
    <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-blue-900">Artikel manuell suchen</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Manuelle Suche schließen"
          className="-mr-1 px-3 py-1.5 text-gray-500 hover:text-gray-800"
        >
          ✕
        </button>
      </div>

      {articles.length === 0 ? (
        <p className="text-sm text-orange-800">
          Auf diesem Gerät ist noch keine Artikelliste geladen. Bitte einmal mit Internet die
          Kasse öffnen – danach funktioniert die Suche auch offline.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="Verkäufer-Nr."
              aria-label="Verkäufernummer"
              value={sellerInput}
              onChange={e => {
                setSellerInput(e.target.value.replace(/\D/g, '').slice(0, 5));
                setTitle('');
                setSize('');
                setPrice('');
              }}
              className={`${inputClass} col-span-2`}
            />
            <input
              type="text"
              autoComplete="off"
              placeholder="Bezeichnung"
              aria-label="Bezeichnung"
              value={title}
              onChange={e => setTitle(e.target.value)}
              disabled={!canFilter}
              className={`${inputClass} col-span-2`}
            />
            <input
              type="text"
              autoComplete="off"
              placeholder="Größe"
              aria-label="Größe"
              value={size}
              onChange={e => setSize(e.target.value)}
              disabled={!canFilter}
              className={inputClass}
            />
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Preis €"
              aria-label="Preis"
              value={price}
              onChange={e => setPrice(e.target.value)}
              disabled={!canFilter}
              className={inputClass}
            />
          </div>

          {result && (
            result.total === 0 ? (
              <p className="text-sm text-gray-700">Keine Artikel von Verkäufer {sellerId} in diesem Basar.</p>
            ) : result.available === 0 ? (
              <p className="text-sm text-gray-700">
                Alle {result.total} Artikel von {result.sellerName} (Nr. {sellerId}) sind bereits verkauft.
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-600 mb-1.5">
                  <strong>{result.sellerName}</strong> (Nr. {sellerId}) ·{' '}
                  {filtered
                    ? `${result.matches.length} von ${result.available} ${neutralCount ? '' : 'verfügbaren '}Artikeln`
                    : `${result.available} ${neutralCount ? '' : 'verfügbare '}Artikel`}
                </p>
                {result.matches.length === 0 ? (
                  <p className="text-sm text-gray-700">Kein Artikel passt zu dieser Kombination.</p>
                ) : (
                  // Eigene Scrollfläche, an der Bildschirmhöhe bemessen: bei geöffneter
                  // Tastatur bleibt am Handy oft nur die Hälfte sichtbar.
                  <ul className="max-h-[45vh] overflow-y-auto overscroll-contain space-y-1.5">
                    {result.matches.map(a => {
                      const taken = inCart.has(a.qrCode);
                      return (
                        <li key={a.qrCode}>
                          <button
                            type="button"
                            disabled={taken}
                            onClick={() => onSelect(a)}
                            className="w-full flex items-center gap-3 text-left px-3 py-2.5 min-h-[48px] bg-white rounded-lg border border-gray-200 hover:border-blue-400 active:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="flex-1 min-w-0">
                              <span className="block font-medium text-sm text-gray-900 truncate">{a.title}</span>
                              <span className="block text-xs text-gray-500">
                                {a.sizeLabel ? `Größe ${a.sizeLabel}` : 'ohne Größe'}
                                {taken && ' · im Warenkorb'}
                              </span>
                            </span>
                            <span className="text-sm font-bold text-gray-800 shrink-0 whitespace-nowrap">{euro(a.price)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
