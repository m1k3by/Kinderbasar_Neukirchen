import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET!;

// GET /api/basars/:id/settlements/:sellerIdParam
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sellerIdParam: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { id: basarId, sellerIdParam } = await params;
    const sellerId = parseInt(sellerIdParam, 10);

    // Sellers can only see their own
    if (decoded.role !== 'admin' && decoded.sellerId !== sellerId) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    const basarSeller = await prisma.basarSeller.findUnique({
      where: { basarId_sellerId: { basarId, sellerId } },
      include: {
        settlement: true,
        seller: { select: { firstName: true, lastName: true, sellerId: true, email: true } },
        articles: {
          include: { sale: { select: { salePrice: true, soldAt: true, isCancelled: true } } },
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
