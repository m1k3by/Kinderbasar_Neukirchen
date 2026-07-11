import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/apiAuth';
import { BasarStatus } from '@prisma/client';

// Valid state machine transitions
const TRANSITIONS: Record<BasarStatus, BasarStatus | null> = {
  DRAFT: 'OPEN',
  OPEN: 'ACTIVE',
  ACTIVE: 'CLOSED',
  CLOSED: null,
};

// Allow rolling back exactly one step (the inverse of TRANSITIONS)
const PREVIOUS: Record<BasarStatus, BasarStatus | null> = {
  DRAFT: null,
  OPEN: 'DRAFT',
  ACTIVE: 'OPEN',
  CLOSED: 'ACTIVE',
};

const VALID_STATUSES: BasarStatus[] = ['DRAFT', 'OPEN', 'ACTIVE', 'CLOSED'];

// PATCH /api/basars/:id/status – advance to next status (admin only)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const { id } = await params;
    const basar = await prisma.basar.findUnique({ where: { id } });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });

    // Allow explicit target status in body, otherwise advance
    const body = await request.json().catch(() => ({}));
    const targetStatus: BasarStatus | undefined = body.status;

    let newStatus: BasarStatus | null;
    if (targetStatus) {
      if (!VALID_STATUSES.includes(targetStatus)) {
        return NextResponse.json({ error: 'Ungültiger Statusübergang' }, { status: 400 });
      }
      const nextAllowed = TRANSITIONS[basar.status];
      const prevAllowed = PREVIOUS[basar.status];
      if (targetStatus !== nextAllowed && targetStatus !== prevAllowed) {
        return NextResponse.json({ error: 'Ungültiger Statusübergang' }, { status: 400 });
      }
      newStatus = targetStatus;
    } else {
      newStatus = TRANSITIONS[basar.status];
    }

    if (!newStatus) {
      return NextResponse.json({ error: 'Kein weiterer Status möglich (Basar ist bereits geschlossen)' }, { status: 400 });
    }

    const updated = await prisma.basar.update({ where: { id }, data: { status: newStatus } });
    return NextResponse.json({ status: updated.status, message: `Status geändert zu: ${updated.status}` });
  } catch (error) {
    console.error('PATCH /api/basars/[id]/status error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
