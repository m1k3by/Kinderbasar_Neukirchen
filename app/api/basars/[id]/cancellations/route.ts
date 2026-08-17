import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/apiAuth';

// GET /api/basars/:id/cancellations – alle Stornos eines Basars, chronologisch neueste zuerst.
// Beantwortet pro Storno: welcher Artikel, wer hat ihn angeboten, wer hat kassiert, wer hat
// storniert und wann. Admin only.
//
// Sortiert nach cancelledAt, Altbestand (cancelledAt = null, storniert vor Einführung des
// Protokolls) hängt hinten und wird als "unbekannt" ausgewiesen – nicht als Admin-Storno.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;
    const { id: basarId } = await params;

    const sales = await prisma.sale.findMany({
      where: { basarId, isCancelled: true },
      select: {
        id: true,
        salePrice: true,
        soldAt: true,
        cancelledAt: true,
        cancelledById: true,
        cashier: { select: { sellerId: true, firstName: true, lastName: true } },
        cancelledBy: { select: { sellerId: true, firstName: true, lastName: true } },
        article: {
          select: {
            title: true,
            sizeLabel: true,
            qrCode: true,
            status: true,
            basarSeller: { select: { sellerId: true, seller: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
      orderBy: [{ cancelledAt: 'desc' }, { soldAt: 'desc' }],
    });

    const cancellations = sales.map((s) => ({
      saleId: s.id,
      articleTitle: s.article.title,
      sizeLabel: s.article.sizeLabel,
      qrCode: s.article.qrCode,
      // Nach dem Storno steht der Artikel wieder auf AVAILABLE. Ist er inzwischen erneut
      // SOLD, war das Storno eine Korrektur und kein endgültiger Ausfall – das ist der
      // Unterschied zwischen "falsch gescannt" und "Ware kaputt/zurück".
      articleStatus: s.article.status,
      salePrice: Number(s.salePrice),
      sellerId: s.article.basarSeller.sellerId,
      sellerName: `${s.article.basarSeller.seller.firstName} ${s.article.basarSeller.seller.lastName}`,
      cashierId: s.cashier?.sellerId ?? null,
      cashierName: s.cashier ? `${s.cashier.firstName} ${s.cashier.lastName}` : null,
      cancelledById: s.cancelledById,
      cancelledByName: s.cancelledBy
        ? `${s.cancelledBy.firstName} ${s.cancelledBy.lastName}`
        : s.cancelledAt
          ? 'Admin'
          : null,
      soldAt: s.soldAt.toISOString(),
      cancelledAt: s.cancelledAt ? s.cancelledAt.toISOString() : null,
    }));

    const total = cancellations.reduce((sum, c) => sum + c.salePrice, 0);

    return NextResponse.json({ cancellations, count: cancellations.length, total });
  } catch (error) {
    console.error('GET /api/basars/[id]/cancellations error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
