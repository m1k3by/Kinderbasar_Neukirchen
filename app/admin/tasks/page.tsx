'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Task {
  id: string;
  title: string;
  day: string;
  capacity: number;
  createdAt: string;
  _count?: {
    signups: number;
  };
}

export default function TasksManagementPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    day: '',
    capacity: 10,
  });

  // Fetch tasks
  const fetchTasks = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/tasks');
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const data = await response.json();
      setTasks(data);
    } catch (err) {
      setError('Fehler beim Laden der Tasks');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // Create task
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create task');
      }

      // Reset form and refresh
      setFormData({ title: '', day: '', capacity: 10 });
      setShowForm(false);
      fetchTasks();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Delete task
  const handleDelete = async (id: string) => {
    if (!confirm('Möchtest du diesen Task wirklich löschen?')) return;

    try {
      const response = await fetch(`/api/tasks?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete task');
      }

      fetchTasks();
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header - Same as other admin pages */}
      <header className="bg-yellow-500 text-gray-800 p-4 shadow-md">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold hover:underline">
            Kinderbasar Neukirchen
          </Link>
          <nav className="flex gap-4">
            <Link href="/admin" className="hover:underline">
              Basarliste
            </Link>
            <Link href="/admin/list" className="hover:underline">
              Helferliste
            </Link>
            <Link href="/admin/tasks" className="hover:underline font-bold">
              Aufgaben
            </Link>
            <Link href="/admin/settings" className="hover:underline">
              Datum einstellen
            </Link>
            <Link href="/" className="hover:underline">
              Logout
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-8">
        {/* Title Section */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Aufgaben-Verwaltung</h1>
          <p className="text-gray-600">Verwalte Helferschichten für den Basar</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            ⚠️ {error}
          </div>
        )}

        {/* Create Button */}
        <div className="mb-6">
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow"
          >
            {showForm ? '✕ Abbrechen' : '+ Neue Aufgabe'}
          </button>
        </div>

        {/* Create Form */}
        {showForm && (
          <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Neue Aufgabe anlegen</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Aufgabe / Schicht *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="z.B. Kuchenverkauf, Aufbau, Abbau..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tag *
                </label>
                <select
                  required
                  value={formData.day}
                  onChange={(e) => setFormData({ ...formData, day: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Bitte wählen...</option>
                  <option value="Freitag">Freitag</option>
                  <option value="Samstag">Samstag</option>
                  <option value="Sonntag">Sonntag</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kapazität (Anzahl Helfer) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max="50"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  ✓ Aufgabe anlegen
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tasks List */}
        <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-800">
              Alle Aufgaben ({tasks.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2">Lade Aufgaben...</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p className="text-lg">Noch keine Aufgaben vorhanden</p>
              <p className="text-sm mt-1">Lege die erste Aufgabe an!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {tasks.map((task) => (
                <div key={task.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {task.title}
                      </h3>
                      <div className="flex gap-4 text-sm text-gray-600 mb-3">
                        <span className="inline-flex items-center">
                          📅 <span className="ml-1 font-medium">{task.day}</span>
                        </span>
                        <span className="inline-flex items-center">
                          👥 <span className="ml-1">{task._count?.signups || 0} / {task.capacity} Helfer</span>
                        </span>
                        <span className="inline-flex items-center">
                          🕐 <span className="ml-1">Erstellt: {new Date(task.createdAt).toLocaleDateString('de-DE')}</span>
                        </span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-64">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Auslastung</span>
                          <span>{Math.round(((task._count?.signups || 0) / task.capacity) * 100)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              (task._count?.signups || 0) >= task.capacity
                                ? 'bg-red-500'
                                : (task._count?.signups || 0) > task.capacity * 0.7
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                            style={{
                              width: `${Math.min(((task._count?.signups || 0) / task.capacity) * 100, 100)}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(task.id)}
                      className="ml-4 bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      🗑️ Löschen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
