import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAuth, requireAdmin } from '../../../../lib/apiAuth';

// GET /api/basars/:id/settlements – list all settlements for this basar
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;
    const { id: basarId } = await params;

    // Sellers can only see their own settlement
    if (auth.role !== 'admin') {
      const sellerId: number = auth.sellerId!;
      const basarSeller = await prisma.basarSeller.findUnique({
        where: { basarId_sellerId: { basarId, sellerId } },
        include: { settlement: true },
      });
      if (!basarSeller) return NextResponse.json({ settlements: [] });
      return NextResponse.json({ settlements: basarSeller.settlement ? [basarSeller.settlement] : [] });
    }

    const settlements = await prisma.settlement.findMany({
      where: { basarId },
      include: {
        basarSeller: {
          include: {
            seller: { select: { firstName: true, lastName: true, sellerId: true } },
          },
        },
      },
      orderBy: { basarSeller: { sellerId: 'asc' } },
    });

    return NextResponse.json({ settlements });
  } catch (error) {
    console.error('GET /api/basars/[id]/settlements error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

// POST /api/basars/:id/settlements – generate settlements for all sellers (admin only)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const { id: basarId } = await params;
    const basar = await prisma.basar.findUnique({ where: { id: basarId } });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });
    if (basar.status !== 'CLOSED') {
      return NextResponse.json({ error: 'Abrechnung nur für geschlossene Basare möglich' }, { status: 400 });
    }

    const basarSellers = await prisma.basarSeller.findMany({
      where: { basarId },
      include: {
        articles: {
          include: { sales: true },
        },
      },
    });

    const created = [];
    for (const bs of basarSellers) {
      const commissionRate = Number(bs.commissionOverride ?? basar.commissionPercent) / 100;
      const entryFeeAmt = Number(basar.entryFee);

      const grossRevenue = bs.articles
        .filter(a => a.status === 'SOLD')
        .map(a => a.sales?.find(s => !s.isCancelled))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .reduce((sum, s) => sum + Number(s.salePrice), 0);

      const commissionAmount = Math.round(grossRevenue * commissionRate * 100) / 100;
      const netPayout = Math.max(0, grossRevenue - commissionAmount - entryFeeAmt);

      const settlement = await prisma.settlement.upsert({
        where: { basarSellerId: bs.id },
        update: { grossRevenue, commissionAmount, entryFeeAmount: entryFeeAmt, netPayout },
        create: {
          basarId,
          basarSellerId: bs.id,
          grossRevenue,
          commissionAmount,
          entryFeeAmount: entryFeeAmt,
          netPayout,
        },
      });
      created.push(settlement);
    }

    return NextResponse.json({ created: created.length, settlements: created });
  } catch (error) {
    console.error('POST /api/basars/[id]/settlements error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
