import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireAdmin } from '../../lib/apiAuth';

const VALID_RESULT_TYPES = ['answer', 'suggestions', 'none'] as const;
type ResultType = (typeof VALID_RESULT_TYPES)[number];

function isValidResultType(value: unknown): value is ResultType {
  return typeof value === 'string' && (VALID_RESULT_TYPES as readonly string[]).includes(value);
}

// POST /api/chat-feedback – log a question asked to the in-app help assistant
// (fired fire-and-forget by ChatWidget on every findAnswer() result).
export async function POST(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const body = await request.json();
    const { question, matchedFaqId, resultType } = body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: 'Frage ist erforderlich' }, { status: 400 });
    }
    if (!isValidResultType(resultType)) {
      return NextResponse.json({ error: 'Ungültiger resultType' }, { status: 400 });
    }

    const log = await prisma.chatLog.create({
      data: {
        sellerId: auth.sellerId ?? null,
        role: auth.role,
        question: question.slice(0, 300),
        matchedFaqId: typeof matchedFaqId === 'string' ? matchedFaqId : null,
        resultType,
      },
    });

    return NextResponse.json({ id: log.id });
  } catch (error) {
    console.error('POST /api/chat-feedback error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

// PATCH /api/chat-feedback – rate a previously logged answer helpful/unhelpful
// (👍/👎 in ChatWidget). Callers may only rate their own log entries; admins
// may rate any.
export async function PATCH(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const body = await request.json();
    const { logId, helpful } = body;

    if (!logId || typeof logId !== 'string') {
      return NextResponse.json({ error: 'logId ist erforderlich' }, { status: 400 });
    }
    if (typeof helpful !== 'boolean') {
      return NextResponse.json({ error: 'helpful muss ein Boolean sein' }, { status: 400 });
    }

    const existing = await prisma.chatLog.findUnique({ where: { id: logId } });
    if (!existing) {
      return NextResponse.json({ error: 'Eintrag nicht gefunden' }, { status: 404 });
    }
    if (auth.role !== 'admin' && existing.sellerId !== auth.sellerId) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    const updated = await prisma.chatLog.update({
      where: { id: logId },
      data: { helpful },
    });

    return NextResponse.json({ id: updated.id, helpful: updated.helpful });
  } catch (error) {
    console.error('PATCH /api/chat-feedback error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

// GET /api/chat-feedback – admin: last 200 logs (newest first) + aggregates,
// consumed by app/admin/hilfe.
export async function GET() {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const [logs, total, unanswered, unhelpful] = await Promise.all([
      prisma.chatLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.chatLog.count(),
      prisma.chatLog.count({ where: { resultType: 'none' } }),
      prisma.chatLog.count({ where: { helpful: false } }),
    ]);

    return NextResponse.json({ logs, aggregates: { total, unanswered, unhelpful } });
  } catch (error) {
    console.error('GET /api/chat-feedback error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
