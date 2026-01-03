'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Ein Fehler ist aufgetreten');
      }

      // Redirect based on role
      if (data.role === 'admin') {
        router.push('/admin');
      } else if (data.role === 'seller') {
        router.push('/seller');
      } else {
        router.push('/employee');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />

      {/* Login Form */}
      <div className="flex items-center justify-center p-4 mt-8">
        <div className="max-w-md w-full bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6 md:p-8">
        <h2 className="text-3xl font-bold text-center text-gray-800 mb-6 md:mb-8">Login</h2>
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-lg">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="space-y-5">
            <div>
              <label className="block text-gray-700 text-lg font-bold mb-2">
                E-Mail oder Benutzername
              </label>
              <input
                type="text"
                className="w-full px-4 py-3 text-lg border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="admin oder ihre@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 text-lg font-bold mb-2">
                Passwort
              </label>
              <input
                type="password"
                className="w-full px-4 py-3 text-lg border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required
              />
            </div>
            <div className="text-right">
              <a
                href="/password-reset"
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Passwort vergessen?
              </a>
            </div>
            <button
              type="submit"
              className="w-full bg-yellow-500 text-gray-800 font-bold py-3 px-4 text-lg rounded hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 shadow"
            >
              Anmelden
            </button>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}