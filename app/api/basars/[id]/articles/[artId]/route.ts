import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// DELETE /api/basars/:id/articles/:artId
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; artId: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
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
    if (decoded.role !== 'admin' && article.basarSeller.sellerId !== decoded.sellerId) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    await prisma.article.delete({ where: { id: artId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/basars/[id]/articles/[artId] error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
