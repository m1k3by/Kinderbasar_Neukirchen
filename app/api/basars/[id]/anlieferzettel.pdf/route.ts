import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/apiAuth';
import { matchesParticipantFilter, type ParticipantFilter } from '../../../../lib/participation';
import { buildAnlieferzettel } from '../../../../lib/anlieferzettel';
import { pdfResponse, slug } from '../../../../lib/settlementPdf';

// Anlieferzettel: ein A4-Blatt quer pro Person, in einer Datei (app/lib/anlieferzettel.ts).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Die beiden Mengen, zwischen denen beim Drucken gewählt wird. Dieselben Schlüssel wie der
 * Listenfilter auf /admin/basars/[id] – die Zahl am Knopf dort und die Seitenzahl hier
 * kommen aus derselben Funktion (matchesParticipantFilter) und können nicht auseinanderlaufen.
 */
const SETS: Partial<Record<ParticipantFilter, string>> = {
  activated: 'angemeldet',
  withArticles: 'mit-artikeln',
};

// GET /api/basars/:id/anlieferzettel.pdf?set=activated|withArticles (Admin)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    // Kein stiller Fallback: ein Tippfehler im Parameter darf nicht still „alle" drucken.
    const set = new URL(request.url).searchParams.get('set') as ParticipantFilter | null;
    if (!set || !SETS[set]) {
      return NextResponse.json({ error: 'set muss activated oder withArticles sein' }, { status: 400 });
    }

    const { id: basarId } = await params;
    const basar = await prisma.basar.findUnique({ where: { id: basarId }, select: { title: true } });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });

    // Alle Zeilen des Basars laden und erst hier filtern, statt die Regel als Prisma-`where`
    // ein zweites Mal aufzuschreiben. Orga ohne BasarSeller-Zeile kann in diesem Basar keine
    // Artikel haben (die Zeile entsteht mit dem ersten Artikel) und fällt damit richtig aus
    // beiden Mengen.
    const rows = await prisma.basarSeller.findMany({
      where: { basarId },
      select: {
        isActive: true,
        seller: { select: { sellerId: true, isOrga: true, isEmployee: true } },
        _count: { select: { articles: true } },
      },
      orderBy: { sellerId: 'asc' },
    });

    const selected = rows
      .filter(r => matchesParticipantFilter(
        { activated: r.isActive, viaOrga: r.seller.isOrga, _count: r._count },
        set
      ))
      .map(r => r.seller);

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
