'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { dateForWeekday } from '../lib/basarWindows';
import { getNavLinks } from '../lib/navLinks';

interface Task {
  id: string;
  title: string;
  day: string;
  timeFrom?: string | null;
  timeTo?: string | null;
  capacity: number;
  signups?: {
    sellerId: number;
    seller: {
      firstName: string;
      lastName: string;
    };
  }[];
  _count?: {
    signups: number;
  };
}

interface Cake {
  id: string;
  cakeName: string;
  sellerId?: number;
}

interface Basar {
  id: string;
  title: string;
  eventDate: string;
  location?: string;
  status: 'DRAFT' | 'OPEN' | 'ACTIVE' | 'CLOSED';
  isArchived: boolean;
  myParticipation: { isActive: boolean; activatedAt: string | null } | null;
  dateFriday?: string | null;
  dateSaturday?: string | null;
  dateSunday?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Vorbereitung', OPEN: 'Anmeldung offen', ACTIVE: 'Läuft', CLOSED: 'Beendet',
};

const dayOrder = ['Freitag', 'Samstag', 'Sonntag'];

export default function EmployeePage() {
  const router = useRouter();
  const [sellerId, setSellerId] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [sellerNumber, setSellerNumber] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cakes, setCakes] = useState<Cake[]>([]);
  const [myCakes, setMyCakes] = useState<Cake[]>([]);
  const [cakeName, setCakeName] = useState('');
  const [editingCakeId, setEditingCakeId] = useState<string | null>(null);
  const [editingCakeName, setEditingCakeName] = useState('');
  const [message, setMessage] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [basars, setBasars] = useState<Basar[]>([]);
  const [helferlisteBasarId, setHelferlisteBasarId] = useState<string>('');
  const [pendingBasar, setPendingBasar] = useState<Basar | null>(null);
  const [togglingBasarId, setTogglingBasarId] = useState<string | null>(null);
  const [isCashier, setIsCashier] = useState(false);
  const activeBasars = basars.filter(b => b.status === 'ACTIVE');
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
    loadData();
  }, []);

  useEffect(() => {
    if (sellerId) loadSellerInfo();
  }, [sellerId]);

  async function loadSellerInfo() {
    const id = sellerId || (() => {
      const c = document.cookie.split(';').find(c => c.trim().startsWith('sellerId='));
      return c ? c.split('=')[1].trim() : '';
    })();
    if (!id) return;

    try {
      const [meRes, basarsRes] = await Promise.all([
        fetch('/api/me'),
        fetch('/api/basars'),
      ]);
      if (meRes.ok) {
        const me = await meRes.json();
        if (me.role !== 'admin') {
          setSellerName(`${me.firstName} ${me.lastName}`);
          setSellerNumber(me.sellerId);
          setIsCashier(me.isCashier || false);
        }
      }
      if (basarsRes.ok) {
        const data = await basarsRes.json();
        const all: Basar[] = data.basars ?? [];
        const relevant = all.filter(b => !b.isArchived && b.status !== 'DRAFT');
        setBasars(relevant);
        setHelferlisteBasarId(prev => prev || relevant.find(b => b.status === 'ACTIVE')?.id
          || relevant.find(b => b.status === 'OPEN')?.id
          || relevant[0]?.id
          || '');
      }
    } catch (error) {
      console.error('Error loading seller info:', error);
    }
  }

  useEffect(() => {
    if (sellerId && cakes.length > 0) {
      const myExistingCakes = cakes.filter((c: any) => c.sellerId === parseInt(sellerId, 10));
      setMyCakes(myExistingCakes);
    } else {
      setMyCakes([]);
    }
  }, [sellerId, cakes]);

  async function loadData() {
    try {
      const [tasksRes, cakesRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/cakes'),
      ]);

      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (cakesRes.ok) {
        const allCakes = await cakesRes.json();
        setCakes(allCakes);
        
        // Check if current user has cakes
        if (sellerId) {
          const sellerIdInt = parseInt(sellerId, 10);
          const myExistingCakes = allCakes.filter((c: Cake & { sellerId: number }) => c.sellerId === sellerIdInt);
          setMyCakes(myExistingCakes);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  function handleToggleParticipation(basar: Basar) {
    if (!sellerId) return;
    setPendingBasar(basar);
  }

  async function handleConfirmParticipationToggle() {
    if (!sellerId || !pendingBasar) return;
    const basar = pendingBasar;
    setPendingBasar(null);

    const newStatus = !basar.myParticipation?.isActive;

    // Optimistic update – sofortige visuelle Rückmeldung
    setBasars(prev => prev.map(b =>
      b.id === basar.id ? { ...b, myParticipation: { isActive: newStatus, activatedAt: b.myParticipation?.activatedAt ?? null } } : b
    ));
    setTogglingBasarId(basar.id);
    setMessage(newStatus ? '⏳ Wird aktiviert…' : '⏳ Wird deaktiviert…');

    try {
      const res = await fetch(`/api/basars/${basar.id}/participation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newStatus }),
      });

      if (res.ok) {
        setMessage(newStatus
          ? `✓ Teilnahme an "${basar.title}" aktiviert! Du bist jetzt als Verkäufer aktiv.`
          : `✓ Teilnahme an "${basar.title}" beendet.`);
        setTimeout(() => setMessage(''), 5000);
      } else {
        // Rollback on error
        setBasars(prev => prev.map(b => b.id === basar.id ? basar : b));
        const data = await res.json();
        setMessage(data.error || 'Fehler beim Aktualisieren der Teilnahme');
        setTimeout(() => setMessage(''), 4000);
      }
    } catch (error) {
      // Rollback on network error
      setBasars(prev => prev.map(b => b.id === basar.id ? basar : b));
      console.error('Error toggling participation:', error);
      setMessage('Fehler beim Aktualisieren der Teilnahme');
      setTimeout(() => setMessage(''), 4000);
    } finally {
      setTogglingBasarId(null);
    }
  }

  async function handleTaskToggle(taskId: string) {
    if (!sellerId) return;

    try {
      const task = tasks.find(t => t.id === taskId);
      const sellerIdInt = parseInt(sellerId, 10);
      const isSignedUp = task?.signups?.some(s => s.sellerId === sellerIdInt);

      // Wenn User sich eintragen will (nicht austragen), prüfe auf Zeitüberschneidungen
      if (!isSignedUp && task?.timeFrom && task?.timeTo) {
        // Finde alle Tasks, für die der User bereits eingetragen ist
        const mySignedUpTasks = tasks.filter(t => 
          t.signups?.some(s => s.sellerId === sellerIdInt)
        );

        // Prüfe auf Überschneidungen
        for (const signedTask of mySignedUpTasks) {
          if (signedTask.day === task.day && signedTask.timeFrom && signedTask.timeTo) {
            // Zeitüberschneidung: start1 < end2 UND start2 < end1
            const hasOverlap = 
              task.timeFrom < signedTask.timeTo && 
              signedTask.timeFrom < task.timeTo;

            if (hasOverlap) {
              alert(`Eintragung nicht möglich!\n\nDu bist bereits für "${signedTask.title}" (${signedTask.timeFrom} - ${signedTask.timeTo}) am ${signedTask.day} eingetragen.`);
              return; // Abbrechen
            }
          }
        }
      }

      // Optimistic UI update - sofort aktualisieren
      if (isSignedUp) {
        // Sofort aus Liste entfernen (optimistisch)
        setTasks(prevTasks => prevTasks.map(t => 
          t.id === taskId 
            ? { ...t, signups: t.signups?.filter(s => s.sellerId !== sellerIdInt) }
            : t
        ));
      } else {
        // Sofort hinzufügen (optimistisch)
        setTasks(prevTasks => prevTasks.map(t => 
          t.id === taskId 
            ? { 
                ...t, 
                signups: [...(t.signups || []), { 
                  sellerId: sellerIdInt, 
                  seller: { firstName: '', lastName: '' } 
                }] 
              }
            : t
        ));
      }

      // Dann tatsächliche API-Anfrage im Hintergrund
      if (isSignedUp) {
        const res = await fetch(`/api/task-signups?taskId=${taskId}&sellerId=${sellerId}`, {
          method: 'DELETE',
        });

        if (res.ok) {
          setMessage('✓ Erfolgreich ausgetragen');
        } else {
          // Bei Fehler: zurücksetzen
          loadData();
          const data = await res.json();
          alert(data.error || 'Fehler beim Austragen');
        }
      } else {
        const res = await fetch('/api/task-signups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, sellerId }),
        });

        if (res.ok) {
          setMessage('✓ Erfolgreich eingetragen');
        } else {
          // Bei Fehler: zurücksetzen
          loadData();
          const data = await res.json();
          alert(data.error || 'Fehler beim Eintragen');
        }
      }

      setTimeout(() => setMessage(''), 2000);
    } catch (error) {
      console.error('Error toggling task:', error);
      loadData(); // Bei Fehler neu laden
      alert('Fehler beim Aktualisieren');
    }
  }

  async function handleCakeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cakeName.trim() || !sellerId) return;

    try {
      // Create new cake
      const res = await fetch('/api/cakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cakeName: cakeName.trim(), sellerId: parseInt(sellerId, 10) }),
      });

      if (res.ok) {
        setMessage('✓ Kuchen erfolgreich hinzugefügt');
        setCakeName('');
        loadData();
      } else {
        const data = await res.json();
        setMessage(data.error || 'Fehler beim Hinzufügen');
      }

      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error adding cake:', error);
      setMessage('Fehler beim Hinzufügen');
      setTimeout(() => setMessage(''), 3000);
    }
  }

  async function handleUpdateCake(cakeId: string) {
    if (!editingCakeName.trim()) return;

    try {
      const res = await fetch('/api/cakes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cakeId, cakeName: editingCakeName.trim() }),
      });

      if (res.ok) {
        setMessage('✓ Kuchen erfolgreich aktualisiert');
        setEditingCakeId(null);
        setEditingCakeName('');
        loadData();
      } else {
        const data = await res.json();
        setMessage(data.error || 'Fehler beim Aktualisieren');
      }

      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error updating cake:', error);
      setMessage('Fehler beim Aktualisieren');
      setTimeout(() => setMessage(''), 3000);
    }
  }

  function startEditingCake(cake: Cake) {
    setEditingCakeId(cake.id);
    setEditingCakeName(cake.cakeName);
  }

  function cancelEditing() {
    setEditingCakeId(null);
    setEditingCakeName('');
  }

  async function handleDeleteCake(cakeId: string) {
    if (!confirm('Kuchen wirklich löschen?')) return;

    try {
      const res = await fetch(`/api/cakes?id=${cakeId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMessage('✓ Kuchen erfolgreich gelöscht');
        if (editingCakeId === cakeId) {
          setEditingCakeId(null);
          setEditingCakeName('');
        }
        loadData();
      } else {
        const data = await res.json();
        setMessage(data.error || 'Fehler beim Löschen');
      }

      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error deleting cake:', error);
      setMessage('Fehler beim Löschen');
      setTimeout(() => setMessage(''), 3000);
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

  // Group tasks by day
  const groupedTasks: { [key: string]: Task[] } = {
    'Freitag': [],
    'Samstag': [],
    'Sonntag': [],
  };

  tasks.forEach((task) => {
    if (groupedTasks[task.day]) {
      groupedTasks[task.day].push(task);
    }
  });

  return (
    <div className="min-h-screen bg-gray-100">
      <Header
        links={getNavLinks(
          { role: 'employee', isEmployee: true, isCashier },
          'mitarbeiter',
          {
            // getNavLinks only supports a single "Kasse" link. Bei genau einem aktiven
            // Basar verlinken wir direkt auf dessen Kasse (bisheriger Komfort-Shortcut).
            // Bei 0 oder mehreren aktiven Basaren verlinken wir stattdessen auf die
            // allgemeine Basar-Auswahl (/admin/basars), statt willkürlich den ersten
            // von mehreren aktiven Basaren zu bevorzugen.
            kasseHref: activeBasars.length === 1 ? `/admin/basars/${activeBasars[0].id}/kasse` : '/admin/basars',
          }
        )}
        sellerInfo={sellerName && sellerNumber ? { name: sellerName, sellerId: sellerNumber } : null}
      />

      <div className="max-w-6xl mx-auto p-8">
        {/* Deine Basare – Teilnahme pro Basar */}
        <div className="mb-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-2 text-center">Deine Basare</h2>
          <p className="text-center text-gray-600 mb-6 text-sm">
            Melde dich für die Basare an oder ab, an denen du teilnehmen möchtest.
          </p>

          {message && (
            <div className={`mb-6 px-6 py-3 rounded-lg font-medium text-center animate-fade-in ${
              message.includes('Fehler') ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-green-100 text-green-800 border border-green-200'
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
                      onClick={() => handleToggleParticipation(basar)}
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

        {/* Kasse Card – only for cashiers */}
        {isCashier && (
          <div className="mb-8 bg-purple-50 border border-purple-200 rounded-lg shadow-sm p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Kasse 💳</h2>
              <p className="text-gray-600 mt-1 text-sm">
                Du bist als Kassierer eingetragen. Wähle einen aktiven Basar, um die Kasse zu öffnen.
              </p>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              {activeBasars.length === 0 ? (
                <span className="px-6 py-3 bg-gray-200 text-gray-500 font-semibold rounded-xl text-sm">
                  Kein aktiver Basar
                </span>
              ) : (
                activeBasars.map(b => (
                  <a
                    key={b.id}
                    href={`/admin/basars/${b.id}/kasse`}
                    className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-xl transition-colors shadow-sm text-center"
                  >
                    Kasse: {b.title} →
                  </a>
                ))
              )}
            </div>
          </div>
        )}

        {/* Mein Basar Card */}
        <div className="mb-8 bg-yellow-50 border border-yellow-200 rounded-lg shadow-sm p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Mein Basar – Artikel erfassen</h2>
            <p className="text-gray-600 mt-1 text-sm">
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

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-2xl font-bold text-gray-800">Helferliste</h2>
          {basars.length > 1 && (
            <label className="text-sm text-gray-600 flex items-center gap-2">
              Termine von:
              <select
                value={helferlisteBasarId}
                onChange={(e) => setHelferlisteBasarId(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {basars.map(b => (
                  <option key={b.id} value={b.id}>{b.title} ({STATUS_LABELS[b.status]})</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="space-y-8 mb-12">
          {dayOrder.map((day) => {
            const dayTasks = groupedTasks[day] || [];
            const helferlisteBasar = basars.find(b => b.id === helferlisteBasarId);
            const dateValue = helferlisteBasar ? dateForWeekday(helferlisteBasar, day) : null;
            const formattedDate = dateValue
              ? dateValue.toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  timeZone: 'Europe/Berlin',
                })
              : '';
            
            return (
              <div key={day}>
                <h3 className="text-3xl font-extrabold text-teal-700 mb-6">
                  {day}
                  {formattedDate && <span className="text-2xl font-normal text-gray-600 ml-3">({formattedDate})</span>}
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  {dayTasks.length > 0 ? (
                    dayTasks.map((task) => {
                      const signupCount = task.signups?.length || 0;
                      const sellerIdInt = parseInt(sellerId, 10);
                      const isSignedUp = task.signups?.some(s => s.sellerId === sellerIdInt) || false;
                      const isFull = signupCount >= task.capacity;

                      return (
                        <div key={task.id} className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-5">
                          <div className="mb-3">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="text-lg font-semibold text-gray-800">{task.title}</h4>
                              <span className="text-sm text-gray-600">
                                {signupCount} / {task.capacity}
                              </span>
                            </div>
                            {(task.timeFrom || task.timeTo) && (
                              <div className="text-sm text-gray-600">
                                {task.timeFrom && task.timeTo 
                                  ? `${task.timeFrom} - ${task.timeTo} Uhr`
                                  : task.timeFrom 
                                  ? `ab ${task.timeFrom} Uhr`
                                  : `bis ${task.timeTo} Uhr`
                                }
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleTaskToggle(task.id)}
                            disabled={!isSignedUp && isFull}
                            className={`w-full py-2 px-4 rounded font-medium shadow text-lg transition-colors ${
                              isSignedUp
                                ? 'bg-red-500 hover:bg-red-600 text-white active:bg-red-700'
                                : isFull
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-yellow-500 hover:bg-yellow-600 text-gray-800 active:bg-yellow-700'
                            }`}
                          >
                            {isSignedUp ? 'Austragen' : isFull ? 'Voll' : 'Jetzt eintragen'}
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-gray-500">Keine Aufgaben für diesen Tag.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <hr className="my-10 border-gray-300" />

        <h2 className="text-2xl font-bold text-gray-800 mb-4">Kuchenliste</h2>
        <p className="text-sm text-gray-600 mb-4">
          Hier kannst du Kuchen eintragen. Du siehst die vorhandenen Kuchenarten – nicht, wer sie mitbringt.
        </p>

        {/* My Cakes Section */}
        {myCakes.length > 0 && (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-6">
            <p className="text-sm font-medium text-gray-800 mb-3">
              <strong>Deine Kuchen ({myCakes.length}):</strong>
            </p>
            <div className="space-y-2">
              {myCakes.map((cake) => (
                <div key={cake.id} className="bg-white p-3 rounded shadow-sm">
                  {editingCakeId === cake.id ? (
                    <div className="flex flex-col md:flex-row gap-2">
                      <input
                        type="text"
                        value={editingCakeName}
                        onChange={(e) => setEditingCakeName(e.target.value)}
                        className="flex-1 p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleUpdateCake(cake.id)}
                        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded font-medium"
                      >
                        Speichern
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded font-medium"
                      >
                        Abbrechen
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-900 font-medium flex-1">{cake.cakeName}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEditingCake(cake)}
                          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm font-medium"
                        >
                          Ändern
                        </button>
                        <button
                          onClick={() => handleDeleteCake(cake.id)}
                          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm font-medium"
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add New Cake Form */}
        <form onSubmit={handleCakeSubmit} className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-800">Neuen Kuchen hinzufügen</h3>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={cakeName}
              onChange={(e) => setCakeName(e.target.value)}
              placeholder="z.B. Marmorkuchen"
              className="flex-1 p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500 text-base"
              required
            />
            <button
              type="submit"
              className="bg-yellow-500 hover:bg-yellow-600 text-gray-800 px-6 py-3 rounded font-medium shadow text-base"
            >
              Hinzufügen
            </button>
          </div>
        </form>

        <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-800">Alle Kuchen (gesamt: {cakes.length})</h3>
          <ul className="list-disc ml-6 text-lg text-gray-900">
            {cakes.length > 0 ? (
              cakes.map((cake) => (
                <li key={cake.id} className="mb-1">{cake.cakeName}</li>
              ))
            ) : (
              <li className="text-gray-500">Noch keine Kuchen eingetragen</li>
            )}
          </ul>
        </div>

        <hr className="my-10 border-gray-300" />

        {/* Password Change Section */}
        <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-bold mb-4">Sicherheit</h2>
          <p className="text-gray-600 mb-4">Ändern Sie hier Ihr Passwort</p>
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
              <h3 className="text-xl font-bold mb-4">Passwort ändern</h3>
              
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Neues Passwort
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Passwort bestätigen
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    disabled={changingPassword}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={changingPassword}
                  >
                    {changingPassword ? 'Wird geändert...' : 'Passwort ändern'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Bestätigungsdialog: Teilnahme an einem Basar umschalten */}
      {pendingBasar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="seller-modal-title"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{pendingBasar.myParticipation?.isActive ? '❌' : '✅'}</span>
              <h2 id="seller-modal-title" className="text-xl font-bold text-gray-800">
                {pendingBasar.myParticipation?.isActive
                  ? `Teilnahme an "${pendingBasar.title}" beenden?`
                  : `An "${pendingBasar.title}" teilnehmen?`}
              </h2>
            </div>

            <div className="text-gray-700 space-y-2 mb-6">
              {pendingBasar.myParticipation?.isActive ? (
                <>
                  <p>Du möchtest deine <strong>Teilnahme beenden</strong>.</p>
                  <p className="text-sm text-gray-500">
                    Dein Status für diesen Basar wird dann als <span className="font-semibold text-red-600">nicht aktiv</span> markiert.
                    Du kannst dich jederzeit wieder anmelden.
                  </p>
                </>
              ) : (
                <>
                  <p>Du möchtest an diesem Basar <strong>teilnehmen</strong>.</p>
                  <ul className="text-sm text-gray-500 list-disc list-inside space-y-1 mt-2">
                    <li>Dein Status wird als <span className="font-semibold text-green-600">aktiv</span> registriert.</li>
                    <li>Du wirst bei diesem Basar verkaufen können.</li>
                    <li>Verkäufernummer: <span className="font-semibold">#{sellerNumber}</span></li>
                    <li>Du kannst deine Teilnahme jederzeit wieder beenden.</li>
                  </ul>
                </>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPendingBasar(null)}
                className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors font-medium"
              >
                Abbrechen
              </button>
              <button
                onClick={handleConfirmParticipationToggle}
                className={`px-5 py-2 rounded-lg text-white font-semibold transition-colors ${
                  pendingBasar.myParticipation?.isActive
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-green-500 hover:bg-green-600'
                }`}
              >
                {pendingBasar.myParticipation?.isActive ? 'Ja, beenden' : 'Ja, teilnehmen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
