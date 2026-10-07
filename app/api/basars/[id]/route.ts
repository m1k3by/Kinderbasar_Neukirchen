import { NextResponse } from 'next/server';
import { isParticipating, participationPayload } from '../../../lib/participation';
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
                  // isOrga muss mit heraus: ohne das Kennzeichen laesst sich die Teilnahme
                  // unten nicht aufloesen, und die Liste zeigte Orga-Personen als „inaktiv".
                  // isEmployee ebenso: die Verkaeuferliste im Reiter weist je Zeile MA/VK
                  // aus, und aus der uebrigen Antwort laesst sich das nicht ableiten.
                  seller: { select: { sellerId: true, firstName: true, lastName: true, email: true, isOrga: true, isEmployee: true } },
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
      // Adminsicht: Teilnahme aufgeloest ausliefern – dieselbe Regel wie bei myParticipation
      // weiter unten. Vorher ging `isActive` roh aus der Zeile hinaus, und die Oberfläche
      // hätte das Orga-Kennzeichen selbst auswerten müssen, um zur richtigen Anzeige zu
      // kommen. Genau das ist am 20.09.2026 aufgefallen: 10 Orga-Personen standen auf
      // /admin/basars/[id] als „inaktiv", obwohl sie in jedem Basar teilnehmen.
      // Der bedingte Spread im `include` oben nimmt Prisma die Typinferenz: `basarSellers`
      // kommt ohne die genestete `seller`-Relation heraus, obwohl die Abfrage sie mitlaedt.
      // Eng gefasste Zusicherung statt einer zweiten Abfrage – die Form garantiert das
      // `include` direkt darueber, und der Test prueft die Projektion.
      const adminRows = basar.basarSellers as unknown as
        ({ sellerId: number; isActive: boolean; seller: { isOrga: boolean } } & Record<string, unknown>)[] | undefined;

      if (!adminRows) return NextResponse.json(basar);

      const rows = adminRows.map((bs) => ({
        ...bs,
        // Roh aus der Zeile, *vor* dem Überschreiben darunter: zählt gegen maxSellers
        // und ist die Grundlage des Filters „aktiv angemeldet" (app/lib/participation.ts).
        activated: bs.isActive,
        isActive: isParticipating(bs.seller, bs),
        viaOrga: !!bs.seller.isOrga,
      }));

      // Orga ohne Zeile in diesem Basar. Orga gilt in jedem Basar als teilnehmend, auch ohne
      // BasarSeller-Zeile (app/lib/participation.ts) – die Zeile entsteht erst mit Anmeldung
      // oder erstem Artikel. Eine Liste, die nur aus Zeilen besteht, liess solche Personen
      // deshalb ganz weg (#1463, aufgefallen am 07.10.2026). Sie kommen als Platzhalter
      // dazu, *ohne* eine Zeile anzulegen: die Teilnahme bleibt abgeleitet, wie gewollt.
      // `none` mit basarId ist der Kern: ohne ihn stünde jede Orga-Person mit Zeile doppelt
      // drin, mit einer Zeile in *irgendeinem* Basar fehlte sie hier weiterhin.
      const orgaOhneZeile = await prisma.seller.findMany({
        where: { isOrga: true, basarSellers: { none: { basarId: id } } },
        select: { sellerId: true, firstName: true, lastName: true, email: true, isOrga: true, isEmployee: true },
      });
      const placeholders = orgaOhneZeile.map((seller) => ({
        // Kein cuid: die ID existiert nicht in der Datenbank. Die Seite nutzt sie nur als
        // React-Key, und das Präfix macht sie für jeden anderen Leser als Platzhalter kenntlich.
        id: `orga-${seller.sellerId}`,
        basarId: id,
        sellerId: seller.sellerId,
        activated: false,
        isActive: true,
        viaOrga: true,
        seller,
        _count: { articles: 0 },
      }));

      return NextResponse.json({
        ...basar,
        basarSellers: [...rows, ...placeholders].sort((a, b) => a.sellerId - b.sellerId),
      });
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
