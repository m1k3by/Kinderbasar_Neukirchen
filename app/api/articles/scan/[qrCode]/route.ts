import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireCashier } from '../../../../lib/apiAuth';
import { requireBasarAccess, visibleBasarWhere } from '../../../../lib/basarAccess';

// GET /api/articles/scan/:qrCode?basarId=… – returns article info for the kasse scanner
export async function GET(
  request: Request,
  { params }: { params: Promise<{ qrCode: string }> }
) {
  try {
    const authResult = await requireCashier();
    if (authResult.response) return authResult.response;

    const { qrCode } = await params;
    const basarId = new URL(request.url).searchParams.get('basarId');

    if (basarId) {
      const denied = await requireBasarAccess(authResult.auth, basarId);
      if (denied) return denied;
    }

    // Derselbe QR-Code existiert in mehreren Basaren (stabile Codes über Archiv-Übernahmen).
    // Mit basarId – so ruft die Kasse – wird nur in *ihrem* Basar gesucht. Vorher suchte die
    // Route in jedem aktiven Basar: liefen zwei gleichzeitig (Testbasar neben dem echten),
    // konnte der Artikel aus dem falschen kommen.
    // Ohne basarId bleibt der Aufruf gültig, weil nach einem Deploy Kassengeräte noch die alte
    // App-Version im Cache haben können (PWA). Dann aber nur über Basare, die der Kassierer
    // überhaupt sehen darf; vor einer Buchung im falschen Basar schützt zusätzlich
    // POST /api/basars/[id]/sales, das nur Artikel des eigenen Basars annimmt.
    const article = await prisma.article.findFirst({
      where: {
        qrCode,
        basarSeller: basarId
          ? { basarId, basar: { status: 'ACTIVE' } }
          : { basar: { status: 'ACTIVE', ...visibleBasarWhere(authResult.auth) } },
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
