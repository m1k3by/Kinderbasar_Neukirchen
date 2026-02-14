import Link from 'next/link';
import { prisma } from './lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home() {
  const activeSellerCount = await prisma.seller.count({
    where: {
      sellerStatusActive: true
    }
  });
  const max = parseInt(process.env.MAX_SELLERS || '200');
  const isCapacityFull = activeSellerCount >= max;

  // Fetch basar dates from settings
  const settings = await prisma.settings.findMany();
  const settingsObj: Record<string, string> = {};
  settings.forEach(s => {
    settingsObj[s.key] = s.value;
  });

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString + 'T00:00:00');
      return date.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return null;
    }
  };

  const freitagDate = formatDate(settingsObj.date_freitag);
  const samstagDate = formatDate(settingsObj.date_samstag);
  const sonntagDate = formatDate(settingsObj.date_sonntag);

  const hasAnyDate = freitagDate || samstagDate || sonntagDate;

  // Check registration periods
  const now = new Date();

  const isSellerRegistrationOpen = (() => {
    if (!settingsObj.registration_seller_start || !settingsObj.registration_seller_end) return true;
    
    // Handle both datetime-local (with time) and old date-only formats
    const startStr = settingsObj.registration_seller_start.includes('T') 
      ? settingsObj.registration_seller_start 
      : settingsObj.registration_seller_start + 'T00:00:00';
    const endStr = settingsObj.registration_seller_end.includes('T')
      ? settingsObj.registration_seller_end
      : settingsObj.registration_seller_end + 'T23:59:59';
    
    const start = new Date(startStr);
    const end = new Date(endStr);
    return now >= start && now <= end;
  })();

  const isEmployeeRegistrationOpen = (() => {
    if (!settingsObj.registration_employee_start || !settingsObj.registration_employee_end) return true;
    
    // Handle both datetime-local (with time) and old date-only formats
    const startStr = settingsObj.registration_employee_start.includes('T')
      ? settingsObj.registration_employee_start
      : settingsObj.registration_employee_start + 'T00:00:00';
    const endStr = settingsObj.registration_employee_end.includes('T')
      ? settingsObj.registration_employee_end
      : settingsObj.registration_employee_end + 'T23:59:59';
    
    const start = new Date(startStr);
    const end = new Date(endStr);
    return now >= start && now <= end;
  })();

  return (
    <div className="basar-background">
      <div className="basar-content">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-yellow-500 text-gray-800 p-4 shadow-md">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <Link href="/" className="text-2xl font-bold hover:underline">
              Kinderbasar Neukirchen - Registration
            </Link>
            <nav className="flex gap-4">
              <Link href="/login" className="hover:underline font-semibold">
                Login
              </Link>
            </nav>
          </div>
        </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-8">
        {/* Full Capacity Warning */}
        {isCapacityFull && (
          <div className="mb-6 bg-red-100 border-2 border-red-600 text-red-900 px-6 py-4 rounded-lg text-center">
            <p className="text-xl font-bold">⚠️ Die maximale Anzahl von aktiven Verkäufern ist erreicht</p>
            <p className="mt-2">Keine weiteren Anmeldungen mehr möglich.</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Registration Options */}
          <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6 flex flex-col">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Registrierungen</h2>
            <p className="text-sm text-gray-600 mb-4">
              Aktuell aktive Verkäufer: <strong>{activeSellerCount}</strong> von <strong>{max}</strong>
            </p>
            <div className="mt-auto flex flex-col gap-3">
              {isSellerRegistrationOpen && (
                <Link
                  href="/register/seller"
                  className="inline-flex items-center justify-center rounded-md bg-yellow-500 hover:bg-yellow-600 text-gray-800 px-4 py-3 text-sm font-medium transition-colors shadow"
                >
                  Verkäufer Registrierung (A)
                </Link>
              )}
              {isEmployeeRegistrationOpen && (
                <Link
                  href="/register/employee"
                  className="inline-flex items-center justify-center rounded-md bg-teal-700 hover:bg-teal-800 text-white px-4 py-3 text-sm font-medium transition-colors shadow"
                >
                  Mitarbeiter registrieren (B)
                </Link>
              )}
              {!isSellerRegistrationOpen && !isEmployeeRegistrationOpen && (
                <div className="bg-gray-100 border border-gray-300 text-gray-600 px-4 py-3 rounded-md text-sm text-center">
                  Registrierungen sind aktuell geschlossen
                </div>
              )}
            </div>
          </div>
          
          {/* Information */}
          <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-3">Hinweise</h2>
            <div className="mt-3 space-y-4 text-sm text-gray-700">
              <div>
                <strong>A:</strong> Für alle, die sich nur als Verkäufer registrieren wollen. 
                Nach Anlage wird eine E-Mail mit Verkäufer-ID an die angegebene E-Mail Adresse versendet.
              </div>
              <div>
                <strong>B:</strong> Für alle die sich aktiv am Basar beteiligen wollen 
                (Vorsortieren, Kuchenverkauf etc.). Es wird auch direkt eine Verkäufer-ID erstellt. 
                Alle Info wie Login werden ebenfalls per E-Mail an die angegebene E-Mail Adresse versendet.
              </div>
              {hasAnyDate && sonntagDate && (
                <div className="pt-3 mt-3 border-t border-gray-300">
                  <div><strong>Basartag Sonntag:</strong> {sonntagDate.split(',')[1]?.trim()}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}