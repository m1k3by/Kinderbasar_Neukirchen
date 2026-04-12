'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';

interface Basar {
  id: string;
  title: string;
  eventDate: string;
  location?: string;
  maxArticlesPerSeller: number;
  commissionPercent: number;
  entryFee: number;
  status: 'DRAFT' | 'OPEN' | 'ACTIVE' | 'CLOSED';
  _count?: { basarSellers: number };
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Vorbereitung', OPEN: 'Anmeldung offen', ACTIVE: 'Läuft', CLOSED: 'Beendet',
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', OPEN: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-green-100 text-green-700', CLOSED: 'bg-gray-100 text-gray-500',
};

export default function SellerBasarsPage() {
  const router = useRouter();
  const [basars, setBasars] = useState<Basar[]>([]);
  const [loading, setLoading] = useState(true);
  const [sellerName, setSellerName] = useState('');
  const [sellerNumber, setSellerNumber] = useState(0);

  useEffect(() => {
    // Auth check
    const cookies = document.cookie.split(';');
    const sellerIdCookie = cookies.find(c => c.trim().startsWith('sellerId='));
    if (!sellerIdCookie) { router.push('/login'); return; }
    loadData();
  }, [router]);

  async function loadData() {
    setLoading(true);
    try {
      const [basarsRes, sellersRes] = await Promise.all([
        fetch('/api/basars'),
        fetch('/api/sellers'),
      ]);
      if (basarsRes.ok) {
        const data = await basarsRes.json();
        // Show only OPEN and ACTIVE basars – CLOSED basars are admin-only
        const relevant = (data.basars ?? []).filter((b: Basar) => b.status === 'OPEN' || b.status === 'ACTIVE');
        // Skip the list if there's exactly one active basar
        if (relevant.length === 1) {
          router.replace(`/seller/basars/${relevant[0].id}`);
          return;
        }
        setBasars(relevant);
      }
      if (sellersRes.ok) {
        const sellers = await sellersRes.json();
        const cookies = document.cookie.split(';');
        const sellerIdCookie = cookies.find(c => c.trim().startsWith('sellerId='));
        if (sellerIdCookie) {
          const id = parseInt(sellerIdCookie.split('=')[1], 10);
          const me = sellers.find((s: any) => s.sellerId === id);
          if (me) { setSellerName(`${me.firstName} ${me.lastName}`); setSellerNumber(me.sellerId); }
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        links={[
          { href: '/seller', label: 'Verkäuferbereich' },
          { href: '/seller/basars', label: 'Basare', active: true },
          { href: '/', label: 'Logout' },
        ]}
        sellerInfo={sellerName && sellerNumber ? { name: sellerName, sellerId: sellerNumber } : null}
      />
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Mein Basar</h1>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Laden…</div>
        ) : basars.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Aktuell sind keine Basare verfügbar.</div>
        ) : (
          <div className="space-y-4">
            {basars.map(basar => (
              <div key={basar.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[basar.status]}`}>
                        {STATUS_LABELS[basar.status]}
                      </span>
                      <h2 className="text-lg font-bold text-gray-800 truncate">{basar.title}</h2>
                    </div>
                    <p className="text-sm text-gray-500">
                      {new Date(basar.eventDate).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                      {basar.location && ` · ${basar.location}`}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Max. {basar.maxArticlesPerSeller} Artikel · {Number(basar.commissionPercent).toFixed(0)}% Provision
                      {Number(basar.entryFee) > 0 && ` · ${Number(basar.entryFee).toFixed(2)} € Gebühr`}
                    </p>
                  </div>
                  <Link
                    href={`/seller/basars/${basar.id}`}
                    className="flex-shrink-0 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold text-sm rounded-lg transition-colors"
                  >
                    {basar.status === 'OPEN' ? 'Artikel anlegen' : 'Verkäufe ansehen'}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
