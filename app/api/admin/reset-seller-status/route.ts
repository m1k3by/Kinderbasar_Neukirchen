import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { verifyToken } from '../../../lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Verify admin token
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });
    }

    try {
      const decoded = verifyToken(token) as any;
      if (decoded.role !== 'admin') {
        return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
      }
    } catch (err) {
      return NextResponse.json({ error: 'Ungültiger Token' }, { status: 401 });
    }

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
