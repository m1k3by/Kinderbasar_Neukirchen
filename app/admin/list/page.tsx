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
  createdAt: string;
  taskSignups?: any[];
  cakes?: any[];
  qrCode?: string;
  barcode?: string;
}

export default function AdminListPage() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [filter, setFilter] = useState<'all' | 'seller' | 'employee'>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSellers();
  }, []);

  async function loadSellers() {
    try {
      const res = await fetch('/api/sellers');
      if (res.ok) {
        const sellersData = await res.json();
        setSellers(sellersData);
      }
    } catch (error) {
      console.error('Error loading sellers:', error);
    } finally {
      setLoading(false);
    }
  }

  function copyEmails() {
    const emails = filteredSellers.map(s => s.email).join(', ');
    navigator.clipboard.writeText(emails);
    alert('E-Mails kopiert!');
  }

  const filteredSellers = sellers.filter(s => {
    // Filter by role
    if (filter === 'seller' && s.isEmployee) return false;
    if (filter === 'employee' && !s.isEmployee) return false;
    
    // Filter by active status
    if (activeFilter !== 'all') {
      const hasActivity = (s.taskSignups?.length || 0) > 0 || (s.cakes?.length || 0) > 0;
      if (activeFilter === 'active' && !hasActivity) return false;
      if (activeFilter === 'inactive' && hasActivity) return false;
    }
    
    return true;
  });

  function getActiveStatus(seller: Seller) {
    // Mitarbeiter sind nur aktiv wenn sie Tasks oder Kuchen haben
    const hasActivity = (seller.taskSignups?.length || 0) > 0 || (seller.cakes?.length || 0) > 0;
    
    if (seller.isEmployee) {
      // Mitarbeiter: zeige "Aktiv" oder "Inaktiv"
      return hasActivity ? 'Aktiv' : 'Inaktiv';
    } else {
      // Verkäufer: immer "–" (weder aktiv noch inaktiv)
      return '–';
    }
  }

  function getActiveClass(seller: Seller) {
    const status = getActiveStatus(seller);
    if (status === 'Aktiv') return 'bg-green-100 text-green-800';
    if (status === 'Inaktiv') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-500';
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-yellow-500 text-gray-800 p-4 shadow-md">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold hover:underline">
            Kinderbasar Neukirchen
          </Link>
          <nav className="flex gap-4">
            <Link href="/admin" className="hover:underline">
              Basarliste
            </Link>
            <Link href="/admin/list" className="hover:underline font-bold">
              Helferliste
            </Link>
            <Link href="/admin/tasks" className="hover:underline">
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

      <div className="max-w-7xl mx-auto p-8">
        <div className="mb-6 flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Rolle</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Alle</option>
              <option value="seller">Verkäufer</option>
              <option value="employee">Mitarbeiter</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Aktiv</label>
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as any)}
              className="p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Alle</option>
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </select>
          </div>

          <div className="ml-auto">
            <button
              onClick={copyEmails}
              className="bg-yellow-500 hover:bg-yellow-600 text-gray-800 px-4 py-2 rounded font-medium shadow"
            >
              E-Mails kopieren
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">Lädt...</div>
        ) : (
          <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nummer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    QR Code
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Barcode
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rolle
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aktiv
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    E-Mail
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Registriert
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSellers.length > 0 ? (
                  filteredSellers.map((seller, idx) => (
                    <tr key={seller.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900">
                        {seller.sellerId}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {seller.qrCode ? (
                          <img 
                            src={seller.qrCode} 
                            alt="QR Code" 
                            className="w-16 h-16 cursor-pointer hover:scale-150 transition-transform"
                            onClick={() => window.open(seller.qrCode, '_blank')}
                          />
                        ) : (
                          <span className="text-gray-400">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {seller.barcode ? (
                          <img 
                            src={seller.barcode} 
                            alt="Barcode" 
                            className="h-10 cursor-pointer hover:scale-150 transition-transform"
                            onClick={() => window.open(seller.barcode, '_blank')}
                          />
                        ) : (
                          <span className="text-gray-400">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span
                          className={`px-2 py-1 rounded ${
                            seller.isEmployee
                              ? 'bg-green-100 text-green-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {seller.isEmployee ? 'M' : 'V'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded ${getActiveClass(seller)}`}>
                          {getActiveStatus(seller)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {seller.firstName} {seller.lastName}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {seller.email}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {new Date(seller.createdAt).toLocaleDateString('de-DE')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      Keine Einträge gefunden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 text-sm text-gray-600">
          Gesamt: {filteredSellers.length} {filter === 'seller' ? 'Verkäufer' : filter === 'employee' ? 'Mitarbeiter' : 'Einträge'}
        </div>
      </div>
    </div>
  );
}
