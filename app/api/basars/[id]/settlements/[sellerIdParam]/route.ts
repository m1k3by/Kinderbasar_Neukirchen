import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { requireAuth } from '../../../../../lib/apiAuth';

// GET /api/basars/:id/settlements/:sellerIdParam
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sellerIdParam: string }> }
) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { id: basarId, sellerIdParam } = await params;
    const sellerId = parseInt(sellerIdParam, 10);

    // Sellers can only see their own
    if (auth.role !== 'admin' && auth.sellerId !== sellerId) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    const basarSeller = await prisma.basarSeller.findUnique({
      where: { basarId_sellerId: { basarId, sellerId } },
      include: {
        settlement: true,
        seller: { select: { firstName: true, lastName: true, sellerId: true, email: true } },
        articles: {
          include: { sales: { select: { salePrice: true, soldAt: true, isCancelled: true } } },
          orderBy: { status: 'asc' },
        },
      },
    });

    if (!basarSeller) return NextResponse.json({ error: 'Verkäufer nicht in diesem Basar' }, { status: 404 });

    return NextResponse.json({ basarSeller });
  } catch (error) {
    console.error('GET /api/basars/[id]/settlements/[sellerIdParam] error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
