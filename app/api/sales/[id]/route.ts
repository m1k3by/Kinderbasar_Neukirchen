import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireCashier } from '../../../lib/apiAuth';

// DELETE /api/sales/:id – Storno (Admin only, within 10 minutes)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireCashier();
    if (authResult.response) return authResult.response;

    const { id } = await params;
    const sale = await prisma.sale.findUnique({ where: { id } });
    if (!sale) return NextResponse.json({ error: 'Verkauf nicht gefunden' }, { status: 404 });
    if (sale.isCancelled) return NextResponse.json({ error: 'Bereits storniert' }, { status: 400 });

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (sale.soldAt < tenMinutesAgo) {
      return NextResponse.json({ error: 'Storno nur innerhalb von 10 Minuten möglich' }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.sale.update({ where: { id }, data: { isCancelled: true } }),
      prisma.article.update({ where: { id: sale.articleId }, data: { status: 'AVAILABLE', soldAt: null } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/sales/[id] error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
