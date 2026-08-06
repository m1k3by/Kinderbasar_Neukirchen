import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/apiAuth';
import { sendMail } from '../../../lib/mail';

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;

// POST /api/admin/mail-queue – drain a batch of queued mail (status PENDING, plus previously
// FAILED rows that haven't exhausted their attempts) and actually send it via SMTP.
//
// Registration (and going forward, other flows) enqueue mail into MailQueue instead of
// calling sendMail synchronously in the request path, so a slow/unavailable SMTP server can
// no longer block or time out a user-facing request. This route is the other half: it must be
// invoked periodically (by an external scheduler hitting it as an admin, or manually from an
// admin UI) to actually flush the queue. Each invocation is one retry pass – the caller's
// invocation interval is the backoff; a row keeps status=PENDING (so it's retried on the next
// pass) until it has failed MAX_ATTEMPTS times, at which point it's marked FAILED and stops
// being auto-retried, but stays visible via GET below instead of being silently dropped.
export async function POST() {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const batch = await prisma.mailQueue.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          { status: 'FAILED', attempts: { lt: MAX_ATTEMPTS } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    let sent = 0;
    let failed = 0;

    for (const mail of batch) {
      let attachments: { filename?: string; path?: string }[] | undefined;
      try {
        attachments = mail.attachmentsJson ? JSON.parse(mail.attachmentsJson) : undefined;
      } catch {
        attachments = undefined;
      }

      try {
        await sendMail(mail.to, mail.subject, mail.html, attachments);
        await prisma.mailQueue.update({
          where: { id: mail.id },
          data: { status: 'SENT', sentAt: new Date(), lastError: null },
        });
        sent++;
      } catch (error) {
        const attempts = mail.attempts + 1;
        const errorMessage = error instanceof Error ? error.message : String(error);
        await prisma.mailQueue.update({
          where: { id: mail.id },
          data: {
            attempts,
            status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
            lastError: errorMessage.substring(0, 1000),
          },
        });
        failed++;
        console.error('[MAIL-QUEUE] Send failed:', { id: mail.id, to: mail.to, attempts, error });
      }
    }

    return NextResponse.json({ processed: batch.length, sent, failed });
  } catch (error) {
    console.error('POST /api/admin/mail-queue error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

// GET /api/admin/mail-queue – list recent terminally-failed mail (status FAILED, i.e. it
// exhausted MAX_ATTEMPTS retries) so failures are visible to admins instead of being
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
