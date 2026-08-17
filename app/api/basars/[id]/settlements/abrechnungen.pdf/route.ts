import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { requireAdmin } from '../../../../../lib/apiAuth';
import {
  drawSettlementPage,
  newSettlementDoc,
  pdfResponse,
  slug,
  type SettlementPdfArticle,
} from '../../../../../lib/settlementPdf';

// Sammelabrechnung: alle Verkäufer eines Basars in *einer* PDF-Datei, damit der Stapel in
// einem Druckauftrag rausgeht statt in 2000 Einzeldownloads. Layout kommt aus demselben
// Generator wie die Einzelabrechnung (app/lib/settlementPdf.ts) – siehe CLAUDE.md,
// Abschnitt "PDF & Druck".
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Gemessen mit 2000 Verkäufern à 30 Artikeln (4000 Seiten): ~14 s zeichnen, ~3 s
// serialisieren, 6,9 MB Ergebnis, 546 MB RSS. Die Standard-Function-Laufzeit reicht dafür
// nicht.
export const maxDuration = 300;

// Verkäufer werden in Blöcken geladen, damit nie alle Artikel aller Verkäufer gleichzeitig
// im Speicher liegen (2000 Verkäufer × 30 Artikel = 60 000 Zeilen).
// ponytail: das fertige PDF wird komplett im Speicher gehalten, bevor es rausgeht – jsPDF
// kann nicht streamen. Bei den oben gemessenen 546 MB RSS ist das Function-Speicherlimit
// (Standard 1024 MB) die eigentliche Obergrenze. Wird sie erreicht, ist der nächste Schritt
// entweder mehr Function-Speicher in vercel.json oder ein Hintergrundjob, der die Datei
// nach Blob-Storage schreibt.
const CHUNK = 50;

// GET /api/basars/:id/settlements/abrechnungen.pdf – alle Abrechnungen in einer Datei (Admin)
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const { id: basarId } = await params;

    const basar = await prisma.basar.findUnique({
      where: { id: basarId },
      select: { title: true, commissionPercent: true },
    });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });

    // Zuerst nur die Schlüssel holen und nach Verkäufernummer sortieren – so ist die
    // Reihenfolge im Stapel dieselbe wie in der Tabelle auf der Abrechnungsseite, und die
    // Sortierung bleibt unabhängig von der Blockgrenze deterministisch.
    const keys = await prisma.basarSeller.findMany({
      where: { basarId, settlement: { isNot: null } },
      select: { id: true, sellerId: true },
      orderBy: { sellerId: 'asc' },
    });
    if (keys.length === 0) {
      return NextResponse.json({ error: 'Für diesen Basar wurde noch keine Abrechnung erzeugt' }, { status: 409 });
    }

    const commissionPercent = Number(basar.commissionPercent);
    const doc = newSettlementDoc();
    let drawn = 0;

    for (let offset = 0; offset < keys.length; offset += CHUNK) {
      const ids = keys.slice(offset, offset + CHUNK).map(k => k.id);
      const block = await prisma.basarSeller.findMany({
        where: { id: { in: ids } },
        include: {
          settlement: true,
          seller: { select: { firstName: true, lastName: true, sellerId: true } },
          articles: {
            select: { title: true, sizeLabel: true, price: true, status: true, soldAt: true },
            orderBy: { status: 'asc' },
          },
        },
      });
      const byId = new Map(block.map(b => [b.id, b]));

      for (const id of ids) {
        const bs = byId.get(id);
        // settlement kann zwischen Schlüssel- und Detailabfrage gelöscht worden sein
        // (paralleles "Neu berechnen") – solche Verkäufer werden übersprungen statt die
        // ganze Datei scheitern zu lassen.
        if (!bs?.settlement) continue;

        // Erste gezeichnete Abrechnung landet auf der Startseite, jede weitere beginnt auf
        // einer neuen – sonst würde sie über die letzte Seite des Vorgängers gemalt.
        if (drawn > 0) doc.addPage();
        drawn++;

        const articles: SettlementPdfArticle[] = bs.articles.map(a => ({
          title: a.title,
          sizeLabel: a.sizeLabel,
          price: Number(a.price),
          status: a.status,
          soldAt: a.soldAt ? a.soldAt.toISOString() : null,
        }));

        drawSettlementPage(doc, {
          basarTitle: basar.title,
          commissionPercent,
          sellerNr: bs.seller.sellerId,
          sellerName: `${bs.seller.firstName} ${bs.seller.lastName}`,
          generatedAt: bs.settlement.generatedAt.toISOString(),
          grossRevenue: Number(bs.settlement.grossRevenue),
          commissionAmount: Number(bs.settlement.commissionAmount),
          entryFeeAmount: Number(bs.settlement.entryFeeAmount),
          netPayout: Number(bs.settlement.netPayout),
          articles,
        });
      }
    }

    if (drawn === 0) {
      return NextResponse.json({ error: 'Für diesen Basar wurde noch keine Abrechnung erzeugt' }, { status: 409 });
    }

    return pdfResponse(
      doc.output('arraybuffer'),
      `abrechnungen-${slug(basar.title)}-${drawn}-verkaeufer.pdf`
    );
  } catch (error) {
    console.error('GET /api/basars/[id]/settlements/abrechnungen.pdf error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
