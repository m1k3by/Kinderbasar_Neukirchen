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
    sellerId: string;
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
}

const dayOrder = ['Freitag', 'Samstag', 'Sonntag'];

export default function EmployeePage() {
  const router = useRouter();
  const [sellerId, setSellerId] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cakes, setCakes] = useState<Cake[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [myCake, setMyCake] = useState<Cake | null>(null);
  const [cakeName, setCakeName] = useState('');
  const [message, setMessage] = useState('');

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
    if (sellerId && cakes.length > 0) {
      const myExistingCake = cakes.find((c: any) => c.sellerId === sellerId);
      if (myExistingCake) {
        setMyCake(myExistingCake);
        setCakeName(myExistingCake.cakeName);
      }
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
          const myExistingCake = allCakes.find((c: Cake & { sellerId: string }) => c.sellerId === sellerId);
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

  async function handleTaskToggle(taskId: string) {
    if (!sellerId) return;

    try {
      const task = tasks.find(t => t.id === taskId);
      const isSignedUp = task?.signups?.some(s => s.sellerId === sellerId);

      if (isSignedUp) {
        // Austragen
        const res = await fetch(`/api/task-signups?taskId=${taskId}&sellerId=${sellerId}`, {
          method: 'DELETE',
        });

        if (res.ok) {
          setMessage('Erfolgreich ausgetragen');
          loadData();
        } else {
          const data = await res.json();
          setMessage(data.error || 'Fehler beim Austragen');
        }
      } else {
        // Eintragen
        const res = await fetch('/api/task-signups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, sellerId }),
        });

        if (res.ok) {
          setMessage('Erfolgreich eingetragen');
          loadData();
        } else {
          const data = await res.json();
          setMessage(data.error || 'Fehler beim Eintragen');
        }
      }

      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error toggling task:', error);
      setMessage('Fehler beim Aktualisieren');
      setTimeout(() => setMessage(''), 3000);
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
          body: JSON.stringify({ cakeName: cakeName.trim(), sellerId }),
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
      />

      <div className="max-w-6xl mx-auto p-8">
        {message && (
          <div className="mb-4 p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded">
            {message}
          </div>
        )}

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
                      const isSignedUp = task.signups?.some(s => s.sellerId === sellerId) || false;
                      const isFull = signupCount >= task.capacity;

                      return (
                        <div key={task.id} className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-5">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-lg font-semibold">{task.title}</h4>
                            <span className="text-sm text-gray-600">
                              {signupCount} / {task.capacity}
                            </span>
                          </div>
                          <button
                            onClick={() => handleTaskToggle(task.id)}
                            disabled={!isSignedUp && isFull}
                            className={`w-full py-2 px-4 rounded font-medium shadow text-lg ${
                              isSignedUp
                                ? 'bg-red-500 hover:bg-red-600 text-white'
                                : isFull
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-yellow-500 hover:bg-yellow-600 text-gray-800'
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

        <footer className="mt-12 text-center text-sm text-gray-500">
          <p>© — Queen Judith (Basar FTW '99')</p>
        </footer>
      </div>
    </div>
  );
}
