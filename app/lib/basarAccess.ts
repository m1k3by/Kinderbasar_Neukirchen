import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import type { TokenPayload } from './apiAuth';

/**
 * Wer darf welchen Basar sehen? Die eine Regel für Testbasare (Basar.isTest).
 *
 *  - Normaler Basar: alle, wie bisher. Für ihn ändert diese Datei *nichts* – jede Prüfung
 *    hier ist für isTest=false sofort „ja".
 *  - Testbasar: nur der Admin und ausdrücklich Eingeladene (BasarInvite). Für alle anderen
 *    existiert er nicht – auch nicht als 403, sondern als 404, damit nicht einmal sichtbar
 *    wird, dass es ihn gibt.
 *
 * Wer eine neue Route unter app/api/basars/[id] anlegt, die Nicht-Admins erreichen, ruft
 * requireBasarAccess() auf. __tests__/lib/basarAccess.test.ts prüft das für jede Route und
 * wird rot, wenn eine fehlt – eine vergessene Stelle hieße: Testbasar doch sichtbar.
 */

/**
 * Prisma-`where` für Basar-Listen. `null` = nicht angemeldet (öffentliche Startseite).
 * Der Admin sieht alles, sonst: jeder normale Basar plus die Testbasare, in die man
 * eingeladen ist.
 */
export function visibleBasarWhere(auth: Pick<TokenPayload, 'role' | 'sellerId'> | null) {
  if (auth?.role === 'admin') return {};
  if (!auth?.sellerId) return { isTest: false };
  return {
    OR: [
      { isTest: false },
      { invites: { some: { sellerId: auth.sellerId } } },
    ],
  };
}

/**
 * Für Routen, die Nicht-Admins erreichen: `null` heißt „darf", sonst eine fertige
 * 404-Antwort zum Zurückgeben.
 *
 * Existiert der Basar gar nicht, gibt die Funktion ebenfalls `null` zurück: dann antwortet
 * die Route wie bisher selbst (meist ebenfalls 404). So bleibt das Verhalten jeder Route für
 * alles außer Testbasaren unverändert.
 *
 * Hat die Route den Basar schon geladen, übergibt sie ihn statt der ID – dann entfällt die
 * zweite Abfrage. Sie muss dann aber *vor* dem Ausliefern prüfen, nicht danach.
 */
export async function requireBasarAccess(
  auth: Pick<TokenPayload, 'role' | 'sellerId'>,
  basarOrId: string | { id: string; isTest: boolean }
): Promise<NextResponse | null> {
  if (auth.role === 'admin') return null;

  const basarId = typeof basarOrId === 'string' ? basarOrId : basarOrId.id;
  const basar = typeof basarOrId === 'string'
    ? await prisma.basar.findUnique({ where: { id: basarId }, select: { isTest: true } })
    : basarOrId;
  if (!basar?.isTest) return null;

  if (auth.sellerId) {
    const invite = await prisma.basarInvite.findUnique({
      where: { basarId_sellerId: { basarId, sellerId: auth.sellerId } },
      select: { sellerId: true },
    });
    if (invite) return null;
  }

  return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });
}
