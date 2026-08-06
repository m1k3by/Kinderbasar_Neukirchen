'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { getNavLinks } from '../lib/navLinks';

interface Basar {
  id: string;
  title: string;
  eventDate: string;
  location?: string;
  status: 'DRAFT' | 'OPEN' | 'ACTIVE' | 'CLOSED';
  isArchived: boolean;
  myParticipation: { isActive: boolean; activatedAt: string | null } | null;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Vorbereitung', OPEN: 'Anmeldung offen', ACTIVE: 'Läuft', CLOSED: 'Beendet',
};

export default function SellerPage() {
  const router = useRouter();
  const [sellerId, setSellerId] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [isEmployee, setIsEmployee] = useState(false);
  const [isCashier, setIsCashier] = useState(false);
  const [loading, setLoading] = useState(true);
  const [basars, setBasars] = useState<Basar[]>([]);
  const [togglingBasarId, setTogglingBasarId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    // Get sellerId from cookie
    const cookies = document.cookie.split(';');
    const sellerIdCookie = cookies.find(c => c.trim().startsWith('sellerId='));
    if (sellerIdCookie) {
      const id = sellerIdCookie.split('=')[1];
      setSellerId(id);
    } else {
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    if (sellerId) {
      loadSellerInfo();
    }
  }, [sellerId]);

  async function loadSellerInfo() {
    try {
      const [meRes, basarsRes] = await Promise.all([
        fetch('/api/me'),
        fetch('/api/basars'),
      ]);
      if (meRes.ok) {
        const me = await meRes.json();
        if (me.role !== 'admin') {
          setSellerName(`${me.firstName} ${me.lastName}`);
          setIsEmployee(me.isEmployee || false);
          setIsCashier(me.isCashier || false);
        }
      }
      if (basarsRes.ok) {
        const data = await basarsRes.json();
        const all: Basar[] = data.basars ?? [];
        setBasars(all.filter(b => !b.isArchived && b.status !== 'DRAFT'));
      }
    } catch (error) {
      console.error('Error loading seller info:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleParticipation(basar: Basar) {
    const nextActive = !basar.myParticipation?.isActive;
    setTogglingBasarId(basar.id);
    try {
      const res = await fetch(`/api/basars/${basar.id}/participation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive }),
      });

      const data = await res.json();
      if (res.ok) {
        setBasars(prev => prev.map(b =>
          b.id === basar.id
            ? { ...b, myParticipation: { isActive: data.isActive, activatedAt: b.myParticipation?.activatedAt ?? null } }
            : b
        ));
        setMessage(data.isActive ? `Teilnahme an "${basar.title}" aktiviert!` : `Teilnahme an "${basar.title}" beendet.`);
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Fehler: ' + (data.error || 'Unbekannter Fehler'));
        setTimeout(() => setMessage(''), 5000);
      }
    } catch (error) {
      console.error('Error updating participation:', error);
      setMessage('Fehler beim Aktualisieren der Teilnahme');
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setTogglingBasarId(null);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setPasswordError('Die Passwörter stimmen nicht überein');
      return;
    }

    // Validate password length
    if (newPassword.length < 6) {
      setPasswordError('Das Passwort muss mindestens 6 Zeichen lang sein');
      return;
    }

    setChangingPassword(true);

    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId: parseInt(sellerId, 10),
          newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setPasswordSuccess('Passwort erfolgreich geändert!');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setShowPasswordModal(false);
          setPasswordSuccess('');
        }, 2000);
      } else {
        setPasswordError(data.error || 'Fehler beim Ändern des Passworts');
      }
    } catch (error) {
      console.error('Error changing password:', error);
      setPasswordError('Ein Fehler ist aufgetreten');
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Laden...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header
        links={getNavLinks({ role: isEmployee ? 'employee' : 'seller', isEmployee, isCashier }, 'verkaeufer')}
        sellerInfo={{ name: sellerName, sellerId: parseInt(sellerId, 10) }}
      />

      <main className="max-w-4xl mx-auto p-4 md:p-8">
        {/* Mein Basar */}
        <div className="mb-8 bg-yellow-50 border border-yellow-200 rounded-lg shadow-sm p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Mein Basar – Artikel erfassen</h2>
            <p className="text-gray-900 mt-1 text-sm">
              Lege Artikel für den Basar an, drucke Etiketten mit QR-Code und verfolge deine Verkäufe.
            </p>
          </div>
          <a
            href="/seller/basars"
            className="flex-shrink-0 px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold rounded-xl transition-colors shadow-sm"
          >
            Zu meinen Artikeln →
          </a>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-2 text-center text-gray-900">Deine Basare</h2>
          <p className="text-center text-gray-600 mb-6 text-sm">
            Melde dich für die Basare an oder ab, an denen du teilnehmen möchtest.
          </p>

          {message && (
            <div className={`mb-6 px-6 py-3 rounded-lg font-medium text-center animate-fade-in ${
              message.startsWith('Fehler') ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-green-100 text-green-800 border border-green-200'
            }`}>
              {message}
            </div>
          )}

          {basars.length === 0 ? (
            <p className="text-center text-gray-400 py-6">Aktuell ist kein Basar für eine Teilnahme geöffnet.</p>
          ) : (
            <div className="space-y-3">
              {basars.map(basar => {
                const isActive = basar.myParticipation?.isActive ?? false;
                const canToggle = basar.status === 'OPEN' || basar.status === 'ACTIVE' || isActive;
                return (
                  <div key={basar.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 border border-gray-200 rounded-xl p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{basar.title}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                          {STATUS_LABELS[basar.status]}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {new Date(basar.eventDate).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                        {basar.location && ` · ${basar.location}`}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleParticipation(basar)}
                      disabled={togglingBasarId === basar.id || (!canToggle && !isActive)}
                      className={`flex-shrink-0 px-6 py-3 rounded-xl font-bold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                        isActive
                          ? 'bg-green-500 hover:bg-green-600 text-white'
                          : 'bg-gray-900 hover:bg-gray-800 text-white'
                      }`}
                    >
                      {togglingBasarId === basar.id ? '…' : isActive ? 'Teilnahme: AKTIV' : 'Teilnahme: INAKTIV'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Password Change Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4 text-gray-900">Sicherheit</h2>
          <p className="text-gray-900 mb-4">Ändern Sie hier Ihr Passwort</p>
          <button
            onClick={() => setShowPasswordModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Passwort ändern
          </button>
        </div>

        {/* Password Change Modal */}
        {showPasswordModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold mb-4 text-gray-900">Passwort ändern</h3>
              
              {passwordError && (
                <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg text-sm">
                  {passwordError}
                </div>
              )}
              
              {passwordSuccess && (
                <div className="mb-4 p-3 bg-green-100 text-green-800 rounded-lg text-sm">
                  {passwordSuccess}
                </div>
              )}

              <form onSubmit={handlePasswordChange}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                      Neues Passwort
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                        required
                        minLength={6}
                        disabled={changingPassword}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                        aria-label={showNewPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                        disabled={changingPassword}
                      >
                        {showNewPassword ? (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Mindestens 6 Zeichen</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                      Passwort bestätigen
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                        required
                        disabled={changingPassword}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                        aria-label={showConfirmPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                        disabled={changingPassword}
                      >
                        {showConfirmPassword ? (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordModal(false);
                      setNewPassword('');
                      setConfirmPassword('');
                      setPasswordError('');
                      setPasswordSuccess('');
                    }}
                    className="px-4 py-2 text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    disabled={changingPassword}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={changingPassword}
                  >
                    {changingPassword ? 'Wird geändert...' : 'Passwort ändern'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
