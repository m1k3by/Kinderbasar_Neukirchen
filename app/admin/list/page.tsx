'use client';

import { useState, useEffect } from 'react';
import Header from '../../components/Header';

interface Seller {
  id: string;
  sellerId: number;
  sellerStatusActive?: boolean;
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
  const [message, setMessage] = useState('');
  const [showResetConfirm1, setShowResetConfirm1] = useState(false);
  const [showResetConfirm2, setShowResetConfirm2] = useState(false);

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

  async function toggleEmployeeStatus(sellerId: number) {
    try {
      const res = await fetch('/api/admin/toggle-employee-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessage(data.message);
        setTimeout(() => setMessage(''), 3000);
        loadSellers(); // Reload list
      } else {
        const data = await res.json();
        setMessage('Fehler: ' + (data.error || 'Unbekannter Fehler'));
        setTimeout(() => setMessage(''), 5000);
      }
    } catch (error) {
      console.error('Error toggling employee status:', error);
      setMessage('Fehler beim Ändern der Rolle');
      setTimeout(() => setMessage(''), 5000);
    }
  }

  async function toggleSellerStatus(sellerId: number) {
    try {
      const res = await fetch('/api/admin/toggle-seller-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessage(data.message);
        setTimeout(() => setMessage(''), 3000);
        loadSellers(); // Reload list
      } else {
        const data = await res.json();
        setMessage('Fehler: ' + (data.error || 'Unbekannter Fehler'));
        setTimeout(() => setMessage(''), 5000);
      }
    } catch (error) {
      console.error('Error toggling seller status:', error);
      setMessage('Fehler beim Ändern des Verkäufer Status');
      setTimeout(() => setMessage(''), 5000);
    }
  }

  async function handleGlobalReset() {
    try {
      const res = await fetch('/api/admin/reset-seller-status', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        setShowResetConfirm1(false);
        setShowResetConfirm2(false);
        setTimeout(() => setMessage(''), 5000);
        loadSellers();
      } else {
        setMessage('Fehler: ' + data.error);
        setTimeout(() => setMessage(''), 5000);
      }
    } catch (err) {
      setMessage('Ein Fehler ist aufgetreten.');
      setTimeout(() => setMessage(''), 5000);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header 
        links={[
          { href: '/admin', label: 'Basarliste' },
          { href: '/admin/list', label: 'Helferliste', active: true },
          { href: '/admin/tasks', label: 'Aufgaben' },
          { href: '/admin/settings', label: 'Datum einstellen' },
          { href: '/', label: 'Logout' },
        ]}
      />

      <div className="max-w-7xl mx-auto p-8">
        {message && (
          <div className="mb-4 p-4 bg-blue-100 text-blue-800 rounded-lg font-medium">
            {message}
          </div>
        )}
        
        {/* Global Actions */}
        <div className="mb-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Globale Aktionen</h2>
          
          <div className="flex flex-col items-start space-y-4">
            <p className="text-gray-600">
              Setzen Sie den Status aller Verkäufer (inkl. Mitarbeiter) auf "Inaktiv".
            </p>
            
            <button
              onClick={() => setShowResetConfirm1(true)}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            >
              Alle Verkäufer Status zurücksetzen
            </button>
          </div>
        </div>

        {/* Confirmation Modal 1 */}
        {showResetConfirm1 && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
              <h3 className="text-xl font-bold mb-4">Wirklich?</h3>
              <p className="mb-6">Möchten Sie wirklich alle Verkäufer Status auf inaktiv setzen?</p>
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
            <table className="min-w-full table-fixed">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="w-16 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Nr
                  </th>
                  <th className="w-12 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    QR
                  </th>
                  <th className="w-16 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Rolle
                  </th>
                  <th className="w-20 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Verkäufer Status
                  </th>
                  <th className="w-20 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Aktiv (in eine Liste eingetragen?)
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    E-Mail
                  </th>
                  <th className="w-32 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSellers.length > 0 ? (
                  filteredSellers.map((seller, idx) => (
                    <tr key={seller.id} className="hover:bg-gray-50">
                      <td className="px-2 py-2 whitespace-nowrap text-sm font-mono text-gray-900">
                        {seller.sellerId}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm">
                        {seller.qrCode ? (
                          <img 
                            src={seller.qrCode} 
                            alt="QR" 
                            className="w-10 h-10 cursor-pointer hover:scale-150 transition-transform"
                            onClick={() => window.open(seller.qrCode, '_blank')}
                          />
                        ) : (
                          <span className="text-gray-400">–</span>
                        )}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm">
                        <span
                          className={`px-2 py-1 text-xs rounded font-medium ${
                            seller.isEmployee
                              ? 'bg-green-100 text-green-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {seller.isEmployee ? 'M' : 'V'}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm">
                        {typeof seller.sellerStatusActive === 'boolean' ? (
                          <span className={`px-2 py-1 text-xs rounded font-medium ${seller.sellerStatusActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {seller.sellerStatusActive ? '✓' : '✗'}
                          </span>
                        ) : (
                          <span className="text-gray-400">–</span>
                        )}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 text-xs rounded font-medium ${getActiveClass(seller)}`}>
                          {getActiveStatus(seller)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-900 truncate">
                        {seller.firstName} {seller.lastName}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600 truncate">
                        {seller.email}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm">
                        <div className="flex gap-1">
                          <button
                            onClick={() => toggleEmployeeStatus(seller.sellerId)}
                            className="px-2 py-1 bg-yellow-500 hover:bg-yellow-600 text-gray-800 rounded text-xs font-medium transition-colors"
                            title={seller.isEmployee ? 'Zu Verkäufer machen' : 'Zu Mitarbeiter machen'}
                          >
                            {seller.isEmployee ? '→V' : '→M'}
                          </button>
                          {!seller.isEmployee && (
                            <button
                              onClick={() => toggleSellerStatus(seller.sellerId)}
                              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                seller.sellerStatusActive
                                  ? 'bg-red-500 hover:bg-red-600 text-white'
                                  : 'bg-green-500 hover:bg-green-600 text-white'
                              }`}
                              title={seller.sellerStatusActive ? 'Status deaktivieren' : 'Status aktivieren'}
                            >
                              {seller.sellerStatusActive ? 'Deakt' : 'Akt'}
                            </button>
                          )}
                        </div>
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
