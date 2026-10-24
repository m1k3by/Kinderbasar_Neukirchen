import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireCashier } from '../../../lib/apiAuth';
import { requireBasarAccess } from '../../../lib/basarAccess';

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
    // Testbasar: nur Admin und Eingeladene, sonst 404 (app/lib/basarAccess.ts).
    const denied = await requireBasarAccess(auth, sale.basarId);
    if (denied) return denied;
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

    // Storno protokollieren: Admins haben keine sellerId, dort bleibt cancelledById null –
    // das gesetzte cancelledAt unterscheidet den Admin-Storno vom nicht protokollierten
    // Altbestand (siehe app/api/basars/[id]/cancellations/route.ts).
    // Prüfung und Schreiben sind eins: `isCancelled: false` steht im WHERE, nicht nur im
    // findUnique oben. Zwei gleichzeitige Stornos passierten sonst beide die Prüfung und
    // meldeten beide 200. Der Verlierer (count 0) fasst den Artikel nicht an.
    const cancelled = await prisma.$transaction(async (tx) => {
      const { count } = await tx.sale.updateMany({
        where: { id, isCancelled: false },
        data: {
          isCancelled: true,
          cancelledAt: new Date(),
          cancelledById: auth.role === 'admin' ? null : auth.sellerId ?? null,
        },
      });
      if (count === 0) return false;
      // Artikel nur freigeben, wenn er noch SOLD ist und kein anderer aktiver Verkauf an ihm
      // hängt (Sale.articleId ist nicht unique: nach einem Storno ist Wiederverkauf erlaubt).
      await tx.article.updateMany({
        where: { id: sale.articleId, status: 'SOLD', sales: { none: { isCancelled: false } } },
        data: { status: 'AVAILABLE', soldAt: null },
      });
      return true;
    });
    if (!cancelled) return NextResponse.json({ error: 'Bereits storniert' }, { status: 409 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/sales/[id] error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
