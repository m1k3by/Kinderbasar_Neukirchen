import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../lib/apiAuth';

// GET /api/me – the calling user's own record only (no qrCode/barcode blobs, no nested
// taskSignups/cakes). Replaces the old pattern of fetching the entire /api/sellers table
// just to find "myself" in it (see app/api/sellers/route.ts for the full-list endpoint,
// which is now admin-only).
export async function GET() {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    // Admin tokens have no sellerId – there is no Seller row to look up.
    if (auth.role === 'admin') {
      return NextResponse.json({ role: 'admin' });
    }

    if (!auth.sellerId) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const seller = await prisma.seller.findUnique({
      where: { sellerId: auth.sellerId },
      select: {
        sellerId: true,
        firstName: true,
        lastName: true,
        email: true,
        isEmployee: true,
        isCashier: true,
        isOrga: true,
      },
    });

    if (!seller) {
      return NextResponse.json({ error: 'Verkäufer nicht gefunden' }, { status: 404 });
    }

    return NextResponse.json(seller);
  } catch (error) {
    console.error('GET /api/me error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
