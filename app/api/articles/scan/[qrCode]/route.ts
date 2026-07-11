import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireCashier } from '../../../../lib/apiAuth';

// GET /api/articles/scan/:qrCode – returns article info for the kasse scanner
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ qrCode: string }> }
) {
  try {
    const authResult = await requireCashier();
    if (authResult.response) return authResult.response;

    const { qrCode } = await params;

    // Use findFirst so the same QR code can exist in multiple basars (stable codes).
    // Among all articles with this code, find the one in an ACTIVE basar.
    const article = await prisma.article.findFirst({
      where: {
        qrCode,
        basarSeller: { basar: { status: 'ACTIVE' } },
      },
      include: {
        basarSeller: {
          include: {
            seller: { select: { firstName: true, lastName: true, sellerId: true } },
            basar: { select: { id: true, title: true, status: true } },
          },
        },
      },
    });

    if (!article) return NextResponse.json({ error: 'Artikel nicht gefunden (kein aktiver Basar)' }, { status: 404 });

    if (article.status === 'SOLD') {
      return NextResponse.json({ error: 'Artikel bereits verkauft', article }, { status: 409 });
    }

    return NextResponse.json({
      id: article.id,
      title: article.title,
      sizeLabel: article.sizeLabel,
      price: Number(article.price),
      status: article.status,
      qrCode: article.qrCode,
      sellerId: article.basarSeller.sellerId,
      sellerName: `${article.basarSeller.seller.firstName} ${article.basarSeller.seller.lastName}`,
      basarId: article.basarSeller.basar.id,
      basarTitle: article.basarSeller.basar.title,
    });
  } catch (error) {
    console.error('GET /api/articles/scan/[qrCode] error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
