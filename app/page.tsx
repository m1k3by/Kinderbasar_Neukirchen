import Link from 'next/link';
import { prisma } from './lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home() {
  const count = await prisma.seller.count();
  const max = parseInt(process.env.MAX_SELLERS || '200');

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
        <div className="grid md:grid-cols-2 gap-6">
          {/* Registration Options */}
          <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6 flex flex-col">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Registrierungen</h2>
            <p className="text-sm text-gray-600 mb-4">
              Aktuell belegte Plätze: <strong>{count}</strong> von <strong>{max}</strong>
            </p>
            <div className="mt-auto flex flex-col gap-3">
              <Link
                href="/register/seller"
                className="inline-flex items-center justify-center rounded-md bg-yellow-500 hover:bg-yellow-600 text-gray-800 px-4 py-3 text-sm font-medium transition-colors shadow"
              >
                Verkäufer Registrierung (A)
              </Link>
              <Link
                href="/register/employee"
                className="inline-flex items-center justify-center rounded-md bg-teal-700 hover:bg-teal-800 text-white px-4 py-3 text-sm font-medium transition-colors shadow"
              >
                Mitarbeiter registrieren (B)
              </Link>
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