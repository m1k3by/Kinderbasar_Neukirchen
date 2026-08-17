import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { requireAuth } from '../../../../../../lib/apiAuth';
import { buildSettlementPdf, type SettlementPdfArticle } from '../../../../../../lib/settlementPdf';

// Abrechnungs-PDF wird serverseitig erzeugt, damit das Ergebnis auf jedem Gerät identisch
// ist – siehe CLAUDE.md, Abschnitt "PDF & Druck". Ersetzt die beiden früheren
// Client-Generatoren in app/seller/basars/[id]/page.tsx und
// app/admin/basars/[id]/abrechnung/page.tsx.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Dateinamen-tauglicher ASCII-Slug (Content-Disposition verträgt keine Umlaute). */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'basar';
}

function pdfResponse(bytes: ArrayBuffer, filename: string) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Die Abrechnung kann neu generiert werden; ein zwischengespeichertes PDF könnte
      // veraltete Beträge zeigen.
      'Cache-Control': 'no-store',
    },
  });
}

// GET /api/basars/:id/settlements/:sellerIdParam/abrechnung.pdf
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sellerIdParam: string }> }
) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { id: basarId, sellerIdParam } = await params;
    const sellerId = parseInt(sellerIdParam, 10);

    // Autorisierung wie in der Nachbarroute settlements/[sellerIdParam]/route.ts: Verkäufer
    // dürfen ausschließlich die eigene Abrechnung sehen.
    if (auth.role !== 'admin' && auth.sellerId !== sellerId) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    const basar = await prisma.basar.findUnique({
      where: { id: basarId },
      select: { title: true, commissionPercent: true },
    });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });

    const basarSeller = await prisma.basarSeller.findUnique({
      where: { basarId_sellerId: { basarId, sellerId } },
      include: {
        settlement: true,
        seller: { select: { firstName: true, lastName: true, sellerId: true } },
        articles: {
          select: { title: true, sizeLabel: true, price: true, status: true, soldAt: true },
          orderBy: { status: 'asc' },
        },
      },
    });
    if (!basarSeller) {
      return NextResponse.json({ error: 'Verkäufer nicht in diesem Basar' }, { status: 404 });
    }
    if (!basarSeller.settlement) {
      return NextResponse.json({ error: 'Für diesen Verkäufer wurde noch keine Abrechnung erzeugt' }, { status: 409 });
    }

    const articles: SettlementPdfArticle[] = basarSeller.articles.map(a => ({
      title: a.title,
      sizeLabel: a.sizeLabel,
      price: Number(a.price),
      status: a.status,
      soldAt: a.soldAt ? a.soldAt.toISOString() : null,
    }));

    const doc = buildSettlementPdf({
      basarTitle: basar.title,
      commissionPercent: Number(basar.commissionPercent),
      sellerNr: basarSeller.seller.sellerId,
      sellerName: `${basarSeller.seller.firstName} ${basarSeller.seller.lastName}`,
      generatedAt: basarSeller.settlement.generatedAt.toISOString(),
      grossRevenue: Number(basarSeller.settlement.grossRevenue),
      commissionAmount: Number(basarSeller.settlement.commissionAmount),
      entryFeeAmount: Number(basarSeller.settlement.entryFeeAmount),
      netPayout: Number(basarSeller.settlement.netPayout),
      articles,
    });

    return pdfResponse(
      doc.output('arraybuffer'),
      `abrechnung-${slug(basar.title)}-vk${basarSeller.seller.sellerId}.pdf`
    );
  } catch (error) {
    console.error('GET /api/basars/[id]/settlements/[sellerIdParam]/abrechnung.pdf error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
