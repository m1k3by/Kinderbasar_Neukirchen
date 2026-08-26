import { prisma } from './prisma';
import { sendMail } from './mail';

export const MAIL_QUEUE_BATCH_SIZE = 20;
export const MAIL_QUEUE_MAX_ATTEMPTS = 5;

type QueuedMail = {
  id: string;
  to: string;
  subject: string;
  html: string;
  attachmentsJson: string | null;
  attempts: number;
};

function parseAttachments(json: string | null) {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as { filename?: string; path?: string }[];
  } catch {
    return undefined;
  }
}

/**
 * Sendet eine Zeile und schreibt das Ergebnis zurück. Fehler landen als attempts+1 mit
 * lastError, nicht als Ausnahme – der Aufrufer verarbeitet weiter. Erst nach
 * MAIL_QUEUE_MAX_ATTEMPTS wird die Zeile FAILED und damit nicht mehr automatisch wiederholt;
 * sie bleibt über GET /api/admin/mail-queue sichtbar, statt stillschweigend zu verschwinden.
 */
async function deliverRow(mail: QueuedMail): Promise<boolean> {
  try {
    await sendMail(mail.to, mail.subject, mail.html, parseAttachments(mail.attachmentsJson));
    await prisma.mailQueue.update({
      where: { id: mail.id },
      data: { status: 'SENT', sentAt: new Date(), lastError: null },
    });
    return true;
  } catch (error) {
    const attempts = mail.attempts + 1;
    const message = error instanceof Error ? error.message : String(error);
    await prisma.mailQueue.update({
      where: { id: mail.id },
      data: {
        attempts,
        status: attempts >= MAIL_QUEUE_MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
        lastError: message.substring(0, 1000),
      },
    });
    console.error('[MAIL-QUEUE] Send failed:', { id: mail.id, to: mail.to, attempts, error });
    return false;
  }
}

/**
 * Sendet genau die eine frisch eingereihte Zeile. Gedacht für `after()` direkt nach dem
 * Einreihen: die Antwort ist beim Aufruf schon raus, langsames SMTP verzögert also niemanden.
 *
 * Bewusst *eine* Zeile statt eines Stapels: zwei gleichzeitige Registrierungen würden sonst
 * denselben PENDING-Satz greifen und Mails doppelt verschicken. Jede Invocation kümmert sich
 * nur um ihre eigene Zeile; Liegengebliebenes räumt drainMailQueue() ab.
 *
 * Wirft nie – eine nicht zustellbare Mail darf keine bereits beantwortete Anfrage
 * nachträglich als Fehler erscheinen lassen.
 */
export async function deliverMail(id: string): Promise<void> {
  try {
    const mail = await prisma.mailQueue.findUnique({
      where: { id },
      select: { id: true, to: true, subject: true, html: true, attachmentsJson: true, attempts: true, status: true },
    });
    // Schon versendet (z. B. weil zwischenzeitlich ein Stapellauf lief)? Dann nichts tun.
    if (!mail || mail.status !== 'PENDING') return;
    await deliverRow(mail);
  } catch (error) {
    console.error('[MAIL-QUEUE] deliverMail failed:', { id, error });
  }
}

/**
 * Arbeitet einen Stapel ab: alles PENDING plus früher gescheiterte Zeilen, die ihre Versuche
 * noch nicht aufgebraucht haben. Ein Aufruf ist ein Wiederholungsdurchgang – der Abstand
 * zwischen den Aufrufen ist das Backoff.
 */
export async function drainMailQueue(): Promise<{ processed: number; sent: number; failed: number }> {
  const batch = await prisma.mailQueue.findMany({
    where: {
      OR: [
        { status: 'PENDING' },
        { status: 'FAILED', attempts: { lt: MAIL_QUEUE_MAX_ATTEMPTS } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: MAIL_QUEUE_BATCH_SIZE,
  });

  let sent = 0;
  let failed = 0;
  for (const mail of batch) {
    if (await deliverRow(mail)) sent++;
    else failed++;
  }

  return { processed: batch.length, sent, failed };
}
