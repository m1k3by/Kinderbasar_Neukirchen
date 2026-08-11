import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAuth } from '../../../../lib/apiAuth';
import { buildLabelSheet, buildCalibrationSheet, LABELS_PER_SHEET, type LabelData } from '../../../../lib/labels';

// Etiketten-PDF wird serverseitig erzeugt, damit das Ergebnis auf jedem Gerät
// identisch ist. Siehe docs/spec-etiketten-pdf.md – der frühere Weg über
// window.print() lieferte auf iOS einen um 13 % geschrumpften Bogen.
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
      // Die Artikelliste ändert sich jederzeit; ein zwischengespeicherter Bogen
      // führt zu Etiketten ohne Gegenstück in der Datenbank.
      'Cache-Control': 'no-store',
    },
  });
}

// GET /api/basars/:id/labels.pdf – Etikettenbogen als PDF
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;
    const { id: basarId } = await params;

    const url = new URL(request.url);

    // Testseite braucht weder Basar noch Artikel – nur eine gültige Anmeldung.
    if (url.searchParams.get('calibration') === '1') {
      const doc = buildCalibrationSheet();
      return pdfResponse(doc.output('arraybuffer'), 'etiketten-testseite.pdf');
    }

    // Unbrauchbare Werte fallen auf 0 zurück, nicht auf den letzten Platz: ein Tippfehler
    // soll den Bogen vorne beginnen lassen, nicht 23 Etiketten verschenken.
    const fromParam = parseInt(url.searchParams.get('from') || '0', 10);
    const from =
      Number.isFinite(fromParam) && fromParam >= 0 && fromParam < LABELS_PER_SHEET ? fromParam : 0;

    const requestedSeller = url.searchParams.get('sellerId');
    let sellerId: number;
    if (auth.role === 'admin') {
      const parsed = parseInt(requestedSeller || '', 10);
      if (!Number.isFinite(parsed)) {
        return NextResponse.json({ error: 'Parameter sellerId erforderlich' }, { status: 400 });
      }
      sellerId = parsed;
    } else {
      if (!auth.sellerId) {
        return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
      }
      // Verkäufer dürfen ausschließlich den eigenen Bogen erzeugen.
      if (requestedSeller && parseInt(requestedSeller, 10) !== auth.sellerId) {
        return NextResponse.json({ error: 'Nur eigene Etiketten' }, { status: 403 });
      }
      sellerId = auth.sellerId;
    }

    const basar = await prisma.basar.findUnique({
      where: { id: basarId },
      select: { id: true, title: true },
    });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });

    const basarSeller = await prisma.basarSeller.findUnique({
      where: { basarId_sellerId: { basarId, sellerId } },
      select: { id: true, sellerId: true },
    });
    if (!basarSeller) {
      return NextResponse.json({ error: 'Keine Teilnahme an diesem Basar' }, { status: 404 });
    }

    const articles = await prisma.article.findMany({
      where: { basarSellerId: basarSeller.id },
      select: { title: true, sizeLabel: true, gender: true, price: true, qrCode: true },
      orderBy: { createdAt: 'asc' },
    });
    if (articles.length === 0) {
      return NextResponse.json({ error: 'Keine Artikel vorhanden' }, { status: 409 });
    }

    const labels: LabelData[] = articles.map(a => ({
      title: a.title,
      sizeLabel: a.sizeLabel,
      gender: a.gender,
      price: Number(a.price),
      qrCode: a.qrCode,
    }));

    const doc = buildLabelSheet(labels, { sellerNr: basarSeller.sellerId, from });
    return pdfResponse(
      doc.output('arraybuffer'),
      `etiketten-${slug(basar.title)}-vk${basarSeller.sellerId}.pdf`
    );
  } catch (error) {
    console.error('GET /api/basars/[id]/labels.pdf error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
