import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../../lib/prisma';
import { requireCashier } from '../../../../lib/apiAuth';
import crypto from 'crypto';

// GET /api/basars/:id/scan-cache – minimal projection of all AVAILABLE+SOLD articles for a
// basar, meant to be cached client-side (IndexedDB) by the Kasse for offline scanning.
//
// Unlike GET /api/basars/:id/articles, this route returns the SAME shape regardless of caller
// role (admin or cashier) – the old cacheBasarArticles() in the Kasse called the /articles
// route, which only returns *all* articles in the admin branch; a plain cashier (isCashier
// true, role seller/employee) hit the other branch and got back only their *own* articles.
// That left the offline cache effectively empty for every real cashier, so every offline scan
// fell through to manual entry, and manual entries can never sync automatically.
//
// Supports conditional GET via ETag/If-None-Match so the Kasse's handleOnline (which fires on
// every WiFi flap) doesn't repeatedly re-download the full article list.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireCashier();
    if (authResult.response) return authResult.response;
    const { id: basarId } = await params;

    const where: Prisma.ArticleWhereInput = {
      basarSeller: { basarId },
      status: { in: ['AVAILABLE', 'SOLD'] },
    };

    // Cheap aggregate to compute an ETag without pulling every row when nothing changed.
    const agg = await prisma.article.aggregate({
      where,
      _count: { _all: true },
      _max: { createdAt: true, soldAt: true },
    });

    const etagSource = `${agg._count._all}-${agg._max.createdAt?.getTime() ?? 0}-${agg._max.soldAt?.getTime() ?? 0}`;
    const etag = `"${crypto.createHash('sha1').update(etagSource).digest('hex')}"`;

    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }

    const articles = await prisma.article.findMany({
      where,
      select: {
        id: true,
        title: true,
        sizeLabel: true,
        price: true,
        qrCode: true,
        status: true,
        basarSeller: {
          select: { seller: { select: { sellerId: true, firstName: true, lastName: true } } },
        },
      },
    });

    const projected = articles.map((a) => ({
      id: a.id,
      title: a.title,
      sizeLabel: a.sizeLabel,
      price: a.price,
      qrCode: a.qrCode,
      status: a.status,
      sellerId: a.basarSeller.seller.sellerId,
      sellerName: `${a.basarSeller.seller.firstName} ${a.basarSeller.seller.lastName}`.trim(),
    }));

    return NextResponse.json({ articles: projected }, { headers: { ETag: etag } });
  } catch (error) {
    console.error('GET /api/basars/[id]/scan-cache error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
