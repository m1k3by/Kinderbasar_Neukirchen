'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';

const DEFAULT_SIZES =
  'XXS,XS,S,M,L,XL,XXL,3XL,4XL,5XL,' +
  '50,56,62,68,74,80,86,92,98,104,110,116,122,128,134,140,146,152,158,164,170,176,' +
  'W24,W25,W26,W27,W28,W29,W30,W31,W32,W33,W34,W36,W38,W40,W42,W44,' +
  '18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49';

interface Settings {
  date_freitag?: string;
  date_samstag?: string;
  date_sonntag?: string;
  registration_seller_start?: string;
  registration_seller_end?: string;
  registration_employee_start?: string;
  registration_employee_end?: string;
  activation_seller_start?: string;
  activation_seller_end?: string;
  activation_employee_start?: string;
  activation_employee_end?: string;
  delivery_start?: string;
  delivery_end?: string;
  delivery_start2?: string;
  delivery_end2?: string;
  pickup_start?: string;
  pickup_end?: string;
  pickup_start2?: string;
  pickup_end2?: string;
  allowed_sizes?: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [enabledSizes, setEnabledSizes] = useState<Set<string>>(
    new Set(DEFAULT_SIZES.split(','))
  );
  const [sizesOpen, setSizesOpen] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      setSettings(data);
      const raw: string = data.allowed_sizes || DEFAULT_SIZES;
      setEnabledSizes(new Set(raw.split(',').map((s: string) => s.trim()).filter(Boolean)));
    } catch (err) {
      setError('Fehler beim Laden der Einstellungen');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const sizesValue = [...enabledSizes].join(',');
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, allowed_sizes: sizesValue }),
      });

      if (!response.ok) throw new Error('Failed to save settings');

      setMessage('✓ Einstellungen erfolgreich gespeichert!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header 
        links={[
          { href: '/admin', label: 'Basarliste' },
          { href: '/admin/basars', label: 'Basare' },
          { href: '/admin/list', label: 'Helferliste' },
          { href: '/admin/tasks', label: 'Aufgaben' },
          { href: '/admin/settings', label: 'Einstellungen', active: true },
          { href: '/', label: 'Logout' },
        ]}
      />

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Basar-Einstellungen</h1>
          <p className="text-gray-600">Lege die Termine für den Basar fest</p>
        </div>

        {/* Messages */}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
            {message}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            ⚠️ {error}
          </div>
        )}

        {/* Settings Form */}
        {loading ? (
          <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Lade Einstellungen...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-6">Basar-Termine</h2>

            <div className="space-y-6">
              {/* Freitag */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Freitag
                </label>
                <input
                  type="date"
                  value={settings.date_freitag || ''}
                  onChange={(e) => setSettings({ ...settings, date_freitag: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="YYYY-MM-DD"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {settings.date_freitag 
                    ? `Anzeige: ${new Date(settings.date_freitag + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
                    : 'Kein Datum festgelegt'
                  }
                </p>
              </div>

              {/* Samstag */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Samstag
                </label>
                <input
                  type="date"
                  value={settings.date_samstag || ''}
                  onChange={(e) => setSettings({ ...settings, date_samstag: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="YYYY-MM-DD"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {settings.date_samstag 
                    ? `Anzeige: ${new Date(settings.date_samstag + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
                    : 'Kein Datum festgelegt'
                  }
                </p>
              </div>

              {/* Sonntag */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sonntag
                </label>
                <input
                  type="date"
                  value={settings.date_sonntag || ''}
                  onChange={(e) => setSettings({ ...settings, date_sonntag: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="YYYY-MM-DD"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {settings.date_sonntag 
                    ? `Anzeige: ${new Date(settings.date_sonntag + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
                    : 'Kein Datum festgelegt'
                  }
                </p>
              </div>
            </div>

            {/* Registration Periods */}
            <div className="mt-8 pt-8 border-t border-gray-300">
              <h2 className="text-xl font-bold text-gray-800 mb-6">Registrierungszeiträume</h2>
              
              {/* Seller Registration Period */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Verkäufer-Registrierung (A)</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Von (Datum + Uhrzeit)
                    </label>
                    <input
                      type="datetime-local"
                      value={settings.registration_seller_start || ''}
                      onChange={(e) => setSettings({ ...settings, registration_seller_start: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bis (Datum + Uhrzeit)
                    </label>
                    <input
                      type="datetime-local"
                      value={settings.registration_seller_end || ''}
                      onChange={(e) => setSettings({ ...settings, registration_seller_end: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Die Verkäufer-Registrierung wird nur in diesem Zeitraum auf der Startseite angezeigt.
                </p>
              </div>

              {/* Employee Registration Period */}
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Mitarbeiter-Registrierung (B)</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Von (Datum + Uhrzeit)
                    </label>
                    <input
                      type="datetime-local"
                      value={settings.registration_employee_start || ''}
                      onChange={(e) => setSettings({ ...settings, registration_employee_start: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bis (Datum + Uhrzeit)
                    </label>
                    <input
                      type="datetime-local"
                      value={settings.registration_employee_end || ''}
                      onChange={(e) => setSettings({ ...settings, registration_employee_end: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Die Mitarbeiter-Registrierung wird nur in diesem Zeitraum auf der Startseite angezeigt.
                </p>
              </div>
            </div>

            {/* Activation Periods */}
            <div className="mt-8 pt-8 border-t border-gray-300">
              <h2 className="text-xl font-bold text-gray-800 mb-6">Aktivierungszeiträume</h2>
              <p className="text-sm text-gray-600 mb-4">
                Nur während dieser Zeiträume können sich Verkäufer und Mitarbeiter selbst aktiv schalten.
              </p>
              
              {/* Seller Activation Period */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Verkäufer-Aktivierung</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Von (Datum + Uhrzeit)
                    </label>
                    <input
                      type="datetime-local"
                      value={settings.activation_seller_start || ''}
                      onChange={(e) => setSettings({ ...settings, activation_seller_start: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bis (Datum + Uhrzeit)
                    </label>
                    <input
                      type="datetime-local"
                      value={settings.activation_seller_end || ''}
                      onChange={(e) => setSettings({ ...settings, activation_seller_end: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Verkäufer können sich nur in diesem Zeitraum aktiv schalten.
                </p>
              </div>

              {/* Employee Activation Period */}
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Mitarbeiter-Aktivierung</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Von (Datum + Uhrzeit)
                    </label>
                    <input
                      type="datetime-local"
                      value={settings.activation_employee_start || ''}
                      onChange={(e) => setSettings({ ...settings, activation_employee_start: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bis (Datum + Uhrzeit)
                    </label>
                    <input
                      type="datetime-local"
                      value={settings.activation_employee_end || ''}
                      onChange={(e) => setSettings({ ...settings, activation_employee_end: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Mitarbeiter können sich nur in diesem Zeitraum aktiv schalten.
                </p>
              </div>
            </div>

            {/* Delivery and Pickup Periods */}
            <div className="mt-8 pt-8 border-t border-gray-300">
              <h2 className="text-xl font-bold text-gray-800 mb-6">Anlieferung und Abholung</h2>
              
              {/* Delivery Period */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Anlieferung der Ware</h3>
                
                {/* First Delivery Window */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-600 mb-2">Zeitfenster 1</label>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Von (Datum + Uhrzeit)
                      </label>
                      <input
                        type="datetime-local"
                        value={settings.delivery_start || ''}
                        onChange={(e) => setSettings({ ...settings, delivery_start: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Bis (Datum + Uhrzeit)
                      </label>
                      <input
                        type="datetime-local"
                        value={settings.delivery_end || ''}
                        onChange={(e) => setSettings({ ...settings, delivery_end: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Second Delivery Window */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-600 mb-2">Zeitfenster 2</label>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Von (Datum + Uhrzeit)
                      </label>
                      <input
                        type="datetime-local"
                        value={settings.delivery_start2 || ''}
                        onChange={(e) => setSettings({ ...settings, delivery_start2: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Bis (Datum + Uhrzeit)
                      </label>
                      <input
                        type="datetime-local"
                        value={settings.delivery_end2 || ''}
                        onChange={(e) => setSettings({ ...settings, delivery_end2: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                <p className="mt-2 text-xs text-gray-500">
                  Diese Zeiten werden in der Bestätigungs-E-Mail an die Verkäufer gesendet.
                </p>
              </div>

              {/* Pickup Period */}
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Abholung der Ware</h3>
                
                {/* First Pickup Window */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-600 mb-2">Zeitfenster 1</label>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Von (Datum + Uhrzeit)
                      </label>
                      <input
                        type="datetime-local"
                        value={settings.pickup_start || ''}
                        onChange={(e) => setSettings({ ...settings, pickup_start: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Bis (Datum + Uhrzeit)
                      </label>
                      <input
                        type="datetime-local"
                        value={settings.pickup_end || ''}
                        onChange={(e) => setSettings({ ...settings, pickup_end: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Second Pickup Window */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-600 mb-2">Zeitfenster 2</label>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Von (Datum + Uhrzeit)
                      </label>
                      <input
                        type="datetime-local"
                        value={settings.pickup_start2 || ''}
                        onChange={(e) => setSettings({ ...settings, pickup_start2: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Bis (Datum + Uhrzeit)
                      </label>
                      <input
                        type="datetime-local"
                        value={settings.pickup_end2 || ''}
                        onChange={(e) => setSettings({ ...settings, pickup_end2: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                <p className="mt-2 text-xs text-gray-500">
                  Diese Zeiten werden in der Bestätigungs-E-Mail an die Verkäufer gesendet.
                </p>
              </div>
            </div>

            {/* Allowed Sizes */}
            <div className="mt-8 pt-8 border-t border-gray-300">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Erlaubte Größen</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {enabledSizes.size} von {DEFAULT_SIZES.split(',').length} Größen aktiv · Gilt für alle Basare
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSizesOpen(o => !o)}
                  className="text-sm text-blue-600 hover:underline flex-shrink-0 ml-4"
                >
                  {sizesOpen ? 'Ausblenden' : 'Bearbeiten'}
                </button>
              </div>

              {sizesOpen && (() => {
                const allSizes = DEFAULT_SIZES.split(',');
                const groups = [
                  { label: 'Kleidung – Buchstaben', sizes: allSizes.filter(s => /^(XXS|XS|S|M|L|XL|XXL|3XL|4XL|5XL)$/.test(s)) },
                  { label: 'Kleidung – Größentabelle (cm)', sizes: allSizes.filter(s => /^\d+$/.test(s) && +s >= 50 && +s <= 176) },
                  { label: 'Hosen (W-Größen)', sizes: allSizes.filter(s => /^W\d+$/.test(s)) },
                  { label: 'Schuhe', sizes: allSizes.filter(s => /^\d+$/.test(s) && +s >= 18 && +s <= 49) },
                ];
                return (
                  <div className="mt-3 space-y-5">
                    <p className="text-xs text-gray-500">
                      Aktivierte Größen (grün) sind im Artikel-Formular gültig. Klicken zum An-/Abwählen.
                    </p>
                    {groups.map(group => (
                      <div key={group.label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{group.label}</p>
                          <div className="flex gap-3">
                            <button type="button" onClick={() => setEnabledSizes(prev => { const next = new Set(prev); group.sizes.forEach(s => next.add(s)); return next; })} className="text-xs text-green-700 hover:underline">Alle an</button>
                            <button type="button" onClick={() => setEnabledSizes(prev => { const next = new Set(prev); group.sizes.forEach(s => next.delete(s)); return next; })} className="text-xs text-red-600 hover:underline">Alle ab</button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {group.sizes.map(s => {
                            const active = enabledSizes.has(s);
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setEnabledSizes(prev => {
                                  const next = new Set(prev);
                                  active ? next.delete(s) : next.add(s);
                                  return next;
                                })}
                                className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold transition-colors ${
                                  active
                                    ? 'bg-green-100 border-green-400 text-green-900 hover:bg-green-200'
                                    : 'bg-gray-100 border-gray-300 text-gray-400 hover:bg-gray-200'
                                }`}
                              >
                                {s}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEnabledSizes(new Set(DEFAULT_SIZES.split(',')))}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      ↺ Alle Größen auf Standard zurücksetzen
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Save Button */}
            <div className="mt-8 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow"
              >
                {saving ? 'Speichere...' : '✓ Speichern'}
              </button>
              <Link
                href="/admin"
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-3 rounded-lg font-medium transition-colors inline-block"
              >
                Abbrechen
              </Link>
            </div>
          </form>
        )}

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">ℹ️ Hinweis</h3>
          <p className="text-sm text-blue-800">
            Die hier festgelegten Termine werden in der Helferliste, auf den öffentlichen Seiten und in allen E-Mails angezeigt.
            Damit alle Teilnehmer die korrekten Daten sehen, solltest du die Termine vor dem Start der Anmeldung eintragen.
          </p>
        </div>
      </div>
    </div>
  );
}
