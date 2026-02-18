'use client';

import { useState, useEffect } from 'react';
import Header from '../../components/Header';

interface Task {
  id: string;
  title: string;
  day: string;
  timeFrom?: string | null;
  timeTo?: string | null;
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
    timeFrom: '',
    timeTo: '',
    capacity: 10,
  });

  // Edit state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskData, setEditingTaskData] = useState({
    title: '',
    day: '',
    timeFrom: '',
    timeTo: '',
    capacity: 10,
  });

  // Clear signups state
  const [showClearSignupsConfirm, setShowClearSignupsConfirm] = useState(false);
  
  // Clear cakes state
  const [showClearCakesConfirm, setShowClearCakesConfirm] = useState(false);

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
      setFormData({ title: '', day: '', timeFrom: '', timeTo: '', capacity: 10 });
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

  // Clear all task signups
  const handleClearSignups = async () => {
    try {
      setError('');
      const response = await fetch('/api/admin/clear-task-signups', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Fehler beim Löschen');
      }
      
      const data = await response.json();
      setError('');
      alert(data.message);
      setShowClearSignupsConfirm(false);
      fetchTasks(); // Reload tasks to show updated signup counts
    } catch (err: any) {
      setError(err.message);
      setShowClearSignupsConfirm(false);
    }
  };

  // Clear all cakes
  const handleClearCakes = async () => {
    try {
      setError('');
      const response = await fetch('/api/admin/clear-cakes', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Fehler beim Löschen');
      }
      
      const data = await response.json();
      setError('');
      alert(data.message);
      setShowClearCakesConfirm(false);
    } catch (err: any) {
      setError(err.message);
      setShowClearCakesConfirm(false);
    }
  };

  // Start editing a task
  const startEditing = (task: Task) => {
    setEditingTaskId(task.id);
    setEditingTaskData({
      title: task.title,
      day: task.day,
      timeFrom: task.timeFrom || '',
      timeTo: task.timeTo || '',
      capacity: task.capacity,
    });
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingTaskId(null);
    setEditingTaskData({ title: '', day: '', timeFrom: '', timeTo: '', capacity: 10 });
  };

  // Update task
  const handleUpdate = async (id: string) => {
    setError('');

    try {
      const response = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editingTaskData }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update task');
      }

      cancelEditing();
      fetchTasks();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header 
        links={[
          { href: '/admin', label: 'Basarliste' },
          { href: '/admin/list', label: 'Helferliste' },
          { href: '/admin/tasks', label: 'Aufgaben', active: true },
          { href: '/admin/settings', label: 'Datum einstellen' },
          { href: '/', label: 'Logout' },
        ]}
      />

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
            {error}
          </div>
        )}

        {/* Create Button */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow"
          >
            {showForm ? 'Abbrechen' : 'Neue Aufgabe'}
          </button>
          
          <button
            onClick={() => setShowClearSignupsConfirm(true)}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow"
          >
            Alle Anmeldungen löschen
          </button>
          
          <button
            onClick={() => setShowClearCakesConfirm(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow"
          >
            Alle Kuchen löschen
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Uhrzeit von
                  </label>
                  <input
                    type="time"
                    value={formData.timeFrom}
                    onChange={(e) => setFormData({ ...formData, timeFrom: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Uhrzeit bis
                  </label>
                  <input
                    type="time"
                    value={formData.timeTo}
                    onChange={(e) => setFormData({ ...formData, timeTo: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kapazität (Anzahl Helfer) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max="150"
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
                  Aufgabe anlegen
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
                <div key={task.id} className="p-4 md:p-6 hover:bg-gray-50 transition-colors">
                  {editingTaskId === task.id ? (
                    // Edit Mode
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Aufgabe / Schicht *
                        </label>
                        <input
                          type="text"
                          required
                          value={editingTaskData.title}
                          onChange={(e) => setEditingTaskData({ ...editingTaskData, title: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Tag *
                        </label>
                        <select
                          required
                          value={editingTaskData.day}
                          onChange={(e) => setEditingTaskData({ ...editingTaskData, day: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="Freitag">Freitag</option>
                          <option value="Samstag">Samstag</option>
                          <option value="Sonntag">Sonntag</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Uhrzeit von
                          </label>
                          <input
                            type="time"
                            value={editingTaskData.timeFrom}
                            onChange={(e) => setEditingTaskData({ ...editingTaskData, timeFrom: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Uhrzeit bis
                          </label>
                          <input
                            type="time"
                            value={editingTaskData.timeTo}
                            onChange={(e) => setEditingTaskData({ ...editingTaskData, timeTo: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
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
                          value={editingTaskData.capacity}
                          onChange={(e) => setEditingTaskData({ ...editingTaskData, capacity: parseInt(e.target.value) })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => handleUpdate(task.id)}
                          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                        >
                          Speichern
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg font-medium transition-colors"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          {task.title}
                        </h3>
                        <div className="flex flex-col md:flex-row md:gap-4 gap-2 text-sm text-gray-600 mb-3">
                          <span className="font-medium">{task.day}</span>
                          {(task.timeFrom || task.timeTo) && (
                            <span className="font-medium">
                              {task.timeFrom && task.timeTo 
                                ? `${task.timeFrom} - ${task.timeTo} Uhr`
                                : task.timeFrom 
                                ? `ab ${task.timeFrom} Uhr`
                                : `bis ${task.timeTo} Uhr`
                              }
                            </span>
                          )}
                          <span className="inline-flex items-center">
                            👥 <span className="ml-1">{task._count?.signups || 0} / {task.capacity} Helfer</span>
                          </span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="w-full md:w-64">
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

                      <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                        <button
                          onClick={() => startEditing(task)}
                          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clear Signups Confirmation Modal */}
        {showClearSignupsConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
              <h3 className="text-xl font-bold mb-4 text-red-600">Alle Anmeldungen löschen?</h3>
              <p className="mb-6 text-gray-800">
                Möchten Sie wirklich alle Benutzer-Anmeldungen aus allen Aufgaben entfernen? 
                Die Aufgaben selbst bleiben bestehen.
              </p>
              <p className="mb-6 text-sm text-gray-600">
                Diese Aktion kann nicht rückgängig gemacht werden!
              </p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => setShowClearSignupsConfirm(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleClearSignups}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Ja, alle löschen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clear Cakes Confirmation Modal */}
        {showClearCakesConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
              <h3 className="text-xl font-bold mb-4 text-orange-600">Alle Kuchen löschen?</h3>
              <p className="mb-6 text-gray-800">
                Möchten Sie wirklich alle Kuchen-Einträge löschen?
              </p>
              <p className="mb-6 text-sm text-gray-600">
                Diese Aktion kann nicht rückgängig gemacht werden!
              </p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => setShowClearCakesConfirm(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleClearCakes}
                  className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
                >
                  Ja, alle löschen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
