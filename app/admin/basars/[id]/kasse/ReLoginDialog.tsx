'use client';

import { useState } from 'react';

/**
 * Neuanmeldung als Overlay direkt an der Kasse. Bewusst KEINE Navigation: die App läuft als
 * PWA ohne Zurück-Knopf, und der Warenkorb liegt im Seitenzustand. Die API setzt das Cookie;
 * danach macht der Aufrufer weiter (onSuccess). Ein anderer Nutzer darf sich hier anmelden
 * (Kassenwechsel) – ob er kassieren darf, entscheidet der Server beim Kassieren (403).
 */
export default function ReLoginDialog({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Anmeldung fehlgeschlagen');
        return;
      }
      setPassword('');
      onSuccess();
    } catch {
      setError('Keine Verbindung – bitte erneut versuchen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="relogin-title">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-xl shadow-xl p-4 space-y-3">
        <h2 id="relogin-title" className="text-lg font-bold text-gray-800">Bitte neu anmelden</h2>
        <p className="text-sm text-gray-600">
          Die Anmeldung ist abgelaufen. Der Warenkorb bleibt erhalten und wird nach der Anmeldung automatisch kassiert.
        </p>
        {error && <div className="bg-red-100 border border-red-300 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
        <input
          type="text"
          autoComplete="username"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="E-Mail oder Benutzername"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Passwort"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-medium">
            Abbrechen
          </button>
          <button type="submit" disabled={busy} className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold rounded disabled:opacity-50">
            {busy ? 'Anmelden…' : 'Anmelden'}
          </button>
        </div>
      </form>
    </div>
  );
}
