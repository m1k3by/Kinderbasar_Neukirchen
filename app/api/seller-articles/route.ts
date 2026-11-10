import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../lib/apiAuth';
import { parseArticleInput } from '../../lib/articleInput';

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
        gender: sa.gender,
        price: Number(sa.price),
        tags: sa.tags ?? [],
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

// POST /api/seller-articles  body: { title, sizeLabel?, gender?, price, tags? }
// Legt einen Artikel im eigenen Bestand an – unabhängig von jedem Basar. In einen offenen
// Basar kommt er danach über POST /api/basars/[id]/articles/import (dort gilt das Artikellimit).
export async function POST(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const sellerId: number | undefined = authResult.auth.sellerId;
    if (!sellerId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const parsed = parseArticleInput(await request.json());
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const sellerArticle = await prisma.sellerArticle.create({
      // QR-Code entsteht hier und bleibt für immer am Eintrag (CLAUDE.md: QR-Codes ändern
      // sich bei Wiederverwendung nicht).
      data: { sellerId, ...parsed.data, qrCode: crypto.randomUUID() },
    });
    return NextResponse.json({ sellerArticle: { ...sellerArticle, price: Number(sellerArticle.price) } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/seller-articles error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

// PATCH /api/seller-articles  body: { id, title, sizeLabel?, gender?, price, tags? }
// Bearbeitet einen Eintrag im eigenen Bestand. Ist er bereits in einen Basar übernommen, der
// noch nicht läuft (DRAFT/OPEN), wird der dortige Artikel mitgezogen – sonst stünde an der
// Kasse ein anderer Preis als hier. Laufende und beendete Basare bleiben unberührt: dort
// gilt, was auf dem gedruckten Etikett steht bzw. was abgerechnet wurde.
export async function PATCH(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const sellerId: number | undefined = authResult.auth.sellerId;
    if (!sellerId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const body = await request.json();
    const parsed = parseArticleInput(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const sa = await prisma.sellerArticle.findUnique({ where: { id: String(body.id) } });
    if (!sa || sa.sellerId !== sellerId) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
    }

    // Tags gehören nur zum Archiv-Eintrag, Article hat keine.
    const { title, sizeLabel, gender, price } = parsed.data;
    const [sellerArticle, propagated] = await prisma.$transaction([
      prisma.sellerArticle.update({ where: { id: sa.id }, data: parsed.data }),
      prisma.article.updateMany({
        where: {
          sellerArticleId: sa.id,
          status: 'AVAILABLE',
          basarSeller: { basar: { status: { in: ['DRAFT', 'OPEN'] } } },
        },
        data: { title, sizeLabel, gender, price },
      }),
    ]);

    return NextResponse.json({
      sellerArticle: { ...sellerArticle, price: Number(sellerArticle.price) },
      // > 0: ein offener Basar hat den Artikel – sein Etikett muss neu gedruckt werden.
      updatedBasarArticles: propagated.count,
    });
  } catch (error) {
    console.error('PATCH /api/seller-articles error:', error);
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
