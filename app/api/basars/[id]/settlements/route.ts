import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// GET /api/basars/:id/settlements – list all settlements for this basar
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { id: basarId } = await params;

    // Sellers can only see their own settlement
    if (decoded.role !== 'admin') {
      const sellerId: number = decoded.sellerId;
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
      orderBy: { basarSeller: { sellerNumber: 'asc' } },
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
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Nur Admins dürfen Abrechnungen erstellen' }, { status: 403 });
    }

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
          include: { sale: true },
        },
      },
    });

    const created = [];
    for (const bs of basarSellers) {
      const commissionRate = Number(bs.commissionOverride ?? basar.commissionPercent) / 100;
      const entryFeeAmt = Number(basar.entryFee);

      const grossRevenue = bs.articles
        .filter(a => a.status === 'SOLD' && a.sale && !a.sale.isCancelled)
        .reduce((sum, a) => sum + Number(a.sale!.salePrice), 0);

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
