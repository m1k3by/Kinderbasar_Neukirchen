import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireCashier } from '../../../lib/apiAuth';

// DELETE /api/sales/:id – Storno. Kassierer nur innerhalb von 10 Minuten; Admins sind von der
// Frist ausgenommen, dürfen also auch später noch korrigieren. Für beide gesperrt, sobald für
// den betroffenen Verkäufer bereits eine Abrechnung (Settlement) existiert.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireCashier();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { id } = await params;
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { article: { select: { basarSellerId: true } } },
    });
    if (!sale) return NextResponse.json({ error: 'Verkauf nicht gefunden' }, { status: 404 });
    if (sale.isCancelled) return NextResponse.json({ error: 'Bereits storniert' }, { status: 400 });

    if (auth.role !== 'admin') {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      if (sale.soldAt < tenMinutesAgo) {
        return NextResponse.json({ error: 'Storno nur innerhalb von 10 Minuten möglich' }, { status: 400 });
      }
    }

    const settlement = await prisma.settlement.findUnique({
      where: { basarSellerId: sale.article.basarSellerId },
      select: { id: true },
    });
    if (settlement) {
      return NextResponse.json(
        {
          error:
            'Für diesen Verkäufer wurde bereits eine Abrechnung erzeugt. Bitte zuerst die Abrechnung neu erzeugen, dann erneut stornieren.',
        },
        { status: 409 }
      );
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
