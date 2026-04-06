import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Nur Admins dürfen diese Aktion ausführen' }, { status: 403 });
    }

    const { sellerId } = await request.json();
    if (!sellerId) return NextResponse.json({ error: 'Seller ID fehlt' }, { status: 400 });

    const seller = await prisma.seller.findUnique({
      where: { sellerId: typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId },
    });
    if (!seller) return NextResponse.json({ error: 'Verkäufer nicht gefunden' }, { status: 404 });

    const updated = await prisma.seller.update({
      where: { sellerId: seller.sellerId },
      data: { isCashier: !seller.isCashier },
    });

    return NextResponse.json({
      message: updated.isCashier ? 'Kassierer-Status aktiviert' : 'Kassierer-Status deaktiviert',
      isCashier: updated.isCashier,
    });
  } catch (error) {
    console.error('Error toggling cashier status:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
