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
  // Helper function to determine if a date is in DST (Daylight Saving Time) for Europe/Berlin
  // MESZ (Sommerzeit): Last Sunday in March 2:00 to Last Sunday in October 3:00
  // MEZ (Winterzeit): Rest of the year
  const isDST = (date: Date): boolean => {
    const year = date.getFullYear();
    
    // Find last Sunday in March
    const marchLastDay = new Date(Date.UTC(year, 2, 31, 1, 0, 0)); // March 31 at 01:00 UTC (= 02:00 MEZ)
    const marchLastSunday = new Date(marchLastDay);
    marchLastSunday.setUTCDate(31 - ((marchLastDay.getUTCDay() || 7) - 1));
    
    // Find last Sunday in October
    const octoberLastDay = new Date(Date.UTC(year, 9, 31, 1, 0, 0)); // October 31 at 01:00 UTC (= 02:00 MESZ)
    const octoberLastSunday = new Date(octoberLastDay);
    octoberLastSunday.setUTCDate(31 - ((octoberLastDay.getUTCDay() || 7) - 1));
    
    return date >= marchLastSunday && date < octoberLastSunday;
  };

  // Helper function to parse datetime string as Europe/Berlin timezone
  const parseAsGermanTime = (dateTimeStr: string): Date => {
    if (!dateTimeStr.includes('T')) {
      dateTimeStr = dateTimeStr + 'T00:00:00';
    }
    
    // If already has timezone, use it
    if (dateTimeStr.includes('+') || dateTimeStr.includes('Z')) {
      return new Date(dateTimeStr);
    }
    
    // Parse without timezone first to get the date for DST check
    const parts = dateTimeStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!parts) return new Date(dateTimeStr);
    
    const [, year, month, day, hour, minute] = parts;
    // Create a date in UTC to check DST
    const testDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute)));
    
    // Determine offset: +01:00 (MEZ/Winter) or +02:00 (MESZ/Summer)
    const offset = isDST(testDate) ? '+02:00' : '+01:00';
    
    return new Date(dateTimeStr + offset);
  };

  const now = new Date();

  const isSellerRegistrationOpen = (() => {
    if (!settingsObj.registration_seller_start || !settingsObj.registration_seller_end) return true;
    
    const start = parseAsGermanTime(settingsObj.registration_seller_start);
    const end = parseAsGermanTime(settingsObj.registration_seller_end);
    return now >= start && now <= end;
  })();

  const isEmployeeRegistrationOpen = (() => {
    if (!settingsObj.registration_employee_start || !settingsObj.registration_employee_end) return true;
    
    const start = parseAsGermanTime(settingsObj.registration_employee_start);
    const end = parseAsGermanTime(settingsObj.registration_employee_end);
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