import { NextResponse } from 'next/server';

/**
 * POST /api/logout – beendet die Sitzung.
 *
 * Bis zum 06.09.2026 gab es diese Route nicht: der "Logout"-Eintrag in der Navigation war
 * ein gewöhnlicher Link auf `/` (app/lib/navLinks.ts). Das Cookie blieb dabei unangetastet
 * und volle 24 Stunden gültig – wer auf dem Kassenrechner "Logout" drückte, war weiterhin
 * angemeldet, ein Klick auf "Verkäuferbereich" genügte. Die Startseite sah nur deshalb nach
 * Abmeldung aus, weil sie als öffentliche Seite ausschließlich "Login" anbietet.
 *
 * Bewusst POST und nicht GET: eine GET-Route hinter einem <Link> würde Next.js beim
 * Überfahren vorladen (Prefetch) und die Sitzung ungefragt beenden.
 *
 * Die Cookie-Optionen müssen die aus app/api/login/route.ts spiegeln – Name allein genügt
 * nicht, ein abweichender `path` löscht ein anderes Cookie als das gesetzte.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
