'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';

export default function SellerPage() {
  const router = useRouter();
  const [sellerId, setSellerId] = useState('');
  const [sellerStatusActive, setSellerStatusActive] = useState(false);
  const [sellerName, setSellerName] = useState('');
  const [sellerNumber, setSellerNumber] = useState(0);
  const [loading, setLoading] = useState(true);
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
    if (sellerId) {
      loadSellerInfo();
    }
  }, [sellerId]);

  async function loadSellerInfo() {
    try {
      const res = await fetch(`/api/sellers`);
      if (res.ok) {
        const sellers = await res.json();
        const currentSeller = sellers.find((s: any) => s.id === sellerId);
        if (currentSeller) {
          setSellerStatusActive(currentSeller.sellerStatusActive || false);
          setSellerName(`${currentSeller.firstName} ${currentSeller.lastName}`);
          setSellerNumber(currentSeller.sellerId);
        }
      }
    } catch (error) {
      console.error('Error loading seller info:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleSellerStatus() {
    try {
      const res = await fetch('/api/sellers/seller-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId,
          sellerStatusActive: !sellerStatusActive,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSellerStatusActive(data.sellerStatusActive);
        setMessage(data.sellerStatusActive ? 'Status aktiviert!' : 'Status deaktiviert!');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Laden...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header 
        title="Verkäufer Dashboard"
        links={[{ href: '/', label: 'Logout' }]} 
        sellerInfo={{ name: sellerName, sellerId: sellerNumber }}
      />

      <main className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-6 text-center">Verkäuferstatus</h2>
          
          <div className="flex flex-col items-center justify-center space-y-6">
            <p className="text-lg text-center text-gray-700">
              Hier können Sie Ihren Verkäuferstatus aktivieren oder deaktivieren.
            </p>
            
            <button
              onClick={toggleSellerStatus}
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
      </main>
    </div>
  );
}
