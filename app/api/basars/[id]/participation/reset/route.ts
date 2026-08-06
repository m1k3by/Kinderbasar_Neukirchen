import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { requireAdmin } from '../../../../../lib/apiAuth';

// POST /api/basars/:id/participation/reset – deaktiviert die Teilnahme aller
// Verkäufer an genau diesem Basar (admin only). Ersetzt den globalen
// POST /api/admin/reset-seller-status, der Seller.sellerStatusActive
// basarübergreifend auf false setzte.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const { id: basarId } = await params;
    const basar = await prisma.basar.findUnique({ where: { id: basarId } });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });

    const result = await prisma.basarSeller.updateMany({
      where: { basarId, isActive: true },
      data: { isActive: false },
    });

    console.log('[PARTICIPATION-RESET]', { basarId, reset: result.count, timestamp: new Date().toISOString() });

    return NextResponse.json({ success: true, message: `Teilnahme von ${result.count} Verkäufern wurde zurückgesetzt.` });
  } catch (error: any) {
    console.error('POST /api/basars/[id]/participation/reset error:', error);
    return NextResponse.json({ error: 'Fehler beim Zurücksetzen der Teilnahme' }, { status: 500 });
  }
}
