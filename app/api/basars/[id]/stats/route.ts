import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/apiAuth';

// Preisbänder fest vorgegeben (siehe CLAUDE.md-Aufgabe „Preisverteilung"). Grenzen sind
// inklusiv am oberen Ende des jeweiligen Bandes.
const PRICE_BANDS = [
  { label: '0,50–2,00 €', min: 0.5, max: 2 },
  { label: '2,50–5,00 €', min: 2.5, max: 5 },
  { label: '5,50–10,00 €', min: 5.5, max: 10 },
  { label: '10,50–20,00 €', min: 10.5, max: 20 },
  { label: 'über 20,00 €', min: 20.5, max: null as number | null },
];

function priceBandIndex(price: number) {
  if (price <= 2) return 0;
  if (price <= 5) return 1;
  if (price <= 10) return 2;
  if (price <= 20) return 3;
  return 4;
}

// GET /api/basars/:id/stats – Verkaufsstatistik pro Basar, insbesondere Scans pro Kassierer
// (admin only). Aggregation läuft komplett in der DB (groupBy/count), damit das auch bei
// tausenden Sales/Verkäufern nicht alle Zeilen nach JS lädt.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;
    const { id: basarId } = await params;

    const [cashierGroups, cancelledCount, articlesOffered, articlesSold, activeSellers, priceGroups, sizeGroups] = await Promise.all([
      prisma.sale.groupBy({
        by: ['cashierId'],
        where: { basarId, isCancelled: false },
        _count: { _all: true },
        _sum: { salePrice: true },
        _min: { soldAt: true },
        _max: { soldAt: true },
      }),
      prisma.sale.count({ where: { basarId, isCancelled: true } }),
      prisma.article.count({ where: { basarSeller: { basarId } } }),
      prisma.article.count({ where: { basarSeller: { basarId }, status: 'SOLD' } }),
      prisma.basarSeller.count({ where: { basarId, isActive: true } }),
      prisma.article.groupBy({
        by: ['price', 'status'],
        where: { basarSeller: { basarId } },
        _count: { _all: true },
      }),
      prisma.article.groupBy({
        by: ['sizeLabel', 'gender', 'status'],
        where: { basarSeller: { basarId } },
        _count: { _all: true },
      }),
    ]);

    const priceBands = PRICE_BANDS.map((band) => ({ ...band, offered: 0, sold: 0 }));
    for (const g of priceGroups) {
      const band = priceBands[priceBandIndex(Number(g.price))];
      band.offered += g._count._all;
      if (g.status === 'SOLD') band.sold += g._count._all;
    }

    const categoryTotals = {
      Kleidung: { offered: 0, sold: 0 },
      'Keine Kleidung': { offered: 0, sold: 0 },
    };
    const sizeMap = new Map<string, { offered: number; sold: number }>();
    for (const g of sizeGroups) {
      const hasSize = !!(g.sizeLabel && g.sizeLabel.trim());
      const hasGender = !!(g.gender && g.gender.trim());
      const isClothing = hasSize || hasGender;
      const count = g._count._all;

      const bucket = isClothing ? categoryTotals.Kleidung : categoryTotals['Keine Kleidung'];
      bucket.offered += count;
      if (g.status === 'SOLD') bucket.sold += count;

      if (isClothing) {
        const key = hasSize ? g.sizeLabel!.trim() : 'ohne Größe';
        const entry = sizeMap.get(key) ?? { offered: 0, sold: 0 };
        entry.offered += count;
        if (g.status === 'SOLD') entry.sold += count;
        sizeMap.set(key, entry);
      }
    }

    const sortedSizes = [...sizeMap.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.offered - a.offered);
    const topSizes = sortedSizes.slice(0, 15);
    const restSizes = sortedSizes.slice(15);
    const sizes = restSizes.length
      ? [
          ...topSizes,
          {
            label: 'Sonstige',
            offered: restSizes.reduce((sum, r) => sum + r.offered, 0),
            sold: restSizes.reduce((sum, r) => sum + r.sold, 0),
          },
        ]
      : topSizes;

    const categories = [
      { label: 'Kleidung' as const, ...categoryTotals.Kleidung },
      { label: 'Keine Kleidung' as const, ...categoryTotals['Keine Kleidung'] },
    ];

    const cashierIds = cashierGroups
      .map((g) => g.cashierId)
      .filter((id): id is number => id !== null);
    const sellers = cashierIds.length
      ? await prisma.seller.findMany({
          where: { sellerId: { in: cashierIds } },
          select: { sellerId: true, firstName: true, lastName: true },
        })
      : [];
    const sellerById = new Map(sellers.map((s) => [s.sellerId, s]));

    const cashiers = cashierGroups
      .map((g) => {
        const seller = g.cashierId !== null ? sellerById.get(g.cashierId) : undefined;
        return {
          cashierId: g.cashierId,
          name: seller ? `${seller.firstName} ${seller.lastName}` : 'Ohne Zuordnung',
          salesCount: g._count._all,
          revenue: Number(g._sum.salePrice ?? 0),
          firstScan: g._min.soldAt ? g._min.soldAt.toISOString() : null,
          lastScan: g._max.soldAt ? g._max.soldAt.toISOString() : null,
        };
      })
      .sort((a, b) => b.salesCount - a.salesCount);

    const totals = {
      salesCount: cashierGroups.reduce((sum, g) => sum + g._count._all, 0),
      revenue: cashiers.reduce((sum, c) => sum + c.revenue, 0),
      cancelledCount,
      articlesOffered,
      articlesSold,
      activeSellers,
    };

    return NextResponse.json({ totals, cashiers, priceBands, sizes, categories });
  } catch (error) {
    console.error('GET /api/basars/[id]/stats error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
