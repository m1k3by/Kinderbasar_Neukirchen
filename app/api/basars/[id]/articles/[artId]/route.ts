import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { requireAuth } from '../../../../../lib/apiAuth';

// DELETE /api/basars/:id/articles/:artId
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; artId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;
    const { id: basarId, artId } = await params;

    const basar = await prisma.basar.findUnique({ where: { id: basarId } });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });

    if (basar.status === 'ACTIVE' || basar.status === 'CLOSED') {
      return NextResponse.json({ error: 'Artikel können nach Basar-Start nicht mehr gelöscht werden' }, { status: 400 });
    }

    const article = await prisma.article.findUnique({
      where: { id: artId },
      include: { basarSeller: true },
    });
    if (!article) return NextResponse.json({ error: 'Artikel nicht gefunden' }, { status: 404 });

    // Non-admin must own the article
    if (auth.role !== 'admin' && article.basarSeller.sellerId !== auth.sellerId) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    await prisma.article.delete({ where: { id: artId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/basars/[id]/articles/[artId] error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
