import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';

export async function GET(request: Request) {
  try {
    const sellers = await prisma.seller.findMany({
      select: {
        sellerId: true,
        sellerStatusActive: true,
        firstName: true,
        lastName: true,
        email: true,
        isEmployee: true,
        createdAt: true,
        qrCode: true,
        barcode: true,
        taskSignups: {
          include: {
            task: true,
          },
        },
        cakes: true,
      },
    });

    return NextResponse.json(sellers);
  } catch (error: any) {
    console.error('Error fetching sellers:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden der Verkäufer' },
      { status: 500 }
    );
  }
}