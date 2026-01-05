import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import prisma from '../../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Check if user is admin
    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Nur Admins dürfen diese Aktion ausführen' }, { status: 403 });
    }

    const { sellerId } = await request.json();

    if (!sellerId) {
      return NextResponse.json({ error: 'Seller ID fehlt' }, { status: 400 });
    }

    // Get current seller
    const seller = await prisma.seller.findUnique({
      where: { sellerId: typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId },
    });

    if (!seller) {
      return NextResponse.json({ error: 'Verkäufer nicht gefunden' }, { status: 404 });
    }

    // Check if trying to activate and limit is reached
    if (!seller.sellerStatusActive) {
      const MAX_SELLERS = parseInt(process.env.MAX_SELLERS || '80', 10);
      const activeSellerCount = await prisma.seller.count({
        where: { sellerStatusActive: true },
      });

      if (activeSellerCount >= MAX_SELLERS) {
        return NextResponse.json(
          { error: 'Maximale Anzahl aktiver Verkäufer erreicht' },
          { status: 400 }
        );
      }
    }

    // Toggle the seller status
    const updatedSeller = await prisma.seller.update({
      where: { sellerId: typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId },
      data: { sellerStatusActive: !seller.sellerStatusActive },
    });

    return NextResponse.json({
      message: updatedSeller.sellerStatusActive
        ? 'Verkäufer Status aktiviert'
        : 'Verkäufer Status deaktiviert',
      sellerStatusActive: updatedSeller.sellerStatusActive,
    });
  } catch (error) {
    console.error('Error toggling seller status:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
