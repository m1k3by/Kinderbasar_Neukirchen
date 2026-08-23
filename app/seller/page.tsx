'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { getNavLinks } from '../lib/navLinks';
import { formatArticleLimit, maxArticlesFor } from '../lib/articleLimits';

interface Basar {
  id: string;
  title: string;
  eventDate: string;
  location?: string;
  maxArticlesPerSeller: number;
  maxArticlesPerEmployee?: number | null;
  commissionPercent: number;
  entryFee: number;
  status: 'DRAFT' | 'OPEN' | 'ACTIVE' | 'CLOSED';
  isArchived: boolean;
  // viaOrga: die Teilnahme kommt aus dem Orga-Kennzeichen, nicht aus einer eigenen
  // Aktivierung – dann gibt es nichts umzuschalten (app/lib/participation.ts).
  myParticipation: { isActive: boolean; activatedAt: string | null; viaOrga?: boolean } | null;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Vorbereitung', OPEN: 'Anmeldung offen', ACTIVE: 'Läuft', CLOSED: 'Beendet',
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', OPEN: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-green-100 text-green-700', CLOSED: 'bg-gray-100 text-gray-500',
};
const CTA_LABELS: Record<string, string> = {
  OPEN: 'Artikel anlegen', ACTIVE: 'Verkäufe ansehen', CLOSED: 'Abrechnung',
};

const fmt = (n: number) => n.toFixed(2).replace('.', ',');

export default function SellerPage() {
  const router = useRouter();
  const [sellerId, setSellerId] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [isEmployee, setIsEmployee] = useState(false);
  const [isOrga, setIsOrga] = useState(false);
  const [isCashier, setIsCashier] = useState(false);
  const [loading, setLoading] = useState(true);
  const [basars, setBasars] = useState<Basar[]>([]);
  const [closedBasars, setClosedBasars] = useState<Basar[]>([]);
  const [togglingBasarId, setTogglingBasarId] = useState<string | null>(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState<Basar | null>(null);
  const [activateConfirm, setActivateConfirm] = useState<Basar | null>(null);
  const [agbAccepted, setAgbAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
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
          setIsOrga(me.isOrga || false);
          setIsCashier(me.isCashier || false);
        }
      }
      if (basarsRes.ok) {
        const data = await basarsRes.json();
        const all: Basar[] = (data.basars ?? []).filter((b: Basar) => !b.isArchived);
        // DRAFT ist für Verkäufer unsichtbar; CLOSED landet in "Vergangene Basare".
        setBasars(all.filter(b => b.status === 'OPEN' || b.status === 'ACTIVE'));
        setClosedBasars(all.filter(b => b.status === 'CLOSED'));
      }
    } catch (error) {
      console.error('Error loading seller info:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleParticipation(basar: Basar) {
    if (togglingBasarId === basar.id) return;
    const isCurrentlyActive = basar.myParticipation?.isActive ?? false;

    // Abmelden → zuerst Bestätigung einholen
    if (isCurrentlyActive) {
      setDeactivateConfirm(basar);
      return;
    }

    // Anmelden → erst AGB und Datenschutz bestätigen lassen
    setAgbAccepted(false);
    setPrivacyAccepted(false);
    setActivateConfirm(basar);
  }

  async function confirmDeactivate() {
    const basar = deactivateConfirm;
    if (!basar) return;
    setDeactivateConfirm(null);
    await applyParticipationToggle(basar, false);
  }

  async function confirmActivate() {
    const basar = activateConfirm;
    if (!basar || !agbAccepted || !privacyAccepted) return;
    setActivateConfirm(null);
    await applyParticipationToggle(basar, true);
  }

  async function applyParticipationToggle(basar: Basar, nextActive: boolean) {
    // Optimistic update — UI reagiert sofort
    setBasars(prev => prev.map(b =>
      b.id === basar.id
        ? { ...b, myParticipation: { isActive: nextActive, activatedAt: b.myParticipation?.activatedAt ?? null } }
        : b
    ));
    setTogglingBasarId(basar.id);

    try {
      const res = await fetch(`/api/basars/${basar.id}/participation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // acceptedTerms nur beim Anmelden – der Server verlangt es genau dort und
        // schreibt daraus den Zustimmungszeitpunkt.
        body: JSON.stringify({ isActive: nextActive, ...(nextActive ? { acceptedTerms: true } : {}) }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(data.isActive ? `Teilnahme an "${basar.title}" aktiviert!` : `Teilnahme an "${basar.title}" beendet.`);
        setTimeout(() => setMessage(''), 3000);
      } else {
        setBasars(prev => prev.map(b =>
          b.id === basar.id ? { ...b, myParticipation: basar.myParticipation } : b
        ));
        setMessage('Fehler: ' + (data.error || 'Unbekannter Fehler'));
        setTimeout(() => setMessage(''), 5000);
      }
    } catch {
      setBasars(prev => prev.map(b =>
        b.id === basar.id ? { ...b, myParticipation: basar.myParticipation } : b
      ));
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
        {message && (
          <div className={`mb-6 px-6 py-3 rounded-lg font-medium text-center animate-fade-in ${
            message.startsWith('Fehler') ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-green-100 text-green-800 border border-green-200'
          }`}>
            {message}
          </div>
        )}

        {/* Teilnahme und Artikelerfassung liegen bewusst auf derselben Karte: vorher lagen
            sie auf zwei Seiten (/seller und /seller/basars), sodass für den normalen Ablauf
            "anmelden, dann Artikel anlegen" ein Tabwechsel nötig war. */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-2 text-center text-gray-900">Meine Basare</h2>
          <p className="text-center text-gray-600 mb-6 text-sm">
            Melde dich für einen Basar an und lege dort deine Artikel an – inklusive Etiketten
            mit QR-Code und Übersicht deiner Verkäufe.
          </p>

          {basars.length === 0 ? (
            <p className="text-center text-gray-400 py-6">
              {closedBasars.length > 0
                ? 'Aktuell ist kein Basar für eine Teilnahme geöffnet.'
                : 'Aktuell sind keine Basare verfügbar.'}
            </p>
          ) : (
            <div className="space-y-4">
              {basars.map(basar => {
                const isActive = basar.myParticipation?.isActive ?? false;
                const viaOrga = basar.myParticipation?.viaOrga ?? false;
                const canToggle = !viaOrga && (basar.status === 'OPEN' || basar.status === 'ACTIVE' || isActive);
                return (
                  <div key={basar.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[basar.status]}`}>
                        {STATUS_LABELS[basar.status]}
                      </span>
                      <span className="font-bold text-gray-900">{basar.title}</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {new Date(basar.eventDate).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                      {basar.location && ` · ${basar.location}`}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Max. {formatArticleLimit(maxArticlesFor(basar, { isEmployee, isOrga }))} Artikel · {Number(basar.commissionPercent).toFixed(0)}% Provision
                      {Number(basar.entryFee) > 0 && ` · ${fmt(Number(basar.entryFee))} € Gebühr`}
                    </p>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
                      <button
                        onClick={() => toggleParticipation(basar)}
                        disabled={viaOrga || togglingBasarId === basar.id || (!canToggle && !isActive)}
                        title={viaOrga ? 'Als Orga bist du in jedem Basar automatisch angemeldet.' : undefined}
                        className={`px-6 py-3 rounded-xl font-bold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                          isActive
                            ? 'bg-green-500 hover:bg-green-600 text-white'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                        }`}
                      >
                        {togglingBasarId === basar.id ? '…' : viaOrga ? 'Teilnahme: AKTIV (Orga)' : isActive ? 'Teilnahme: AKTIV' : 'Teilnahme: INAKTIV'}
                      </button>
                      {/* Auch für Nicht-Teilnehmer sichtbar – was ohne aktive Teilnahme
                          erlaubt ist, entscheidet die Detailseite, nicht diese Karte. */}
                      <Link
                        href={`/seller/basars/${basar.id}`}
                        className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold rounded-xl transition-colors shadow-sm text-center"
                      >
                        {CTA_LABELS[basar.status]} →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {closedBasars.length > 0 && (
          <div className="mb-8">
            <h2 className="text-base font-semibold text-gray-500 mb-3">Vergangene Basare</h2>
            <div className="space-y-3">
              {closedBasars.map(basar => (
                <div key={basar.id} className="bg-white rounded-xl border border-gray-200 p-4 opacity-80">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                          {STATUS_LABELS.CLOSED}
                        </span>
                        <h3 className="text-sm font-bold text-gray-600 truncate">{basar.title}</h3>
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(basar.eventDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        {basar.location && ` · ${basar.location}`}
                      </p>
                    </div>
                    <Link
                      href={`/seller/basars/${basar.id}`}
                      className="flex-shrink-0 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium rounded-lg transition-colors"
                    >
                      {CTA_LABELS.CLOSED}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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

        {/* Anmelde-Bestätigung: AGB und Datenschutz */}
        {activateConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Am Basar teilnehmen</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{activateConfirm.title}</p>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Für die Teilnahme benötigen wir deine Zustimmung:
              </p>

              <div className="space-y-3 mb-5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agbAccepted}
                    onChange={(e) => setAgbAccepted(e.target.checked)}
                    className="mt-0.5 w-5 h-5 flex-shrink-0 accent-green-600"
                  />
                  <span className="text-sm text-gray-700">
                    Ich akzeptiere die{' '}
                    <Link href="/agb" target="_blank" className="text-blue-600 hover:underline font-medium">
                      Allgemeinen Geschäftsbedingungen (AGB)
                    </Link>
                    .
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={privacyAccepted}
                    onChange={(e) => setPrivacyAccepted(e.target.checked)}
                    className="mt-0.5 w-5 h-5 flex-shrink-0 accent-green-600"
                  />
                  <span className="text-sm text-gray-700">
                    Ich habe die{' '}
                    <Link href="/datenschutz" target="_blank" className="text-blue-600 hover:underline font-medium">
                      Datenschutzerklärung
                    </Link>
                    {' '}gelesen und stimme der Verarbeitung meiner Daten zu.
                  </span>
                </label>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setActivateConfirm(null)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                >
                  Abbrechen
                </button>
                <button
                  onClick={confirmActivate}
                  disabled={!agbAccepted || !privacyAccepted}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Teilnahme aktivieren
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Abmelde-Bestätigung */}
        {deactivateConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Von Basar abmelden?</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{deactivateConfirm.title}</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 space-y-2 text-sm text-amber-900">
                <p className="font-semibold">Das hat folgende Konsequenzen:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Du wirst aus der Teilnehmerliste entfernt</li>
                  <li>Dein Platz wird sofort freigegeben</li>
                  <li>Du kannst keine Artikel mehr verkaufen</li>
                  <li>Du kannst keine Kiste mehr anliefern</li>
                  <li>Deine Artikel bleiben gespeichert</li>
                  <li>Eine erneute Anmeldung ist möglich, solange noch Plätze frei sind</li>
                </ul>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeactivateConfirm(null)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                >
                  Abbrechen
                </button>
                <button
                  onClick={confirmDeactivate}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Ja, abmelden
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
