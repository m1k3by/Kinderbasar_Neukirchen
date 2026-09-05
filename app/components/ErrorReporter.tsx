'use client';

import { useEffect } from 'react';

/**
 * Meldet Fehler aus dem Browser des Nutzers an /api/errors, damit sie unter /admin/logs
 * sichtbar werden. Serverfehler kommen von selbst dorthin (app/lib/errorLog.ts) – ein
 * Absturz im Browser dagegen war bisher komplett unsichtbar: die betroffene Person sieht
 * eine kaputte Seite, der Admin gar nichts.
 */

// Harte Obergrenze pro Seitenaufruf. Eine Render-Schleife wirft denselben Fehler sonst
// hunderte Male und macht die Adminsicht unlesbar – genau das, was sie verhindern soll.
const MAX_REPORTS_PER_PAGELOAD = 5;

const reported = new Set<string>();
let reportCount = 0;

export function reportClientError(message: string, stack?: string | null): void {
  // Ressourcenfehler (fehlgeschlagenes <img>/<script>) kommen ohne Meldung an und sagen nichts.
  if (!message || reportCount >= MAX_REPORTS_PER_PAGELOAD) return;

  const key = `${message}|${(stack ?? '').slice(0, 200)}`;
  if (reported.has(key)) return;
  reported.add(key);
  reportCount++;

  fetch('/api/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      stack: stack ?? null,
      route: typeof window !== 'undefined' ? window.location.pathname : null,
    }),
    // Die Seite ist gerade kaputt und wird womöglich sofort neu geladen; ohne keepalive
    // bricht der Browser die Meldung dabei ab.
    keepalive: true,
  }).catch(() => {});
}

/** Hängt sich global in `window` ein. Rendert nichts; eingebunden in app/layout.tsx. */
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportClientError(event.message, event.error?.stack);

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason;
      reportClientError(
        reason instanceof Error ? reason.message : `Unbehandelte Promise-Ablehnung: ${String(reason)}`,
        reason instanceof Error ? reason.stack : null
      );
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
