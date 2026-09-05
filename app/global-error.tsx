'use client';

import { useEffect } from 'react';
import './globals.css';
import { reportClientError } from './components/ErrorReporter';

/**
 * Fehlergrenze für Abstürze beim Rendern – die sieht der `error`-Listener in
 * ErrorReporter nicht, weil React sie selbst abfängt.
 *
 * Muss `<html>`/`<body>` selbst rendern: bei einem Absturz auf dieser Ebene ersetzt Next
 * das Root-Layout vollständig.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error.message, error.stack);
  }, [error]);

  return (
    <html lang="de">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Da ist etwas schiefgegangen</h1>
            <p className="text-gray-600 mb-6">
              Der Fehler wurde automatisch gemeldet. Versuche es bitte noch einmal – wenn es wieder
              passiert, melde dich beim Basar-Team.
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 rounded-md bg-yellow-500 text-gray-900 font-medium hover:bg-yellow-600 transition-colors"
            >
              Neu laden
            </button>
            {error.digest && <p className="mt-4 text-xs text-gray-400">Kennung: {error.digest}</p>}
          </div>
        </div>
      </body>
    </html>
  );
}
