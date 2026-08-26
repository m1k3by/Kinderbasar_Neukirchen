import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { drainMailQueue, MAIL_QUEUE_BATCH_SIZE } from '../../../lib/mailQueue';

// Vercel bricht Funktionen sonst früher ab; Zustellung über SMTP ist langsam.
export const maxDuration = 60;

// Eigene Obergrenzen, damit ein Rückstand in einem Lauf abgearbeitet wird, der Lauf aber
// nicht in die Zeitgrenze der Funktion läuft.
const MAX_BATCHES = 5;
const DEADLINE_MS = 45_000;

/** Zeitkonstanter Vergleich – ein `===` auf ein Geheimnis verrät es über die Laufzeit. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * GET /api/cron/mail-queue – Auffangnetz für die Mail-Warteschlange, aufgerufen von Vercel
 * Cron (siehe vercel.json).
 *
 * Der Normalfall läuft nicht hierüber: die Einreih-Stellen stellen per `after()` unmittelbar
 * nach der Antwort selbst zu (app/lib/mailQueue.ts). Dieser Lauf fängt ab, was dabei
 * liegengeblieben ist – abgebrochene Invocations, vorübergehend nicht erreichbares SMTP – und
 * arbeitet Rückstände auf. Vom 06.08. bis 26.08.2026 gab es *gar keinen* Auslöser; 36 Mails
 * lagen unversendet in der Tabelle. Diese Route ist der zweite Riegel dagegen.
 *
 * Authentifizierung über CRON_SECRET statt Admin-Cookie: Vercel Cron schickt keinen Login mit,
 * sondern `Authorization: Bearer $CRON_SECRET`. Ist die Variable nicht gesetzt, antwortet die
 * Route mit 503 statt offen zu stehen – ein ungeschützter Endpunkt, der die Warteschlange
 * leert, wäre von außen als Mailversand missbrauchbar.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('GET /api/cron/mail-queue: CRON_SECRET ist nicht gesetzt');
    return NextResponse.json({ error: 'Cron ist nicht konfiguriert' }, { status: 503 });
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secretMatches(token, expected)) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  try {
    const started = Date.now();
    let processed = 0;
    let sent = 0;
    let failed = 0;

    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const result = await drainMailQueue();
      processed += result.processed;
      sent += result.sent;
      failed += result.failed;

      // Weniger als ein voller Stapel heißt: nichts mehr da. Ohne diese Bedingung liefe der
      // Lauf MAX_BATCHES mal gegen eine leere Warteschlange.
      if (result.processed < MAIL_QUEUE_BATCH_SIZE) break;
      if (Date.now() - started > DEADLINE_MS) break;
    }

    console.log('[CRON] mail-queue:', { processed, sent, failed });
    return NextResponse.json({ processed, sent, failed });
  } catch (error) {
    console.error('GET /api/cron/mail-queue error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
