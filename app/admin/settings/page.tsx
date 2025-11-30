'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';

interface Settings {
  date_freitag?: string;
  date_samstag?: string;
  date_sonntag?: string;
  registration_seller_start?: string;
  registration_seller_end?: string;
  registration_employee_start?: string;
  registration_employee_end?: string;
  delivery_start?: string;
  delivery_end?: string;
  pickup_start?: string;
  pickup_end?: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      setSettings(data);
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
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
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
          { href: '/admin/list', label: 'Helferliste' },
          { href: '/admin/tasks', label: 'Aufgaben' },
          { href: '/admin/settings', label: 'Datum einstellen', active: true },
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
                      Start-Datum
                    </label>
                    <input
                      type="date"
                      value={settings.registration_seller_start || ''}
                      onChange={(e) => setSettings({ ...settings, registration_seller_start: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End-Datum
                    </label>
                    <input
                      type="date"
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
                      Start-Datum
                    </label>
                    <input
                      type="date"
                      value={settings.registration_employee_start || ''}
                      onChange={(e) => setSettings({ ...settings, registration_employee_start: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End-Datum
                    </label>
                    <input
                      type="date"
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

            {/* Delivery and Pickup Periods */}
            <div className="mt-8 pt-8 border-t border-gray-300">
              <h2 className="text-xl font-bold text-gray-800 mb-6">Anlieferung und Abholung</h2>
              
              {/* Delivery Period */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Anlieferung der Ware</h3>
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
                <p className="mt-2 text-xs text-gray-500">
                  Diese Zeiten werden in der Bestätigungs-E-Mail an die Verkäufer gesendet.
                </p>
              </div>

              {/* Pickup Period */}
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Abholung der Ware</h3>
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
                <p className="mt-2 text-xs text-gray-500">
                  Diese Zeiten werden in der Bestätigungs-E-Mail an die Verkäufer gesendet.
                </p>
              </div>
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
