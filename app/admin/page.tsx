'use client';

import { useState, useEffect } from 'react';
import Header from '../components/Header';
import { dateForWeekday } from '../lib/basarWindows';

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

interface Basar {
  id: string;
  title: string;
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

// /api/sellers is cursor-paginated (admin-only, up to 500 rows per page) so a single fetch no
// longer returns the whole table. Loop pages to reassemble the full list for this dashboard's
// seller-ID-exhaustion warning and cake-owner lookup.
async function fetchAllSellers(): Promise<Seller[]> {
  const all: Seller[] = [];
  let cursor: number | null = null;
  do {
    const qs = new URLSearchParams({ limit: '500' });
    if (cursor !== null) qs.set('cursor', String(cursor));
    const res = await fetch(`/api/sellers?${qs.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch sellers');
    const data = await res.json();
    all.push(...(data.sellers ?? []));
    cursor = data.nextCursor;
  } while (cursor !== null);
  return all;
}

export default function AdminPage() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cakes, setCakes] = useState<Cake[]>([]);
  const [basars, setBasars] = useState<Basar[]>([]);
  const [helferlisteBasarId, setHelferlisteBasarId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch sellers (paginated, looped to "all"), tasks, cakes, and basars
        const [sellersData, tasksRes, cakesRes, basarsRes] = await Promise.all([
          fetchAllSellers(),
          fetch('/api/tasks'),
          fetch('/api/cakes'),
          fetch('/api/basars'),
        ]);

        if (!tasksRes.ok || !cakesRes.ok || !basarsRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const [tasksData, cakesData, basarsData] = await Promise.all([
          tasksRes.json(),
          cakesRes.json(),
          basarsRes.json(),
        ]);

        setSellers(sellersData);
        setTasks(tasksData);
        setCakes(cakesData);
        const relevant: Basar[] = (basarsData.basars ?? []).filter((b: Basar) => !b.isArchived && b.status !== 'DRAFT');
        setBasars(relevant);
        setHelferlisteBasarId(relevant.find(b => b.status === 'ACTIVE')?.id
          || relevant.find(b => b.status === 'OPEN')?.id
          || relevant[0]?.id
          || '');
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
          { href: '/admin/basars', label: 'Basare' },
          { href: '/admin/list', label: 'Helferliste' },
          { href: '/admin/tasks', label: 'Aufgaben' },
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

        {/* Basare Card */}
        <div className="mb-8 bg-yellow-50 border border-yellow-200 rounded-lg shadow-sm p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Basare verwalten</h2>
            <p className="text-gray-600 mt-1 text-sm">
              Basare anlegen, Artikel-Kasse betreiben, Abrechnungen erstellen.
            </p>
          </div>
          <a
            href="/admin/basars"
            className="flex-shrink-0 px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold rounded-xl transition-colors shadow-sm"
          >
            Zu den Basaren →
          </a>
        </div>

        {/* Hilfe-Assistent Card */}
        <div className="mb-8 bg-yellow-50 border border-yellow-200 rounded-lg shadow-sm p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Hilfe-Assistent auswerten</h2>
            <p className="text-gray-600 mt-1 text-sm">
              Gestellte Fragen, unbeantwortete Fälle und Bewertungen einsehen.
            </p>
          </div>
          <a
            href="/admin/hilfe"
            className="flex-shrink-0 px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold rounded-xl transition-colors shadow-sm"
          >
            Zur Auswertung →
          </a>
        </div>

        {/* Helferliste */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-2xl font-bold text-gray-800">Helferliste (Admin)</h2>
          {basars.length > 1 && (
            <label className="text-sm text-gray-600 flex items-center gap-2">
              Termine von:
              <select
                value={helferlisteBasarId}
                onChange={(e) => setHelferlisteBasarId(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
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
