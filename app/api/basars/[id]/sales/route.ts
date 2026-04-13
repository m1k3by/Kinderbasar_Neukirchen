import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET!;

// POST /api/basars/:id/sales – kassiere einen oder mehrere Artikel
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const isAuthorized = decoded.role === 'admin' || decoded.isCashier === true;
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Nur Kassierer oder Admins dürfen kassieren' }, { status: 403 });
    }

    const cashierId: number = decoded.sellerId ?? 0;
    const { id: basarId } = await params;

    const basar = await prisma.basar.findUnique({ where: { id: basarId } });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });
    if (basar.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Kassieren nur bei aktivem Basar möglich' }, { status: 400 });
    }

    // Body: { items: [{ articleId, salePrice? }] } or { qrCode, salePrice? } for single scan
    const body = await request.json();
    const items: { articleId?: string; qrCode?: string; salePrice?: number }[] = body.items ?? [body];

    const results = [];
    for (const item of items) {
      let article;
      if (item.qrCode) {
        // qrCode is no longer unique on Article (same code reused across basars); narrow by basarId
        article = await prisma.article.findFirst({ where: { qrCode: item.qrCode, basarSeller: { basarId } } });
      } else if (item.articleId) {
        article = await prisma.article.findUnique({ where: { id: item.articleId } });
      }

      if (!article) {
        results.push({ error: 'Artikel nicht gefunden', item });
        continue;
      }
      if (article.status === 'SOLD') {
        results.push({ error: 'Bereits verkauft', articleId: article.id });
        continue;
      }

      const salePrice = item.salePrice ?? Number(article.price);

      const [updatedArticle, sale] = await prisma.$transaction([
        prisma.article.update({
          where: { id: article.id },
          data: { status: 'SOLD', soldAt: new Date() },
        }),
        prisma.sale.create({
          data: {
            basarId,
            articleId: article.id,
            cashierId,
            salePrice,
            syncedAt: new Date(),
          },
        }),
      ]);

      results.push({ success: true, articleId: article.id, saleId: sale.id, salePrice: Number(updatedArticle.price) });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('POST /api/basars/[id]/sales error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

// GET /api/basars/:id/sales – Verkaufsübersicht (admin/cashier)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const isAuthorized = decoded.role === 'admin' || decoded.isCashier === true;
    if (!isAuthorized) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });

    const { id: basarId } = await params;

    const sales = await prisma.sale.findMany({
      where: { basarId, isCancelled: false },
      include: {
        article: { include: { basarSeller: { select: { sellerId: true } } } },
      },
      orderBy: { soldAt: 'desc' },
    });

    return NextResponse.json({ sales });
  } catch (error) {
    console.error('GET /api/basars/[id]/sales error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
