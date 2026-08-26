'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { dateForWeekday, pickDefaultBasarId } from '../lib/basarWindows';
import { getNavLinks } from '../lib/navLinks';
import { shiftsOverlap } from '../lib/time';

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
  const [basars, setBasars] = useState<Basar[]>([]);
  const [helferlisteBasarId, setHelferlisteBasarId] = useState<string>('');
  const [isCashier, setIsCashier] = useState(false);
  const activeBasars = basars.filter(b => b.status === 'ACTIVE');

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
        setHelferlisteBasarId(prev => prev || pickDefaultBasarId(relevant));
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

  const loadData = useCallback(async () => {
    if (!helferlisteBasarId) return;
    const q = `?basarId=${encodeURIComponent(helferlisteBasarId)}`;
    try {
      const [tasksRes, cakesRes] = await Promise.all([
        fetch(`/api/tasks${q}`),
        fetch(`/api/cakes${q}`),
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
  }, [helferlisteBasarId, sellerId]);

  // Muss unterhalb von loadData stehen: die Abhaengigkeitsliste wird beim Rendern
  // ausgewertet, eine const-Deklaration weiter unten waere zu diesem Zeitpunkt noch in der
  // temporalen Totzone.
  useEffect(() => {
    loadData();
  }, [loadData]);

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
          // Gleiche Regel wie serverseitig in app/api/task-signups/route.ts – beide rufen
          // shiftsOverlap auf, damit die Vorabprüfung hier nicht strenger sein kann als das,
          // was der Server tatsächlich akzeptiert.
          if (signedTask.day === task.day && shiftsOverlap(task, signedTask)) {
            alert(`Eintragung nicht möglich!\n\nDu bist bereits für "${signedTask.title}" (${signedTask.timeFrom} - ${signedTask.timeTo}) am ${signedTask.day} eingetragen.`);
            return; // Abbrechen
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
        const res = await fetch(
          `/api/task-signups?taskId=${taskId}&sellerId=${sellerId}&basarId=${encodeURIComponent(helferlisteBasarId)}`,
          { method: 'DELETE' }
        );

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
          body: JSON.stringify({ taskId, sellerId, basarId: helferlisteBasarId }),
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
    if (!cakeName.trim() || !sellerId || !helferlisteBasarId) return;

    try {
      // Create new cake
      const res = await fetch('/api/cakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cakeName: cakeName.trim(),
          sellerId: parseInt(sellerId, 10),
          basarId: helferlisteBasarId,
        }),
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
        {/* Basar-Teilnahme und Artikelerfassung sind gemeinsame Funktionen für Verkäufer
            und Mitarbeiter und leben daher vollständig im Verkäuferbereich (/seller) –
            erreichbar über den Tab "Verkäuferbereich" in der Kopfzeile. Einen eigenen
            Tab "Basare" gibt es für Mitarbeiter bewusst nicht mehr. Hier bleiben nur die
            Mitarbeiter-only Funktionen: Kasse, Helferliste, Kuchenliste. */}
        {message && (
          <div className={`mb-6 px-6 py-3 rounded-lg font-medium text-center animate-fade-in ${
            message.includes('Fehler') ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-green-100 text-green-800 border border-green-200'
          }`}>
            {message}
          </div>
        )}

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

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-2xl font-bold text-gray-800">Helferliste</h2>
          {/* Ohne Breitenbegrenzung richtet sich ein select nach seiner laengsten Option –
              ein Basartitel samt Statuszusatz sprengt damit den Handy-Viewport nach rechts.
              Gleiche Behandlung wie in app/admin/page.tsx und app/admin/list/page.tsx:
              auf dem Handy volle Breite mit Umbruch der Beschriftung, ab sm wieder inline
              mit Deckel. min-w-0 ist noetig, damit das Flex-Element ueberhaupt unter seine
              Inhaltsbreite schrumpfen darf – sonst laeuft es trotz max-w weiter ueber. */}
          {basars.length > 1 && (
            <label className="w-full sm:w-auto min-w-0 text-sm text-gray-600 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="flex-shrink-0">Helferliste für:</span>
              <select
                value={helferlisteBasarId}
                onChange={(e) => setHelferlisteBasarId(e.target.value)}
                className="w-full sm:w-auto sm:max-w-xs min-w-0 truncate border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                        <div key={task.id} data-task-title={task.title} className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-5">
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

        {/* Passwort ändern ist eine gemeinsame Funktion und lebt nur noch im
            Verkäuferbereich (/seller), erreichbar über den Header-Link. */}
      </div>
    </div>
  );
}
