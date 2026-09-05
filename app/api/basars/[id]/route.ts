import { NextResponse } from 'next/server';
import { participationPayload } from '../../../lib/participation';
import { prisma } from '../../../lib/prisma';
import { requireAuth, requireAdmin } from '../../../lib/apiAuth';
import { buildBasarData, lockedFieldsForActiveBasar } from '../../../lib/basarPayload';

// GET /api/basars/:id – Admins bekommen die volle Verkäuferliste (Name, E-Mail);
// Seller/Mitarbeiter nur die eigene Teilnahme (myParticipation), keine fremden Daten.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { id } = await params;
    const isAdmin = auth.role === 'admin';

    const basar = await prisma.basar.findUnique({
      where: { id },
      include: {
        // Zaehlt nur aktive Teilnahmen – abgemeldete BasarSeller-Zeilen bleiben wegen der
        // Artikel-Historie erhalten, duerfen aber nicht gegen maxSellers zaehlen. Die Liste
        // `basarSellers` darunter ist bewusst *ungefiltert*: die Adminsicht zeigt auch
        // Abgemeldete (mit Kennzeichen „inaktiv"). Wer die Laenge der Liste meint, darf
        // deshalb nicht diese Zahl nehmen.
        _count: { select: { basarSellers: { where: { isActive: true } }, sales: true } },
        ...(isAdmin
          ? {
              basarSellers: {
                include: {
                  seller: { select: { sellerId: true, firstName: true, lastName: true, email: true } },
                  _count: { select: { articles: true } },
                },
                orderBy: { sellerId: 'asc' as const },
              },
            }
          : {}),
      },
    });

    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });

    if (isAdmin || !auth.sellerId) {
      return NextResponse.json(basar);
    }

    // isOrga wird aus der Datenbank gelesen, nicht aus dem Token: das Kennzeichen setzt der
    // Admin jederzeit, ein Token behielte den alten Wert bis zur nächsten Anmeldung.
    const [myParticipation, seller] = await Promise.all([
      prisma.basarSeller.findUnique({
        where: { basarId_sellerId: { basarId: id, sellerId: auth.sellerId } },
        select: { isActive: true, activatedAt: true },
      }),
      prisma.seller.findUnique({ where: { sellerId: auth.sellerId }, select: { isOrga: true } }),
    ]);

    // Aufgelöst ausliefern, damit keine Oberfläche das Orga-Kennzeichen selbst auswerten muss.
    return NextResponse.json({ ...basar, myParticipation: participationPayload(seller, myParticipation) });
  } catch (error) {
    console.error('GET /api/basars/[id] error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

// PUT /api/basars/:id – update basar (admin only; nicht mehr, wenn CLOSED, und
// während ACTIVE nur noch redaktionell – siehe lockedFieldsForActiveBasar)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const { id } = await params;
    const basar = await prisma.basar.findUnique({ where: { id } });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });
    if (basar.status === 'CLOSED') {
      return NextResponse.json({ error: 'Geschlossene Basare können nicht bearbeitet werden' }, { status: 400 });
    }

    const body = await request.json();
    const result = buildBasarData(body, 'update', basar);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (basar.status === 'ACTIVE') {
      const locked = lockedFieldsForActiveBasar(result.data);
      if (locked.length > 0) {
        return NextResponse.json(
          { error: 'Provision, Standgebühr und Limits können während eines laufenden Basars nicht mehr geändert werden' },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.basar.update({
      where: { id },
      data: result.data as Parameters<typeof prisma.basar.update>[0]['data'],
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/basars/[id] error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
