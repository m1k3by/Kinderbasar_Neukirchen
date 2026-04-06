import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../../lib/prisma';
import { BasarStatus } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Valid state machine transitions
const TRANSITIONS: Record<BasarStatus, BasarStatus | null> = {
  DRAFT: 'OPEN',
  OPEN: 'ACTIVE',
  ACTIVE: 'CLOSED',
  CLOSED: null,
};

// PATCH /api/basars/:id/status – advance to next status (admin only)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Nur Admins dürfen den Status ändern' }, { status: 403 });
    }

    const { id } = await params;
    const basar = await prisma.basar.findUnique({ where: { id } });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });

    // Allow explicit target status in body, otherwise advance
    const body = await request.json().catch(() => ({}));
    const targetStatus: BasarStatus | undefined = body.status;

    let newStatus: BasarStatus | null;
    if (targetStatus) {
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
