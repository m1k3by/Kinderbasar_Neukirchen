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
    // clientTxId is an optional idempotency/grouping key sent by the cashier UI (live checkout
    // or offline sync) – persisted on each Sale so the admin transactions view can group items
    // sold in the same checkout.
    const body = await request.json();
    const items: { articleId?: string; qrCode?: string; salePrice?: number }[] = body.items ?? [body];
    const clientTxId: string | undefined = body.clientTxId;

    // Ein Warenkorb kann 20+ Artikel haben. Pro Artikel einzeln aufzulösen und einzeln in
    // einer interaktiven Transaktion zu schreiben wären ~5 sequentielle DB-Round-Trips je
    // Artikel – bei 15 Artikeln landet das im Sekundenbereich bis Function-Timeout, und die
    // Kasse steht. Deshalb: alles auflösen in einem Rutsch, alles schreiben in einer
    // Transaktion. Round-Trips sind damit konstant, unabhängig von der Warenkorbgröße.
    const results: Record<string, unknown>[] = new Array(items.length);

    // qrCode ist auf Article nicht unique (gleicher Code über Basare hinweg wiederverwendet),
    // deshalb getrennt abfragen und über basarSeller auf diesen Basar einschränken.
    const qrCodes = items.filter((i) => i.qrCode).map((i) => i.qrCode!);
    const ids = items.filter((i) => !i.qrCode && i.articleId).map((i) => i.articleId!);
    const [byQrList, byIdList] = await Promise.all([
      qrCodes.length
        ? prisma.article.findMany({ where: { qrCode: { in: qrCodes }, basarSeller: { basarId } } })
        : Promise.resolve([]),
      ids.length ? prisma.article.findMany({ where: { id: { in: ids } } }) : Promise.resolve([]),
    ]);
    const byQr = new Map(byQrList.map((a) => [a.qrCode, a]));
    const byId = new Map(byIdList.map((a) => [a.id, a]));

    // Artikel auflösen, Preise validieren, Duplikate innerhalb des Warenkorbs abfangen.
    const toSell: { articleId: string; salePrice: number; idx: number }[] = [];
    const seen = new Set<string>();
    items.forEach((item, idx) => {
      const article = item.qrCode ? byQr.get(item.qrCode) : item.articleId ? byId.get(item.articleId) : undefined;
      if (!article) {
        results[idx] = { error: 'Artikel nicht gefunden', item };
        return;
      }
      let salePrice: number;
      if (item.salePrice === undefined || item.salePrice === null) {
        salePrice = Number(article.price);
      } else {
        const normalized = normalizeSalePrice(item.salePrice);
        if (normalized === null) {
          results[idx] = { error: 'Ungültiger Preis', articleId: article.id };
          return;
        }
        salePrice = normalized;
      }
      if (seen.has(article.id)) {
        // Derselbe Artikel zweimal im selben Request – der zweite kann nicht mehr verkauft werden.
        results[idx] = { error: 'Bereits verkauft', articleId: article.id };
        return;
      }
      seen.add(article.id);
      toSell.push({ articleId: article.id, salePrice, idx });
    });

    if (toSell.length > 0) {
      const priceByArticle = new Map(toSell.map((t) => [t.articleId, t.salePrice]));
      const now = new Date();
      // Bedingtes Update: nur Artikel, die noch AVAILABLE sind. Race-sicher gegenüber
      // parallelen Kassen und erlaubt den Wiederverkauf nach einem Storno (Sale.articleId
      // ist nicht unique – siehe schema). updateManyAndReturn liefert genau die Zeilen, die
      // wirklich umgestellt wurden; alle anderen waren schon weg.
      const saleIdByArticle = await prisma.$transaction(async (tx) => {
        const updated = await tx.article.updateManyAndReturn({
          where: { id: { in: toSell.map((t) => t.articleId) }, status: 'AVAILABLE' },
          data: { status: 'SOLD', soldAt: now },
          select: { id: true },
        });
        if (updated.length === 0) return new Map<string, string>();
        const sales = await tx.sale.createManyAndReturn({
          data: updated.map((a) => ({
            basarId,
            articleId: a.id,
            cashierId,
            salePrice: priceByArticle.get(a.id)!,
            syncedAt: now,
            clientTxId: clientTxId ?? null,
          })),
          select: { id: true, articleId: true },
        });
        return new Map(sales.map((s) => [s.articleId, s.id]));
      });

      for (const t of toSell) {
        const saleId = saleIdByArticle.get(t.articleId);
        results[t.idx] = saleId
          ? { success: true, articleId: t.articleId, saleId, salePrice: t.salePrice }
          : { error: 'Bereits verkauft', articleId: t.articleId };
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('POST /api/basars/[id]/sales error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

// GET /api/basars/:id/sales – Verkaufsübersicht (admin/cashier)
// Cursor-paginated (?cursor=<saleId>&limit=<n>, default 200, max 1000) with a trimmed
// projection – a basar with 2000+ sellers can accumulate tens of thousands of sale rows, and
// the previous unbounded include(article -> include(basarSeller)) returned every scalar
// field of both models to every caller regardless of size.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireCashier();
    if (authResult.response) return authResult.response;

    const { id: basarId } = await params;

    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const limitParam = parseInt(url.searchParams.get('limit') || '200', 10);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 200, 1), 1000);

    const sales = await prisma.sale.findMany({
      where: { basarId, isCancelled: false },
      select: {
        id: true,
        articleId: true,
        cashierId: true,
        salePrice: true,
        soldAt: true,
        syncedAt: true,
        article: {
          select: {
            id: true,
            title: true,
            sizeLabel: true,
            price: true,
            qrCode: true,
            status: true,
            basarSeller: { select: { sellerId: true } },
          },
        },
      },
      orderBy: { soldAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | null = null;
    if (sales.length > limit) {
      const next = sales.pop();
      nextCursor = next!.id;
    }

    return NextResponse.json({ sales, nextCursor });
  } catch (error) {
    console.error('GET /api/basars/[id]/sales error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
