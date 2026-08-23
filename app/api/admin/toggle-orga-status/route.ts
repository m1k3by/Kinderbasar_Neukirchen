import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/apiAuth';

// POST /api/admin/toggle-orga-status – Orga-Kennzeichen eines Mitarbeiters umschalten.
// Wirkt an genau zwei Stellen: Teilnahme gilt in jedem Basar als aktiv (app/lib/participation.ts)
// und es greift kein Artikellimit (app/lib/articleLimits.ts).
export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const { sellerId } = await request.json();
    if (!sellerId) return NextResponse.json({ error: 'Seller ID fehlt' }, { status: 400 });

    const seller = await prisma.seller.findUnique({
      where: { sellerId: typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId },
    });
    if (!seller) return NextResponse.json({ error: 'Verkäufer nicht gefunden' }, { status: 404 });

    // Orga ist ein Zusatz zum Mitarbeiter, kein eigenständiger Rang. Ohne diese Prüfung
    // könnte ein reiner Verkäufer unbegrenzt Artikel anlegen und wäre überall angemeldet –
    // beides umgeht genau die Grenzen, für die es die Verkäuferrolle gibt.
    if (!seller.isEmployee && !seller.isOrga) {
      return NextResponse.json(
        { error: 'Orga kann nur für Mitarbeiter gesetzt werden. Bitte zuerst zu Mitarbeiter machen.' },
        { status: 400 }
      );
    }

    const updated = await prisma.seller.update({
      where: { sellerId: seller.sellerId },
      data: { isOrga: !seller.isOrga },
    });

    return NextResponse.json({
      message: updated.isOrga
        ? 'Orga aktiviert – überall angemeldet, kein Artikellimit'
        : 'Orga deaktiviert',
      isOrga: updated.isOrga,
    });
  } catch (error) {
    console.error('POST /api/admin/toggle-orga-status error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
