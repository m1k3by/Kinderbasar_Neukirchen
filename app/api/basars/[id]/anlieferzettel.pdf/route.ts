import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/apiAuth';
import { matchesSheetSet, type SheetSet } from '../../../../lib/participation';
import { orgaPlaceholders } from '../../../../lib/orgaPlaceholders';
import { buildAnlieferzettel } from '../../../../lib/anlieferzettel';
import { pdfResponse, slug } from '../../../../lib/settlementPdf';

// Anlieferzettel: ein A4-Blatt quer pro Person, in einer Datei (app/lib/anlieferzettel.ts).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Die beiden Mengen, zwischen denen beim Drucken gewählt wird – jeweils plus alle Orga
 * (matchesSheetSet). Die Zahl am Knopf auf /admin/basars/[id] kommt aus derselben Funktion
 * und denselben Platzhaltern und kann nicht von der Seitenzahl hier abweichen.
 */
const SETS: Record<SheetSet, string> = {
  activated: 'angemeldet-und-orga',
  withArticles: 'mit-artikeln-und-orga',
};

// GET /api/basars/:id/anlieferzettel.pdf?set=activated|withArticles (Admin)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    // Kein stiller Fallback: ein Tippfehler im Parameter darf nicht still „alle" drucken.
    const set = new URL(request.url).searchParams.get('set');
    if (set !== 'activated' && set !== 'withArticles') {
      return NextResponse.json({ error: 'set muss activated oder withArticles sein' }, { status: 400 });
    }

    const { id: basarId } = await params;
    const basar = await prisma.basar.findUnique({ where: { id: basarId }, select: { title: true } });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });

    // Alle Zeilen des Basars laden und erst hier filtern, statt die Regel als Prisma-`where`
    // ein zweites Mal aufzuschreiben.
    const rows = await prisma.basarSeller.findMany({
      where: { basarId },
      select: {
        isActive: true,
        seller: { select: { sellerId: true, isOrga: true, isEmployee: true } },
        _count: { select: { articles: true } },
      },
    });

    // Orga ohne Zeile in diesem Basar (#1463): dieselben Platzhalter wie in der Liste, sonst
    // zählte der Knopf sie mit und das PDF hätte eine Seite zu wenig.
    const candidates = [
      ...rows.map(r => ({ activated: r.isActive, viaOrga: r.seller.isOrga, _count: r._count, seller: r.seller })),
      ...(await orgaPlaceholders(basarId)),
    ];

    // Sortiert wird hier, nicht in der Abfrage: die Platzhalter kommen aus einer zweiten
    // Quelle dazu. Die Reihenfolge der Blätter ist die Reihenfolge am Anlieferungstisch.
    const selected = candidates
      .filter(c => matchesSheetSet(c, set))
      .map(c => ({ sellerId: c.seller.sellerId, isOrga: c.seller.isOrga, isEmployee: c.seller.isEmployee }))
      .sort((a, b) => a.sellerId - b.sellerId);

    if (selected.length === 0) {
      return NextResponse.json({ error: 'In dieser Auswahl ist niemand' }, { status: 409 });
    }

    return pdfResponse(
      buildAnlieferzettel(selected).output('arraybuffer'),
      `anlieferzettel-${slug(basar.title)}-${selected.length}-${SETS[set]}.pdf`
    );
  } catch (error) {
    console.error('GET /api/basars/[id]/anlieferzettel.pdf error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
