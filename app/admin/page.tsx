'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Seller {
  id: string;
  sellerId: string;
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
  sellerId: string;
  seller?: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

const dayTitles: { [key: string]: string } = {
  FR: 'Freitag',
  SA: 'Samstag',
  SO: 'Sonntag',
};

export default function AdminPage() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cakes, setCakes] = useState<Cake[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch sellers, tasks, and cakes
        const [sellersRes, tasksRes, cakesRes] = await Promise.all([
          fetch('/api/sellers'),
          fetch('/api/tasks'),
          fetch('/api/cakes'),
        ]);

        if (!sellersRes.ok || !tasksRes.ok || !cakesRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const [sellersData, tasksData, cakesData] = await Promise.all([
          sellersRes.json(),
          tasksRes.json(),
          cakesRes.json(),
        ]);

        setSellers(sellersData);
        setTasks(tasksData);
        setCakes(cakesData);
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
    FR: [],
    SA: [],
    SO: [],
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
      {/* Header */}
      <header className="bg-yellow-500 text-gray-800 p-4 shadow-md">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold hover:underline">
            Kinderbasar Neukirchen
          </Link>
          <nav className="flex gap-4">
            <Link href="/admin" className="hover:underline font-bold">
              Basarliste
            </Link>
            <Link href="/admin/list" className="hover:underline">
              Helferliste
            </Link>
            <Link href="/" className="hover:underline">
              Logout
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-8">
        {/* Helferliste */}
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Helferliste (Admin)</h2>

        <div className="space-y-8 mb-12">
          {Object.entries(groupedTasks).map(([dayCode, dayTasks]) => (
            <div key={dayCode}>
              <h3 className="text-3xl font-extrabold text-teal-600 mb-6">
                {dayTitles[dayCode]}
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                {dayTasks.length > 0 ? (
                  dayTasks.map((task) => {
                    const signups = task.signups || [];
                    return (
                      <div key={task.id} className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-5">
                        <div className="flex items-center justify-between">
                          <h4 className="text-lg font-semibold">{task.title}</h4>
                          <span className="text-sm text-gray-600">
                            {signups.length} / {task.capacity}
                          </span>
                        </div>
                        <div className="mt-3 text-sm">
                          <ul className="list-disc ml-5">
                            {signups.map((signup, idx) => (
                              <li key={idx}>
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
          ))}
        </div>

        <hr className="my-10 border-gray-300" />

        {/* Kuchenliste */}
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Kuchenliste (Admin)</h2>
        <p className="text-sm text-gray-600 mb-3">Admins sehen Kuchen inkl. Person.</p>
        <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6">
          <ul className="list-disc ml-6">
            {cakes.length > 0 ? (
              cakes.map((cake) => {
                const seller = cake.seller || sellersByEmail[cake.sellerId];
                return (
                  <li key={cake.id}>
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