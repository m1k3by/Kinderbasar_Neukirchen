'use client';

import { useState, useEffect } from 'react';
import Header from '../components/Header';

interface Seller {
  sellerId: number;
  firstName: string;
  lastName: string;
  email: string;
  isEmployee: boolean;
}

interface Task {
  id: string;
  title: string;
  day: string;
  capacity: number;
  signups?: {
    seller: {
      firstName: string;
      lastName: string;
      email: string;
    };
  }[];
}

interface Cake {
  id: string;
  cakeName: string;
  sellerId: number;
  seller?: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

const dayOrder = ['Freitag', 'Samstag', 'Sonntag'];

export default function AdminPage() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cakes, setCakes] = useState<Cake[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showResetConfirm1, setShowResetConfirm1] = useState(false);
  const [showResetConfirm2, setShowResetConfirm2] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  const handleGlobalReset = async () => {
    try {
      const res = await fetch('/api/admin/reset-seller-status', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setResetMessage(data.message);
        setShowResetConfirm1(false);
        setShowResetConfirm2(false);
        setTimeout(() => setResetMessage(''), 5000);
      } else {
        setResetMessage('Fehler: ' + data.error);
      }
    } catch (err) {
      setResetMessage('Ein Fehler ist aufgetreten.');
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch sellers, tasks, cakes, and settings
        const [sellersRes, tasksRes, cakesRes, settingsRes] = await Promise.all([
          fetch('/api/sellers'),
          fetch('/api/tasks'),
          fetch('/api/cakes'),
          fetch('/api/settings'),
        ]);

        if (!sellersRes.ok || !tasksRes.ok || !cakesRes.ok || !settingsRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const [sellersData, tasksData, cakesData, settingsData] = await Promise.all([
          sellersRes.json(),
          tasksRes.json(),
          cakesRes.json(),
          settingsRes.json(),
        ]);

        setSellers(sellersData);
        setTasks(tasksData);
        setCakes(cakesData);
        setSettings(settingsData);
      } catch (err) {
        setError('Fehler beim Laden der Daten');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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

  // Create a map of sellers by email for quick lookup
  const sellersByEmail: { [key: string]: Seller } = {};
  sellers.forEach((seller) => {
    sellersByEmail[seller.email] = seller;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl">Lädt...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header 
        links={[
          { href: '/admin', label: 'Basarliste', active: true },
          { href: '/admin/list', label: 'Helferliste' },
          { href: '/admin/tasks', label: 'Aufgaben' },
          { href: '/admin/settings', label: 'Datum einstellen' },
          { href: '/', label: 'Logout' },
        ]}
      />

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-8">
        {/* Warning for seller IDs */}
        {sellers.filter(s =>s.sellerId >= 1000 && s.sellerId <= 9999).length >= 9000 && (
          <div className="mb-6 bg-red-100 border-2 border-red-600 text-red-900 px-6 py-4 rounded-lg">
            <p className="text-xl font-bold">⚠️ WARNUNG: Alle Verkäufer-IDs sind vergeben!</p>
            <p className="mt-2">Der Bereich 1000-9999 ist vollständig belegt. Keine weiteren Registrierungen möglich.</p>
          </div>
        )}

        {/* Global Actions */}
        <div className="mb-12 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Globale Aktionen</h2>
          
          <div className="flex flex-col items-start space-y-4">
            <p className="text-gray-600">
              Setzen Sie den Status aller Verkäufer (inkl. Mitarbeiter) auf "Inaktiv".
            </p>
            
            <button
              onClick={() => setShowResetConfirm1(true)}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            >
              Alle Verkäuferstati zurücksetzen
            </button>

            {resetMessage && (
              <div className="mt-2 p-3 bg-blue-100 text-blue-800 rounded">
                {resetMessage}
              </div>
            )}
          </div>
        </div>

        {/* Confirmation Modal 1 */}
        {showResetConfirm1 && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
              <h3 className="text-xl font-bold mb-4">Wirklich?</h3>
              <p className="mb-6">Möchten Sie wirklich alle Verkäuferstati auf inaktiv setzen?</p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => setShowResetConfirm1(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    setShowResetConfirm1(false);
                    setShowResetConfirm2(true);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Ja, wirklich
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Modal 2 */}
        {showResetConfirm2 && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full border-4 border-red-500">
              <h3 className="text-xl font-bold mb-4 text-red-600">Wirklich wirklich?</h3>
              <p className="mb-6 font-bold">Dies kann nicht rückgängig gemacht werden!</p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => setShowResetConfirm2(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleGlobalReset}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-bold"
                >
                  JA, ALLES ZURÜCKSETZEN
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Helferliste */}
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Helferliste (Admin)</h2>

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
                      const signups = task.signups || [];
                      return (
                        <div key={task.id} className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-5">
                          <div className="flex items-center justify-between">
                            <h4 className="text-lg font-semibold">{task.title}</h4>
                            <span className="text-base text-gray-600">
                              {signups.length} / {task.capacity}
                            </span>
                          </div>
                          <div className="mt-3 text-base">
                            <ul className="list-disc ml-5 text-gray-900">
                              {signups.map((signup, idx) => (
                                <li key={idx} className="mb-1">
                                  {signup.seller.firstName} {signup.seller.lastName}
                                </li>
                              ))}
                            </ul>
                          </div>
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

        {/* Kuchenliste */}
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Kuchenliste (Admin)</h2>
        <p className="text-sm text-gray-600 mb-3">Admins sehen Kuchen inkl. Person.</p>
        <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6">
          <ul className="list-disc ml-6 text-lg text-gray-900">
            {cakes.length > 0 ? (
              cakes.map((cake) => {
                const seller = cake.seller || sellersByEmail[cake.sellerId];
                return (
                  <li key={cake.id} className="mb-1">
                    <span className="font-medium">{cake.cakeName}</span> –{' '}
                    {seller
                      ? `${seller.firstName} ${seller.lastName}`
                      : 'Unbekannt'}
                  </li>
                );
              })
            ) : (
              <li className="text-gray-500">Noch keine Einträge</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}