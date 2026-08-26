import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/apiAuth';
import { drainMailQueue, MAIL_QUEUE_MAX_ATTEMPTS } from '../../../lib/mailQueue';

// POST /api/admin/mail-queue – drain a batch of queued mail (status PENDING, plus previously
// FAILED rows that haven't exhausted their attempts) and actually send it via SMTP.
//
// Die Einreih-Stellen rufen den Versand seit 26.08.2026 selbst an (`after()` →
// deliverMail, siehe app/lib/mailQueue.ts). Vorher gab es diesen Aufrufer *gar nicht*: kein
// Cron, kein Knopf. 36 Mails lagen zwischen dem 06.08. und dem 26.08. unversendet in der
// Tabelle, alle mit attempts=0 – SMTP hatte nie jemand kontaktiert.
//
// Dieser Stapellauf bleibt als Auffangnetz für Zeilen, deren Invocation vorher abbrach, und
// als Weg, einen Rückstand von Hand abzuarbeiten. Ein Aufruf ist ein Wiederholungsdurchgang;
// der Abstand zwischen den Aufrufen ist das Backoff.
export async function POST() {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    return NextResponse.json(await drainMailQueue());
  } catch (error) {
    console.error('POST /api/admin/mail-queue error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

// GET /api/admin/mail-queue – list recent terminally-failed mail (status FAILED, i.e. it
// exhausted MAIL_QUEUE_MAX_ATTEMPTS retries) so failures are visible to admins instead of being
// swallowed as they were when mail was sent synchronously and errors were only console.error'd.
export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const url = new URL(request.url);
    const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 200);

    const failures = await prisma.mailQueue.findMany({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, to: true, subject: true, attempts: true, lastError: true, createdAt: true, sentAt: true },
    });

    return NextResponse.json({ failures });
  } catch (error) {
    console.error('GET /api/admin/mail-queue error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
