// Fehler-Monitoring: schreibt Fehler in die Tabelle ErrorLog, sichtbar unter /admin/logs.
//
// Der Kern ist installErrorLogger(): `console.error` wird einmal zentral abgegriffen
// (aufgerufen aus instrumentation.ts). Damit sind die 93 bestehenden Aufrufe in app/api/**
// erfasst, ohne dass eine einzige davon angefasst werden musste – und jede künftige
// Fehlerstelle ebenfalls. Ein `logError()`-Helfer hätte 93 Änderungen bedeutet und beim
// 94. Aufruf schon wieder gefehlt.
import { prisma } from './prisma';
import { deliverMail } from './mailQueue';

/** Spaltenlängen aus prisma/schema.prisma. Zu lange Werte werden gekürzt, nicht verworfen. */
const MAX_LENGTH = { route: 200, message: 500, stack: 4000, userAgent: 300 } as const;

const ALERT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Referenz auf die *unersetzte* Ausgabe. Alles, was innerhalb des Loggers selbst schiefgeht,
 * geht ausschließlich hierüber – ein `console.error` im Logger wäre eine Endlosschleife.
 */
const originalConsoleError: typeof console.error = console.error.bind(console);

export interface RecordErrorInput {
  source: 'SERVER' | 'CLIENT';
  message: string;
  route?: string | null;
  stack?: string | null;
  sellerId?: number | null;
  role?: string | null;
  userAgent?: string | null;
}

function clip(value: string | null | undefined, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * Verschickt höchstens eine Alarm-Mail pro Stunde – über die bestehende MailQueue, nicht über
 * einen zweiten Mailweg. Ohne ADMIN_ALERT_EMAIL passiert nichts; das Protokollieren selbst
 * läuft davon unabhängig weiter.
 *
 * Das `alerted`-Kennzeichen wird gesetzt, *bevor* die Mail eingereiht wird: andersherum
 * würde ein Fehler beim Einreihen die Drosselung offen lassen.
 *
 * ponytail: Drosselung über die Tabelle statt über eine Sperre – zwei Instanzen gleichzeitig
 * können 2 Mails pro Stunde erzeugen. Reicht; ein Redis-Lock erst, wenn das je stört.
 */
async function maybeAlert(id: string, input: RecordErrorInput): Promise<void> {
  // Bewusst direkt aus process.env und nicht über app/lib/env.ts: dieses Modul wird aus
  // instrumentation.ts beim Start geladen, und env.ts wirft beim Import, wenn JWT_SECRET
  // oder ADMIN_PASS fehlen. Das würde den Serverstart abbrechen statt die erste Anfrage.
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!to) return;

  const recentAlerts = await prisma.errorLog.count({
    where: { alerted: true, createdAt: { gte: new Date(Date.now() - ALERT_WINDOW_MS) } },
  });
  if (recentAlerts > 0) return;

  await prisma.errorLog.update({ where: { id }, data: { alerted: true } });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  const where = input.source === 'CLIENT' ? 'im Browser eines Nutzers' : 'auf dem Server';
  const mail = await prisma.mailQueue.create({
    data: {
      to,
      subject: 'Kinderbasar: Fehler aufgetreten',
      html: [
        `<p>Es ist ein Fehler ${where} aufgetreten.</p>`,
        input.route ? `<p><strong>Stelle:</strong> ${input.route}</p>` : '',
        `<p><strong>Meldung:</strong> ${input.message}</p>`,
        input.sellerId ? `<p><strong>Verkäufer-Nr.:</strong> ${input.sellerId}</p>` : '',
        `<p><a href="${baseUrl}/admin/logs">Alle Fehler ansehen</a></p>`,
        '<p style="color:#666;font-size:12px">Weitere Fehler in der nächsten Stunde lösen keine zusätzliche Mail aus.</p>',
      ].join(''),
    },
  });

  await deliverMail(mail.id);
}

/**
 * Anzahl gerade laufender Schreibvorgänge. Solange > 0, meldet der abgegriffene
 * `console.error` nichts weiter – sonst würde ein Fehler *innerhalb* des Loggers (Prisma,
 * SMTP über deliverMail) den Logger erneut auslösen.
 *
 * ponytail: dadurch geht ein echter, zeitgleicher Fehler in genau diesem Fenster verloren.
 * Er steht weiterhin im Vercel-Log. Sauber wäre AsyncLocalStorage – dafür ist der Gewinn zu klein.
 */
let writing = 0;

/** Schreibt eine Zeile. Wirft nie – ein Protokoll darf keine Anfrage scheitern lassen. */
export async function recordError(input: RecordErrorInput): Promise<void> {
  const message = clip(input.message, MAX_LENGTH.message);
  if (!message) return;

  writing++;
  try {
    const row = await prisma.errorLog.create({
      data: {
        source: input.source,
        route: clip(input.route, MAX_LENGTH.route),
        message,
        stack: clip(input.stack, MAX_LENGTH.stack),
        sellerId: input.sellerId ?? null,
        role: clip(input.role, 50),
        userAgent: clip(input.userAgent, MAX_LENGTH.userAgent),
      },
      select: { id: true },
    });
    await maybeAlert(row.id, { ...input, message });
  } catch (error) {
    originalConsoleError('[ERRORLOG] Fehler konnte nicht gespeichert werden:', error);
  } finally {
    writing--;
  }
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value === null || value === undefined) return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Konvention in app/api/**: `console.error('GET /api/basars error:', error)`. Alles vor dem
 * ersten Doppelpunkt ist die Fundstelle, ein `Error` in den Argumenten liefert den Stack.
 * Aufrufe, die sich nicht daran halten, verlieren nur die Fundstelle – die Meldung nicht.
 */
export function parseConsoleErrorArgs(args: unknown[]): Omit<RecordErrorInput, 'source'> {
  const first = typeof args[0] === 'string' ? args[0] : '';
  const colon = first.indexOf(':');
  const route = colon > 0 ? first.slice(0, colon).replace(/\s+error$/i, '').trim() : null;
  const error = args.find((a): a is Error => a instanceof Error);

  return {
    route: route || null,
    message: args.map(stringify).join(' ').trim(),
    stack: error?.stack ?? null,
  };
}

let installed = false;

/**
 * Ersetzt `console.error` global. Das Original wird immer zuerst aufgerufen – das Vercel-Log
 * bleibt vollständig, diese Tabelle ist ein zweiter Ort, kein Ersatz.
 */
export function installErrorLogger(): void {
  if (installed) return;
  installed = true;

  console.error = (...args: unknown[]) => {
    originalConsoleError(...args);

    // Prisma protokolliert eigene Warnungen über console.error; würden die erfasst, meldete
    // jeder Datenbankhänger sich selbst.
    if (writing > 0 || (typeof args[0] === 'string' && args[0].startsWith('prisma:'))) return;

    // ponytail: bewusst ohne `await` – die Antwort soll nicht auf die Datenbank warten.
    // Bricht die Serverless-Instanz unmittelbar danach ab, fehlt die Zeile; der Fehler steht
    // dann immer noch im Vercel-Log.
    recordError({ source: 'SERVER', ...parseConsoleErrorArgs(args) }).catch(() => {});
  };
}
