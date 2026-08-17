import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/apiAuth';

// Sicherheitsdeckel für die Rohabfrage – siehe Kommentar bei RAW_FETCH_CAP unten.
// ponytail: In-Memory-Gruppierung statt SQL-groupBy über clientTxId, weil Zeilen mit
// clientTxId=null als je eigener Vorgang zählen (kein GROUP BY-Schlüssel dafür) und der
// Cursor über vollständige Vorgänge laufen muss, nicht über einzelne Sale-Zeilen. Bei
// realistischer Basar-Größe (ein paar tausend Sales) ist das unproblematisch; sollte ein
// Basar RAW_FETCH_CAP an gefilterten Sales überschreiten, fehlen ältere Vorgänge auf
// späteren Seiten – dann bräuchte es echte Cursor-Pagination auf DB-Ebene.
const RAW_FETCH_CAP = 5000;

// GET /api/basars/:id/transactions – Kassenvorgänge (gruppiert nach clientTxId) für die
// aufklappbare Kassierertabelle in der Admin-Statistik. Admin only.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;
    const { id: basarId } = await params;

    const url = new URL(request.url);
    const cashierIdParam = url.searchParams.get('cashierId');
    const q = url.searchParams.get('q')?.trim() || undefined;
    const scopeParam = url.searchParams.get('scope');
    if (scopeParam !== null && scopeParam !== 'article' && scopeParam !== 'cashier' && scopeParam !== 'all') {
      return NextResponse.json({ error: 'Ungültiger scope' }, { status: 400 });
    }
    const scope = scopeParam ?? 'all';
    const cursor = url.searchParams.get('cursor');
    const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50, 1), 200);

    const where: Prisma.SaleWhereInput = { basarId };

    if (cashierIdParam !== null) {
      if (cashierIdParam === 'null') {
        where.cashierId = null;
      } else {
        const parsedCashierId = parseInt(cashierIdParam, 10);
        if (Number.isNaN(parsedCashierId)) {
          return NextResponse.json({ error: 'Ungültige cashierId' }, { status: 400 });
        }
        where.cashierId = parsedCashierId;
      }
    }

    if (q) {
      // Wortweise UND-Verknüpfung: "jeans blau" findet "Jeans blau" wie auch "Blaue Jeanshose".
      // ponytail: kein Postgres-tsvector/GIN – `contains` je Token reicht bei ein paar tausend
      // Sales pro Basar und braucht weder Preview-Feature noch Migration. Wird die Suche
      // spürbar langsam, ist der Umstieg auf Full-Text-Index der nächste Schritt.
      const tokens = q.split(/\s+/).filter(Boolean).slice(0, 6);
      where.AND = tokens.map((token) => {
        const asNumber = /^\d+$/.test(token) ? parseInt(token, 10) : undefined;
        const articleClauses: Prisma.SaleWhereInput[] = [
          { article: { title: { contains: token, mode: 'insensitive' } } },
          { article: { qrCode: { contains: token, mode: 'insensitive' } } },
          { article: { sizeLabel: { contains: token, mode: 'insensitive' } } },
          { article: { basarSeller: { seller: { firstName: { contains: token, mode: 'insensitive' } } } } },
          { article: { basarSeller: { seller: { lastName: { contains: token, mode: 'insensitive' } } } } },
          ...(asNumber !== undefined ? [{ article: { basarSeller: { sellerId: { equals: asNumber } } } }] : []),
        ];
        const cashierClauses: Prisma.SaleWhereInput[] = [
          { cashier: { firstName: { contains: token, mode: 'insensitive' } } },
          { cashier: { lastName: { contains: token, mode: 'insensitive' } } },
          ...(asNumber !== undefined ? [{ cashierId: { equals: asNumber } }] : []),
        ];
        return {
          OR: scope === 'article' ? articleClauses
            : scope === 'cashier' ? cashierClauses
            : [...articleClauses, ...cashierClauses],
        };
      });
    }

    const sales = await prisma.sale.findMany({
      where,
      select: {
        id: true,
        clientTxId: true,
        cashierId: true,
        salePrice: true,
        soldAt: true,
        isCancelled: true,
        cashier: { select: { firstName: true, lastName: true } },
        article: {
          select: {
            title: true,
            sizeLabel: true,
            qrCode: true,
            basarSeller: { select: { sellerId: true, seller: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
      orderBy: { soldAt: 'desc' },
      take: RAW_FETCH_CAP,
    });

    type TxGroup = {
      key: string;
      txId: string | null;
      cashierId: number | null;
      cashierName: string;
      soldAtMin: number;
      items: {
        saleId: string;
        articleTitle: string;
        sizeLabel: string | null;
        qrCode: string;
        salePrice: number;
        isCancelled: boolean;
        sellerId: number;
        sellerName: string;
      }[];
    };

    const groups = new Map<string, TxGroup>();
    for (const s of sales) {
      // clientTxId=null wird NICHT zusammengefasst (Altbestand/Einzelverkauf) – jede solche
      // Zeile bekommt einen eigenen, auf saleId basierenden Gruppenschlüssel.
      const key = s.clientTxId ?? `__single__${s.id}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          txId: s.clientTxId,
          cashierId: s.cashierId,
          cashierName: s.cashier ? `${s.cashier.firstName} ${s.cashier.lastName}` : 'Ohne Zuordnung',
          soldAtMin: s.soldAt.getTime(),
          items: [],
        };
        groups.set(key, group);
      }
      group.soldAtMin = Math.min(group.soldAtMin, s.soldAt.getTime());
      group.items.push({
        saleId: s.id,
        articleTitle: s.article.title,
        sizeLabel: s.article.sizeLabel,
        qrCode: s.article.qrCode,
        salePrice: Number(s.salePrice),
        isCancelled: s.isCancelled,
        sellerId: s.article.basarSeller.sellerId,
        sellerName: `${s.article.basarSeller.seller.firstName} ${s.article.basarSeller.seller.lastName}`,
      });
    }

    const sortedGroups = [...groups.values()].sort((a, b) => b.soldAtMin - a.soldAtMin);

    const startIndex = cursor ? Math.max(0, sortedGroups.findIndex((g) => g.key === cursor) + 1) : 0;
    const page = sortedGroups.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < sortedGroups.length ? page[page.length - 1]?.key ?? null : null;

    const transactions = page.map((g) => ({
      txId: g.txId,
      cashierId: g.cashierId,
      cashierName: g.cashierName,
      soldAt: new Date(g.soldAtMin).toISOString(),
      total: g.items.filter((i) => !i.isCancelled).reduce((sum, i) => sum + i.salePrice, 0),
      items: g.items,
    }));

    return NextResponse.json({ transactions, nextCursor });
  } catch (error) {
    console.error('GET /api/basars/[id]/transactions error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
