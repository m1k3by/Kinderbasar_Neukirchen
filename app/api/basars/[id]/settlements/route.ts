import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
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

    // Bruttoerlös je BasarSeller als DB-Aggregat. Die alte Fassung lud jeden Artikel samt
    // Sales in den Function-Speicher – bei 5000 Verkäufern × 500 Artikeln sind das Millionen
    // Zeilen, die weder in Speicher noch Timeout passen. Pro SOLD-Artikel zählt genau EIN
    // nicht stornierter Sale (LATERAL LIMIT 1), wie zuvor das .find() in JS – nicht die
    // Summe mehrerer, falls Altdaten je Artikel doppelte aktive Sales tragen sollten.
    const rows = await prisma.$queryRaw<
      { basarSellerId: string; commissionOverride: Prisma.Decimal | null; grossRevenue: Prisma.Decimal }[]
    >`
      SELECT bs."id" AS "basarSellerId",
             bs."commissionOverride",
             COALESCE(SUM(s."salePrice"), 0) AS "grossRevenue"
      FROM "BasarSeller" bs
      LEFT JOIN "Article" a
        ON a."basarSellerId" = bs."id" AND a."status" = 'SOLD'
      LEFT JOIN LATERAL (
        SELECT "salePrice"
        FROM "Sale"
        WHERE "articleId" = a."id" AND "isCancelled" = false
        ORDER BY "soldAt"
        LIMIT 1
      ) s ON true
      WHERE bs."basarId" = ${basarId}
      GROUP BY bs."id"
    `;

    const entryFeeAmt = Number(basar.entryFee);

    const settlements = rows.map((row) => {
      const commissionRate = Number(row.commissionOverride ?? basar.commissionPercent) / 100;
      const grossRevenue = Number(row.grossRevenue);
      const commissionAmount = Math.round(grossRevenue * commissionRate * 100) / 100;
      const netPayout = Math.max(0, grossRevenue - commissionAmount - entryFeeAmt);
      return {
        basarId,
        basarSellerId: row.basarSellerId,
        grossRevenue,
        commissionAmount,
        entryFeeAmount: entryFeeAmt,
        netPayout,
      };
    });

    // Neu erzeugen statt je Verkäufer upserten: 5000 einzelne Upserts sind 5000 Roundtrips
    // und liefen zuvor gestückelt in 50 Batches. delete+createMany sind zwei Statements in
    // einer Transaktion – atomar, keine halb geschriebenen Läufe. Settlement-IDs werden
    // dabei neu vergeben; nichts referenziert sie (Lookups laufen über basarSellerId).
    const [, createResult] = await prisma.$transaction([
      prisma.settlement.deleteMany({ where: { basarId } }),
      prisma.settlement.createMany({ data: settlements }),
    ]);

    return NextResponse.json({ created: createResult.count, total: rows.length });
  } catch (error) {
    console.error('POST /api/basars/[id]/settlements error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
