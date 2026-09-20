import { requireAdmin } from '../../../lib/apiAuth';
import { backupChunks } from '../../../lib/backup';

/** Große Basare brauchen länger als die Standardlaufzeit; vgl. abrechnungen.pdf. */
export const maxDuration = 300;

/**
 * GET /api/admin/backup – vollständige Sicherung als JSON-Download.
 *
 * Enthält **alle** Tabellen einschließlich Passwort-Hashes, Reset-Token und der
 * Mailtexte aus `MailQueue`. Das ist beabsichtigt: eine Sicherung ohne diese Spalten
 * ließe sich nicht zurückspielen, die Konten wären nach einer Wiederherstellung tot.
 * Die Oberfläche weist deshalb an der Schaltfläche darauf hin, was in der Datei steht.
 *
 * Wird gestreamt, nicht am Stück gebaut – Begründung in app/lib/backup.ts.
 * Bricht die Erzeugung mittendrin ab, endet die Datei ohne das abschließende `}}` und
 * ist damit kein gültiges JSON mehr. Das Zurückspielen liest die Datei zuerst komplett
 * ein und scheitert an genau dieser Stelle: eine abgeschnittene Sicherung fällt auf,
 * statt sich als vollständige auszugeben.
 */
export async function GET() {
  const authResult = await requireAdmin();
  if (authResult.response) return authResult.response;

  const encoder = new TextEncoder();
  const chunks = backupChunks();

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (error) {
        console.error('GET /api/admin/backup error:', error);
        controller.error(error);
      }
    },
  });

  const today = new Date().toISOString().slice(0, 10);

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="kinderbasar-sicherung-${today}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
