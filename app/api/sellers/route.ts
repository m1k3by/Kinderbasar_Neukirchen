import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../lib/apiAuth';

// NOTE: this endpoint is used by several non-admin pages (employee/seller dashboards,
// the seller basar view) to look up the calling user's own record among the full list,
// so it is intentionally requireAuth (any authenticated role) rather than requireAdmin –
// see task write-up for details. It was previously fully unauthenticated.
export async function GET(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;

    const sellers = await prisma.seller.findMany({
      select: {
        sellerId: true,
        sellerStatusActive: true,
        firstName: true,
        lastName: true,
        email: true,
        isEmployee: true,
        isCashier: true,
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