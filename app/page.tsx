import Link from 'next/link';
import { prisma } from './lib/prisma';
import { isRegistrationOpen } from './lib/basarWindows';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatDay(value: Date | null) {
  if (!value) return null;
  return value.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  });
}

export default async function Home() {
  // Entwürfe sind noch nicht öffentlich, geschlossene und archivierte Basare
  // nehmen keine Anmeldungen mehr an.
  const basars = await prisma.basar.findMany({
    where: { isArchived: false, status: { in: ['OPEN', 'ACTIVE'] } },
    orderBy: { eventDate: 'asc' },
    include: {
      _count: { select: { basarSellers: { where: { isActive: true } } } },
    },
  });

  const now = new Date();

  const cards = basars.map(basar => ({
    basar,
    days: [
      formatDay(basar.dateFriday),
      formatDay(basar.dateSaturday),
      formatDay(basar.dateSunday),
    ].filter((d): d is string => d !== null),
    activeSellers: basar._count.basarSellers,
    isFull: basar._count.basarSellers >= basar.maxSellers,
    sellerOpen: isRegistrationOpen(basar, false, now),
    employeeOpen: isRegistrationOpen(basar, true, now),
  }));

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
        {cards.length === 0 ? (
          <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-8 text-center">
            <p className="text-lg font-semibold text-gray-800">Aktuell ist kein Basar geöffnet</p>
            <p className="mt-2 text-sm text-gray-600">
              Sobald der nächste Basar ansteht, erscheint er hier mit den Anmeldezeiten.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {cards.map(({ basar, days, activeSellers, isFull, sellerOpen, employeeOpen }) => (
              <div key={basar.id} className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6">
                <div className="md:flex md:items-start md:justify-between md:gap-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-800">{basar.title}</h2>
                    {basar.location && (
                      <p className="text-sm text-gray-600 mt-0.5">{basar.location}</p>
                    )}
                    {basar.description && (
                      <p className="text-sm text-gray-700 mt-2">{basar.description}</p>
                    )}
                    {days.length > 0 && (
                      <ul className="mt-3 space-y-0.5 text-sm text-gray-700">
                        {days.map(day => (
                          <li key={day}>{day}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-4 md:mt-0 md:w-72 flex-shrink-0 flex flex-col gap-3">
                    <p className="text-sm text-gray-600">
                      Angemeldete Verkäufer: <strong>{activeSellers}</strong> von <strong>{basar.maxSellers}</strong>
                    </p>

                    {isFull ? (
                      <div className="bg-red-100 border-2 border-red-600 text-red-900 px-4 py-3 rounded-md text-sm text-center">
                        <strong>Dieser Basar ist ausgebucht.</strong>
                        <div className="mt-1">Keine weiteren Anmeldungen möglich.</div>
                      </div>
                    ) : (
                      <>
                        {sellerOpen && (
                          <Link
                            href={{ pathname: '/register/seller', query: { basarId: basar.id, basarTitle: basar.title } }}
                            className="inline-flex items-center justify-center rounded-md bg-yellow-500 hover:bg-yellow-600 text-gray-800 px-4 py-3 text-sm font-medium transition-colors shadow"
                          >
                            Verkäufer Registrierung (A)
                          </Link>
                        )}
                        {employeeOpen && (
                          <Link
                            href={{ pathname: '/register/employee', query: { basarId: basar.id, basarTitle: basar.title } }}
                            className="inline-flex items-center justify-center rounded-md bg-teal-700 hover:bg-teal-800 text-white px-4 py-3 text-sm font-medium transition-colors shadow"
                          >
                            Mitarbeiter registrieren (B)
                          </Link>
                        )}
                        {!sellerOpen && !employeeOpen && (
                          <div className="bg-gray-100 border border-gray-300 text-gray-600 px-4 py-3 rounded-md text-sm text-center">
                            Registrierungen für diesen Basar sind aktuell geschlossen
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Information */}
        <div className="mt-6 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6">
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
            <div className="pt-3 mt-3 border-t border-gray-300">
              Wer bereits ein Konto hat, meldet seine Teilnahme nach dem{' '}
              <Link href="/login" className="text-blue-700 hover:underline">Login</Link>{' '}
              direkt beim gewünschten Basar an.
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}