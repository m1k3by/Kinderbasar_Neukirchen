import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/apiAuth';

/**
 * Einladungen in einen Testbasar (Basar.isTest, app/lib/basarAccess.ts). Nur der Admin.
 *
 * Einladen heißt *sehen dürfen*, nicht teilnehmen: Eingeladene finden den Basar danach in
 * ihrer Übersicht und melden sich dort selbst an, wie bei jedem Basar.
 */

async function loadTestBasar(basarId: string) {
  const basar = await prisma.basar.findUnique({ where: { id: basarId }, select: { isTest: true } });
  if (!basar) return { response: NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 }) };
  // In einen normalen Basar einzuladen hätte keine Wirkung – den sehen ohnehin alle. Lieber
  // laut ablehnen, als eine Einladung anzulegen, die so aussieht, als bedeute sie etwas.
  if (!basar.isTest) {
    return { response: NextResponse.json({ error: 'Einladungen gibt es nur für Testbasare' }, { status: 400 }) };
  }
  return { response: null };
}

// GET /api/basars/:id/invites – wer ist eingeladen?
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;
    const { id: basarId } = await params;

    const invites = await prisma.basarInvite.findMany({
      where: { basarId },
      select: {
        createdAt: true,
        seller: { select: { sellerId: true, firstName: true, lastName: true, isEmployee: true, isOrga: true } },
      },
      orderBy: { sellerId: 'asc' },
    });

    return NextResponse.json({ invites });
  } catch (error) {
    console.error('GET /api/basars/[id]/invites error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

/**
 * POST /api/basars/:id/invites  Body: { sellerIds: number[] }
 * Antwort nennt, wer neu eingeladen wurde und welche Nummern es nicht gibt – eine vertippte
 * Nummer soll auffallen, nicht stillschweigend fehlen.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;
    const { id: basarId } = await params;

    const body = await request.json().catch(() => ({}));
    const raw: unknown[] = Array.isArray(body.sellerIds) ? body.sellerIds : [];
    const sellerIds = [...new Set(raw.map(Number).filter(n => Number.isInteger(n) && n > 0))];
    if (sellerIds.length === 0) {
      return NextResponse.json({ error: 'Keine gültige Verkäufernummer angegeben' }, { status: 400 });
    }

    const { response } = await loadTestBasar(basarId);
    if (response) return response;

    const existing = await prisma.seller.findMany({
      where: { sellerId: { in: sellerIds } },
      select: { sellerId: true },
    });
    const known = new Set(existing.map(s => s.sellerId));
    const unknown = sellerIds.filter(id => !known.has(id));

    // skipDuplicates: wer schon eingeladen ist, bleibt es – kein Fehler beim zweiten Mal.
    const { count } = await prisma.basarInvite.createMany({
      data: [...known].map(sellerId => ({ basarId, sellerId })),
      skipDuplicates: true,
    });

    return NextResponse.json({ added: count, unknown });
  } catch (error) {
    console.error('POST /api/basars/[id]/invites error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

/**
 * DELETE /api/basars/:id/invites?sellerId=1046 – Einladung zurücknehmen.
 * Artikel, Anmeldung und Verkäufe der Person bleiben unangetastet; sie sieht den Basar nur
 * nicht mehr. `basarId` und `sellerId` stehen beide im where – ein deleteMany ohne sie
 * löschte die Einladungen aller Testbasare und liefert dabei genauso 200.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;
    const { id: basarId } = await params;

    const sellerId = Number(new URL(request.url).searchParams.get('sellerId'));
    if (!Number.isInteger(sellerId) || sellerId <= 0) {
      return NextResponse.json({ error: 'sellerId ist erforderlich' }, { status: 400 });
    }

    const { count } = await prisma.basarInvite.deleteMany({ where: { basarId, sellerId } });
    return NextResponse.json({ removed: count });
  } catch (error) {
    console.error('DELETE /api/basars/[id]/invites error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
