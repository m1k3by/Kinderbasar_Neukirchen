import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/apiAuth';

const SELLER = { sellerId: true, firstName: true, lastName: true } as const;

/**
 * GET /api/admin/article-check – Suchbestand für die manuelle Suche im Etiketten-Check.
 *
 * Jeder bekannte QR-Code genau einmal, über alle Basare und das Archiv. Das Archiv geht vor:
 * es trägt die aktuellen Etikettdaten. Artikel ohne Archiveintrag (Altbestand) werden ergänzt,
 * damit auch deren Etiketten auffindbar bleiben.
 *
 * Kein Status im Ergebnis: die Suche soll verkaufte Artikel genauso finden wie verfügbare –
 * geprüft wird das Etikett, nicht die Verkäuflichkeit.
 *
 * ponytail: lädt den ganzen Bestand (Stand 10.2026 rund 2.600 Codes, ~300 KB JSON) in einem
 * Rutsch, wie es die Kasse mit dem scan-cache auch tut. Wird das spürbar langsam, auf eine
 * Abfrage pro Verkäufernummer umstellen.
 */
export async function GET() {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const [archive, articles] = await Promise.all([
      prisma.sellerArticle.findMany({
        where: { qrCode: { not: null } },
        select: { qrCode: true, title: true, sizeLabel: true, price: true, seller: { select: SELLER } },
      }),
      prisma.article.findMany({
        orderBy: { createdAt: 'desc' },
        distinct: ['qrCode'],
        select: {
          qrCode: true,
          title: true,
          sizeLabel: true,
          price: true,
          basarSeller: { select: { seller: { select: SELLER } } },
        },
      }),
    ]);

    type Row = { qrCode: string; title: string; sizeLabel?: string; price: number; sellerId: number; sellerName: string };
    const byCode = new Map<string, Row>();

    for (const a of archive) {
      if (!a.qrCode) continue;
      byCode.set(a.qrCode, {
        qrCode: a.qrCode,
        title: a.title,
        sizeLabel: a.sizeLabel ?? undefined,
        price: Number(a.price),
        sellerId: a.seller.sellerId,
        sellerName: `${a.seller.firstName} ${a.seller.lastName}`,
      });
    }
    for (const a of articles) {
      if (byCode.has(a.qrCode)) continue;
      const s = a.basarSeller.seller;
      byCode.set(a.qrCode, {
        qrCode: a.qrCode,
        title: a.title,
        sizeLabel: a.sizeLabel ?? undefined,
        price: Number(a.price),
        sellerId: s.sellerId,
        sellerName: `${s.firstName} ${s.lastName}`,
      });
    }

    return NextResponse.json({ articles: [...byCode.values()] });
  } catch (error) {
    console.error('GET /api/admin/article-check error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
