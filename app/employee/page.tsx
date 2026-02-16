'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';

interface Task {
  id: string;
  title: string;
  day: string;
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

const dayOrder = ['Freitag', 'Samstag', 'Sonntag'];

export default function EmployeePage() {
  const router = useRouter();
  const [sellerId, setSellerId] = useState('');
  const [sellerStatusActive, setSellerStatusActive] = useState(false);
  const [sellerName, setSellerName] = useState('');
  const [sellerNumber, setSellerNumber] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cakes, setCakes] = useState<Cake[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [myCake, setMyCake] = useState<Cake | null>(null);
  const [cakeName, setCakeName] = useState('');
  const [message, setMessage] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

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
    loadSellerInfo();
  }, []);

  async function loadSellerInfo() {
    if (!sellerId) return;
    
    try {
      const res = await fetch(`/api/sellers`);
      if (res.ok) {
        const sellers = await res.json();
        const currentSeller = sellers.find((s: any) => s.sellerId === parseInt(sellerId, 10));
        if (currentSeller) {
          setSellerStatusActive(currentSeller.sellerStatusActive || false);
          setSellerName(`${currentSeller.firstName} ${currentSeller.lastName}`);
          setSellerNumber(currentSeller.sellerId);
        }
      }
    } catch (error) {
      console.error('Error loading seller info:', error);
    }
  }

  useEffect(() => {
    if (sellerId && cakes.length > 0) {
      const myExistingCake = cakes.find((c: any) => c.sellerId === parseInt(sellerId, 10));
      if (myExistingCake) {
        setMyCake(myExistingCake);
        setCakeName(myExistingCake.cakeName);
      }
    }
    
    // Load seller info when sellerId changes
    if (sellerId) {
      loadSellerInfo();
    }
  }, [sellerId, cakes]);

  async function loadData() {
    try {
      const [tasksRes, cakesRes, settingsRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/cakes'),
        fetch('/api/settings'),
      ]);

      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (cakesRes.ok) {
        const allCakes = await cakesRes.json();
        setCakes(allCakes);
        
        // Find my cake
        if (sellerId) {
          const sellerIdInt = parseInt(sellerId, 10);
          const myExistingCake = allCakes.find((c: Cake & { sellerId: number }) => c.sellerId === sellerIdInt);
          if (myExistingCake) {
            setMyCake(myExistingCake);
            setCakeName(myExistingCake.cakeName);
          }
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  async function handleToggleSellerStatus() {
    if (!sellerId) return;

    try {
      const newStatus = !sellerStatusActive;
      const res = await fetch('/api/sellers/seller-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId, sellerStatusActive: newStatus }),
      });

      if (res.ok) {
        setSellerStatusActive(newStatus);
        setMessage(newStatus 
          ? '✓ Verkäuferstatus wurde aktiviert! Du kannst jetzt als Verkäufer aktiv sein.' 
          : '✓ Verkäuferstatus wurde deaktiviert.');
        setTimeout(() => setMessage(''), 5000);
      } else {
        const data = await res.json();
        setMessage(data.error || 'Fehler beim Aktualisieren des Verkäuferstatus');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error toggling seller status:', error);
      setMessage('Fehler beim Aktualisieren des Verkäuferstatus');
      setTimeout(() => setMessage(''), 3000);
    }
  }

  async function handleTaskToggle(taskId: string) {
    if (!sellerId) return;

    try {
      const task = tasks.find(t => t.id === taskId);
      const sellerIdInt = parseInt(sellerId, 10);
      const isSignedUp = task?.signups?.some(s => s.sellerId === sellerIdInt);

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
          setMessage(data.error || 'Fehler beim Austragen');
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
          setMessage(data.error || 'Fehler beim Eintragen');
        }
      }

      setTimeout(() => setMessage(''), 2000);
    } catch (error) {
      console.error('Error toggling task:', error);
      loadData(); // Bei Fehler neu laden
      setMessage('Fehler beim Aktualisieren');
      setTimeout(() => setMessage(''), 2000);
    }
  }

  async function handleCakeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cakeName.trim() || !sellerId) return;

    try {
      if (myCake) {
        // Update existing cake
        const res = await fetch('/api/cakes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: myCake.id, cakeName: cakeName.trim() }),
        });

        if (res.ok) {
          setMessage('Kuchen erfolgreich aktualisiert');
          loadData();
        } else {
          const data = await res.json();
          setMessage(data.error || 'Fehler beim Aktualisieren');
        }
      } else {
        // Create new cake
        const res = await fetch('/api/cakes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cakeName: cakeName.trim(), sellerId: parseInt(sellerId, 10) }),
        });

        if (res.ok) {
          setMessage('Kuchen erfolgreich eingetragen');
          loadData();
        } else {
          const data = await res.json();
          setMessage(data.error || 'Fehler beim Eintragen');
        }
      }

      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error with cake:', error);
      setMessage('Fehler beim Speichern');
      setTimeout(() => setMessage(''), 3000);
    }
  }

  async function handleDeleteCake() {
    if (!myCake) return;

    try {
      const res = await fetch(`/api/cakes?id=${myCake.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMessage('Kuchen erfolgreich gelöscht');
        setCakeName('');
        setMyCake(null);
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
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Die neuen Passwörter stimmen nicht überein');
      return;
    }

    // Validate password length
    if (passwordForm.newPassword.length < 6) {
      setPasswordError('Das neue Passwort muss mindestens 6 Zeichen lang sein');
      return;
    }

    setChangingPassword(true);

    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId: parseInt(sellerId, 10),
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setPasswordSuccess('Passwort erfolgreich geändert!');
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
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
        links={[
          { href: '/', label: 'Logout' },
        ]}
        sellerInfo={sellerName && sellerNumber ? { name: sellerName, sellerId: sellerNumber } : null}
      />

      <div className="max-w-6xl mx-auto p-8">
        {/* Seller Status Toggle */}
        <div className="mb-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6 text-center">Verkäuferstatus</h2>
          
          <div className="flex flex-col items-center justify-center space-y-6">
            <p className="text-lg text-center text-gray-700">
              Hier können Sie Ihren Verkäuferstatus aktivieren oder deaktivieren.
            </p>
            
            <button
              onClick={handleToggleSellerStatus}
              className={`w-full md:w-auto px-12 py-6 rounded-xl text-2xl font-bold transition-all transform hover:scale-105 shadow-lg ${
                sellerStatusActive
                  ? 'bg-green-500 hover:bg-green-600 text-white ring-4 ring-green-200'
                  : 'bg-red-500 hover:bg-red-600 text-white ring-4 ring-red-200'
              }`}
            >
              {sellerStatusActive ? 'Status: AKTIV' : 'Status: INAKTIV'}
            </button>

            {message && (
              <div className={`mt-4 px-6 py-3 rounded-lg font-medium animate-fade-in ${
                message.includes('aktiviert') ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'
              }`}>
                {message}
              </div>
            )}
          </div>
        </div>

        <h2 className="text-2xl font-bold text-gray-800 mb-4">Helferliste</h2>

        <div className="space-y-8 mb-12">
          {dayOrder.map((day) => {
            const dayTasks = groupedTasks[day] || [];
            const dateKey = `date_${day.toLowerCase()}`;
            const dateValue = settings[dateKey];
            const formattedDate = dateValue 
              ? new Date(dateValue + 'T00:00:00').toLocaleDateString('de-DE', { 
                  day: '2-digit', 
                  month: '2-digit', 
                  year: 'numeric' 
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
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-lg font-semibold text-gray-800">{task.title}</h4>
                            <span className="text-sm text-gray-600">
                              {signupCount} / {task.capacity}
                            </span>
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
          Hier kannst du einen Kuchen eintragen. Du siehst die vorhandenen Kuchenarten – nicht, wer sie mitbringt.
        </p>

        {myCake && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-4">
            <p className="text-sm font-medium text-gray-800">
              <strong>Dein Kuchen:</strong> {myCake.cakeName}
            </p>
          </div>
        )}

        <form onSubmit={handleCakeSubmit} className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6 mb-6">
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
              {myCake ? 'Ändern' : 'Eintragen'}
            </button>
            {myCake && (
              <button
                type="button"
                onClick={handleDeleteCake}
                className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded font-medium shadow text-base"
              >
                Löschen
              </button>
            )}
          </div>
        </form>

        <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6">
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
                      Aktuelles Passwort
                    </label>
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                      disabled={changingPassword}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Neues Passwort
                    </label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                      minLength={6}
                      disabled={changingPassword}
                    />
                    <p className="mt-1 text-xs text-gray-500">Mindestens 6 Zeichen</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Neues Passwort bestätigen
                    </label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                      disabled={changingPassword}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordModal(false);
                      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
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
    </div>
  );
}
