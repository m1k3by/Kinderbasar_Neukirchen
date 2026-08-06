import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAuth } from '../../../../lib/apiAuth';
import { isActivationOpen } from '../../../../lib/basarWindows';

// PUT /api/basars/:id/participation – seller/employee an- oder abmelden für genau
// diesen Basar. Ersetzt PUT /api/sellers/seller-status, das ein globales
// Seller.sellerStatusActive umschaltete und damit nicht zwischen Basaren
// unterscheiden konnte.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { id: basarId } = await params;
    const body = await request.json();
    const { sellerId: sellerIdInput, isActive } = body;

    if (typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive (boolean) ist ein Pflichtfeld' }, { status: 400 });
    }

    const sellerId = sellerIdInput !== undefined
      ? (typeof sellerIdInput === 'string' ? parseInt(sellerIdInput, 10) : sellerIdInput)
      : auth.sellerId;

    if (!sellerId || isNaN(sellerId)) {
      console.log('[PARTICIPATION] Failed: Invalid sellerId', { sellerIdInput, ip });
      return NextResponse.json({ error: 'Ungültige Verkäufer-ID' }, { status: 400 });
    }

    // Self-or-admin: non-admins may only change their own participation.
    if (auth.role !== 'admin' && auth.sellerId !== sellerId) {
      console.log('[PARTICIPATION] Failed: sellerId mismatch', { sellerId, callerSellerId: auth.sellerId, ip });
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    console.log('[PARTICIPATION] Attempt:', { basarId, sellerId, requestedActive: isActive, ip, timestamp: new Date().toISOString() });

    const [basar, seller] = await Promise.all([
      prisma.basar.findUnique({ where: { id: basarId } }),
      prisma.seller.findUnique({ where: { sellerId } }),
    ]);

    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });
    if (!seller) return NextResponse.json({ error: 'Verkäufer nicht gefunden' }, { status: 404 });

    const existing = await prisma.basarSeller.findUnique({
      where: { basarId_sellerId: { basarId, sellerId } },
    });

    if (isActive && !(existing?.isActive)) {
      // Nur beim (Re-)Aktivieren prüfen – Abmelden ist immer erlaubt.
      if (auth.role !== 'admin') {
        if (basar.isArchived || basar.status === 'CLOSED' || basar.status === 'DRAFT') {
          return NextResponse.json(
            { error: 'Für diesen Basar ist derzeit keine Teilnahme möglich.' },
            { status: 403 }
          );
        }

        if (!isActivationOpen(basar, seller.isEmployee)) {
          console.log('[PARTICIPATION] Failed: activation window closed', { basarId, sellerId, isEmployee: seller.isEmployee, ip });
          return NextResponse.json(
            {
              error: seller.isEmployee
                ? 'Die Aktivierung ist derzeit nicht möglich. Der Aktivierungszeitraum für Mitarbeiter ist geschlossen.'
                : 'Die Aktivierung ist derzeit nicht möglich. Der Aktivierungszeitraum für Verkäufer ist geschlossen.',
            },
            { status: 403 }
          );
        }

        if (!seller.isEmployee) {
          const activeSellers = await prisma.basarSeller.count({
            where: { basarId, isActive: true, seller: { isEmployee: false } },
          });
          if (activeSellers >= basar.maxSellers) {
            console.log('[PARTICIPATION] Failed: capacity reached', { basarId, sellerId, activeSellers, maxSellers: basar.maxSellers, ip });
            return NextResponse.json(
              { error: `Die maximale Anzahl von ${basar.maxSellers} Verkäufern für diesen Basar ist bereits erreicht.` },
              { status: 400 }
            );
          }
        }
      }
    }

    const basarSeller = await prisma.basarSeller.upsert({
      where: { basarId_sellerId: { basarId, sellerId } },
      update: { isActive, ...(isActive ? { activatedAt: new Date() } : {}) },
      create: { basarId, sellerId, isActive, activatedAt: isActive ? new Date() : null },
    });

    console.log('[PARTICIPATION] Success:', { basarId, sellerId, newActive: basarSeller.isActive, ip });

    return NextResponse.json({ success: true, isActive: basarSeller.isActive });
  } catch (error: any) {
    console.error('[PARTICIPATION] Exception:', { error: error.message, stack: error.stack?.substring(0, 200), ip });
    return NextResponse.json({ error: 'Fehler beim Aktualisieren der Teilnahme' }, { status: 500 });
  }
}
