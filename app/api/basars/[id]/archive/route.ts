import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/apiAuth';

// PATCH /api/basars/:id/archive – archive or unarchive a basar (admin only)
// Body: { archived: boolean }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const { id } = await params;
    const basar = await prisma.basar.findUnique({ where: { id } });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const archived: boolean = body.archived ?? true;

    const updated = await prisma.basar.update({ where: { id }, data: { isArchived: archived } });
    return NextResponse.json({ isArchived: updated.isArchived });
  } catch (error) {
    console.error('PATCH /api/basars/[id]/archive error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
