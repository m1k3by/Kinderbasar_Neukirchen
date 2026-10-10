'use client';

import { useEffect, useState } from 'react';

interface Invite {
  createdAt: string;
  seller: { sellerId: number; firstName: string; lastName: string; isEmployee: boolean; isOrga: boolean };
}

const roleLabel = (s: Invite['seller']) => (s.isOrga ? 'Orga' : s.isEmployee ? 'MA' : 'VK');

/**
 * Einladungen in einen Testbasar (app/api/basars/[id]/invites). Nur für den Admin und nur bei
 * Testbasaren eingebunden. Nummern lassen sich als Freitext eingeben („1001, 1046 3001"),
 * damit man eine Liste aus WhatsApp direkt hineinkopieren kann.
 */
export default function InvitesPanel({ basarId }: { basarId: string }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/basars/${basarId}/invites`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled && data) setInvites(data.invites); });
    return () => { cancelled = true; };
  }, [basarId, version]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const sellerIds = [...new Set((input.match(/\d+/g) ?? []).map(Number))];
    if (sellerIds.length === 0) {
      setMessage('Bitte mindestens eine Verkäufernummer eingeben.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/basars/${basarId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Fehler beim Einladen');
        return;
      }
      // Unbekannte Nummern ausdrücklich nennen: eine vertippte Nummer soll auffallen.
      setMessage([
        data.added > 0 ? `${data.added} eingeladen` : 'Niemand neu eingeladen – schon dabei',
        data.unknown.length > 0 ? `Diese Nummern gibt es nicht: ${data.unknown.join(', ')}` : '',
      ].filter(Boolean).join(' · '));
      setInput('');
      setVersion(v => v + 1);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(seller: Invite['seller']) {
    if (!confirm(
      `Einladung für #${seller.sellerId} ${seller.firstName} ${seller.lastName} zurücknehmen?\n\n` +
      'Die Person sieht den Testbasar dann nicht mehr. Ihre Artikel und Verkäufe darin bleiben erhalten.'
    )) return;
    const res = await fetch(`/api/basars/${basarId}/invites?sellerId=${seller.sellerId}`, { method: 'DELETE' });
    if (res.ok) setVersion(v => v + 1);
    else setMessage('Fehler beim Zurücknehmen der Einladung');
  }

  return (
    <div className="mt-4 bg-white rounded-xl shadow-sm p-5 border border-purple-200">
      <h2 className="text-lg font-bold text-gray-800">Eingeladene ({invites.length})</h2>
      <p className="text-sm text-gray-500 mt-1">
        Nur du und diese Personen sehen den Testbasar. Eingeladene finden ihn in ihrer Übersicht,
        sobald er offen oder aktiv ist, und melden sich dort selbst an – mit der normalen
        Bestätigungsmail. Wer hier kassieren soll, muss ebenfalls eingeladen sein.
      </p>

      <form onSubmit={handleAdd} className="mt-3 flex flex-wrap gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Verkäufernummern, z. B. 1001, 1046 3001"
          aria-label="Verkäufernummern zum Einladen"
          className="flex-1 min-w-0 basis-56 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {busy ? 'Lädt ein…' : 'Einladen'}
        </button>
      </form>
      {message && <p className="mt-2 text-sm text-gray-700" role="status">{message}</p>}

      {invites.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-100">
          {invites.map(({ seller }) => (
            <li key={seller.sellerId} className="flex items-center justify-between gap-3 py-2" data-seller={seller.sellerId}>
              <span className="text-sm text-gray-800 min-w-0">
                <span className="font-bold">#{seller.sellerId}</span> {seller.firstName} {seller.lastName}
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{roleLabel(seller)}</span>
              </span>
              <button
                type="button"
                onClick={() => handleRemove(seller)}
                className="flex-shrink-0 text-sm text-red-600 hover:text-red-800"
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
