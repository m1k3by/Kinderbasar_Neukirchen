import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/apiAuth';

export async function POST(_request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    // Reset all sellers status
    await prisma.seller.updateMany({
      data: { sellerStatusActive: false },
    });

    return NextResponse.json({ success: true, message: 'Alle Verkäufer Status wurden zurückgesetzt.' });
  } catch (error: any) {
    console.error('Error resetting seller status:', error);
    return NextResponse.json(
      { error: 'Fehler beim Zurücksetzen der Verkäufer Status' },
      { status: 500 }
    );
  }
}
