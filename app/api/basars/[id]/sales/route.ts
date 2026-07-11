import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireCashier } from '../../../../lib/apiAuth';

// Validates and normalizes a requested sale price. Returns null if invalid.
function normalizeSalePrice(value: unknown): number | null {
  const num = typeof value === 'string' ? parseFloat(value) : (value as number);
  if (typeof num !== 'number' || !Number.isFinite(num) || num <= 0 || num > 1000) return null;
  return Math.round(num * 100) / 100;
}

// POST /api/basars/:id/sales – kassiere einen oder mehrere Artikel
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireCashier();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const cashierId: number | null = auth.sellerId ?? null;
    const { id: basarId } = await params;

    const basar = await prisma.basar.findUnique({ where: { id: basarId } });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });
    if (basar.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Kassieren nur bei aktivem Basar möglich' }, { status: 400 });
    }

    // Body: { items: [{ articleId, salePrice? }] } or { qrCode, salePrice? } for single scan.
    // clientTxId is an optional idempotency key sent by the cashier UI (live checkout or offline sync) – logged for correlation only.
    const body = await request.json();
    const items: { articleId?: string; qrCode?: string; salePrice?: number }[] = body.items ?? [body];
    const clientTxId: string | undefined = body.clientTxId;

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

      let salePrice: number;
      if (item.salePrice === undefined || item.salePrice === null) {
        salePrice = Number(article.price);
      } else {
        const normalized = normalizeSalePrice(item.salePrice);
        if (normalized === null) {
          results.push({ error: 'Ungültiger Preis', articleId: article.id });
          continue;
        }
        salePrice = normalized;
      }

      // Conditional update: only proceed if the article is still AVAILABLE. This is race-safe
      // for concurrent cashiers and also allows re-selling an article after its previous sale
      // was cancelled (Sale.articleId is no longer unique – see schema).
      const { sale } = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.article.updateMany({
          where: { id: article.id, status: 'AVAILABLE' },
          data: { status: 'SOLD', soldAt: new Date() },
        });
        if (updateResult.count !== 1) {
          return { sale: null };
        }
        const sale = await tx.sale.create({
          data: {
            basarId,
            articleId: article.id,
            cashierId,
            salePrice,
            syncedAt: new Date(),
          },
        });
        return { sale };
      });

      if (!sale) {
        results.push({ error: 'Bereits verkauft', articleId: article.id });
        continue;
      }

      if (clientTxId) {
        console.log('[SALES] clientTxId:', clientTxId, 'articleId:', article.id, 'saleId:', sale.id);
      }

      results.push({ success: true, articleId: article.id, saleId: sale.id, salePrice });
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
    const authResult = await requireCashier();
    if (authResult.response) return authResult.response;

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
