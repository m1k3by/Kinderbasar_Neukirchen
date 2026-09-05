import { NextResponse } from 'next/server';
import { getAuth } from '../../lib/apiAuth';
import { rateLimit } from '../../lib/rateLimit';
import { recordError } from '../../lib/errorLog';

function getClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
}

/**
 * POST /api/errors – Fehlermeldung aus dem Browser eines Nutzers.
 *
 * Bewusst *nicht* im matcher von middleware.ts: ein Absturz auf /login oder /register trifft
 * gerade Nichtangemeldete, und genau die sieht man sonst nie. Angemeldete werden über
 * getAuth() erkannt – nur dadurch steht in der Adminsicht, *wem* etwas nicht geklappt hat.
 *
 * Antwortet immer schnell und ohne Inhalt: der Melder ist eine Seite, die ohnehin gerade
 * kaputt ist, und darf durch das Melden nicht zusätzlich hängen.
 */
export async function POST(request: Request) {
  try {
    // Der Endpunkt steht offen; ohne Begrenzung könnte eine Render-Schleife (oder jemand von
    // außen) die Tabelle fluten und die Adminsicht damit unbrauchbar machen.
    if (!(await rateLimit(`errors:ip:${getClientIp(request)}`, { maxRequests: 20, windowMs: 15 * 60 * 1000 }))) {
      return NextResponse.json({ error: 'Zu viele Meldungen' }, { status: 429 });
    }

    const body = await request.json();
    const { message, route, stack } = body ?? {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'message ist erforderlich' }, { status: 400 });
    }

    const auth = await getAuth();

    await recordError({
      source: 'CLIENT',
      message,
      route: typeof route === 'string' ? route : null,
      stack: typeof stack === 'string' ? stack : null,
      sellerId: auth?.sellerId ?? null,
      role: auth?.role ?? null,
      userAgent: request.headers.get('user-agent'),
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('POST /api/errors error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
