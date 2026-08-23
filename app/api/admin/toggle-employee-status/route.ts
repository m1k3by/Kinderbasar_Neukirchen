import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/apiAuth';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const body = await request.json();
    const { sellerId } = body;

    if (!sellerId) {
      return NextResponse.json({ error: 'Verkäufer-ID ist erforderlich' }, { status: 400 });
    }

    // Parse sellerId to integer
    const sellerIdInt = typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId;

    if (isNaN(sellerIdInt)) {
      return NextResponse.json({ error: 'Ungültige Verkäufer-ID' }, { status: 400 });
    }

    // Get current seller
    const seller = await prisma.seller.findUnique({
      where: { sellerId: sellerIdInt },
    });

    if (!seller) {
      return NextResponse.json({ error: 'Verkäufer nicht gefunden' }, { status: 404 });
    }

    const nextIsEmployee = !seller.isEmployee;

    // Orga ist ein Zusatz zum Mitarbeiter und fällt beim Zurückstufen mit weg. Bliebe das
    // Kennzeichen stehen, hätte ein reiner Verkäufer weiterhin kein Artikellimit und wäre in
    // jedem Basar angemeldet – unsichtbar, weil die Oberfläche den Orga-Schalter für
    // Verkäufer gar nicht anzeigt.
    const updatedSeller = await prisma.seller.update({
      where: { sellerId: sellerIdInt },
      data: { isEmployee: nextIsEmployee, ...(nextIsEmployee ? {} : { isOrga: false }) },
    });

    const orgaRemoved = !nextIsEmployee && seller.isOrga;

    return NextResponse.json({ 
      success: true, 
      isEmployee: updatedSeller.isEmployee,
      isOrga: updatedSeller.isOrga,
      message: `Rolle wurde geändert zu ${updatedSeller.isEmployee ? 'Mitarbeiter' : 'Verkäufer'}`
        + (orgaRemoved ? ' – Orga-Kennzeichen wurde dabei entfernt' : '')
    });
  } catch (error: any) {
    console.error('Error toggling employee status:', error);
    return NextResponse.json(
      { error: 'Fehler beim Ändern der Rolle' },
      { status: 500 }
    );
  }
}
