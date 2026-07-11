import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../lib/apiAuth';

// GET /api/seller-articles?basarId=xxx
// Returns the caller's personal article archive.
// If basarId is provided, each entry also includes `alreadyInBasar` boolean.
export async function GET(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;
    const sellerId: number | undefined = auth.sellerId;
    if (!sellerId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const basarId = searchParams.get('basarId');

    const sellerArticles = await prisma.sellerArticle.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      include: {
        articles: {
          select: {
            id: true,
            status: true,
            basarSeller: { select: { basarId: true } },
          },
        },
      },
    });

    const result = sellerArticles.map((sa: any) => {
      const articlesInCurrentBasar = basarId
        ? sa.articles.filter((a: any) => a.basarSeller.basarId === basarId)
        : [];
      const soldPreviously = sa.articles.some(
        (a: any) => (!basarId || a.basarSeller.basarId !== basarId) && a.status === 'SOLD'
      );
      return {
        id: sa.id,
        title: sa.title,
        sizeLabel: sa.sizeLabel,
        price: Number(sa.price),
        createdAt: sa.createdAt,
        alreadyInBasar: articlesInCurrentBasar.length > 0,
        soldPreviously,
      };
    });

    return NextResponse.json({ sellerArticles: result });
  } catch (error) {
    console.error('GET /api/seller-articles error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

// DELETE /api/seller-articles  body: { id }
// Remove an entry from the personal archive (does NOT delete already-created basar articles)
export async function DELETE(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;
    const sellerId: number | undefined = auth.sellerId;
    if (!sellerId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const { id } = await request.json();
    const sa = await prisma.sellerArticle.findUnique({ where: { id } });
    if (!sa || sa.sellerId !== sellerId) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
    }

    // Unlink articles before deleting (set sellerArticleId to null)
    await prisma.article.updateMany({ where: { sellerArticleId: id }, data: { sellerArticleId: null } });
    await prisma.sellerArticle.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/seller-articles error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
