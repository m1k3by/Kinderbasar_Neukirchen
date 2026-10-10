import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/apiAuth';

const SELLER = {
  sellerId: true,
  firstName: true,
  lastName: true,
  email: true,
  isEmployee: true,
  isOrga: true,
  isCashier: true,
} as const;

/**
 * GET /api/admin/article-check/:qrCode – Etiketten-Prüfung für den Admin (/admin/etiketten-check).
 *
 * Bewusst getrennt von GET /api/articles/scan/:qrCode: die Kasse sucht nur in einem *aktiven*
 * Basar und lehnt Verkauftes ab, denn sie soll verkaufen. Diese Route soll dagegen jederzeit
 * zeigen, *was* ein Etikett ist – vor, während und nach einem Basar. Sie liefert deshalb jedes
 * Vorkommen über alle Basare (QR-Codes bleiben über Basare hinweg gleich, siehe CLAUDE.md)
 * plus den Archiveintrag, und schreibt nichts.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ qrCode: string }> }) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const { qrCode } = await params;

    const [archive, articles] = await Promise.all([
      prisma.sellerArticle.findUnique({
        where: { qrCode },
        select: { title: true, sizeLabel: true, gender: true, price: true, seller: { select: SELLER } },
      }),
      prisma.article.findMany({
        where: { qrCode },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          sizeLabel: true,
          gender: true,
          price: true,
          status: true,
          soldAt: true,
          basarSeller: {
            select: {
              seller: { select: SELLER },
              basar: { select: { id: true, title: true, status: true, isArchived: true } },
            },
          },
          // Der gültige Verkauf (nicht storniert) – sein Preis kann vom Etikettenpreis abweichen.
          sales: {
            where: { isCancelled: false },
            orderBy: { soldAt: 'desc' },
            take: 1,
            select: { salePrice: true, soldAt: true },
          },
        },
      }),
    ]);

    if (!archive && articles.length === 0) {
      return NextResponse.json(
        { error: 'Zu diesem Code gibt es keinen Artikel.' },
        { status: 404 }
      );
    }

    const seller = archive?.seller ?? articles[0].basarSeller.seller;

    return NextResponse.json({
      qrCode,
      seller,
      archive: archive
        ? { title: archive.title, sizeLabel: archive.sizeLabel, gender: archive.gender, price: Number(archive.price) }
        : null,
      occurrences: articles.map(a => ({
        articleId: a.id,
        title: a.title,
        sizeLabel: a.sizeLabel,
        gender: a.gender,
        price: Number(a.price),
        status: a.status,
        soldAt: a.soldAt,
        salePrice: a.sales[0] ? Number(a.sales[0].salePrice) : null,
        basar: a.basarSeller.basar,
      })),
    });
  } catch (error) {
    console.error('GET /api/admin/article-check/[qrCode] error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
