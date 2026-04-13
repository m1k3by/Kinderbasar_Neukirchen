import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET!;

// POST /api/basars/:id/articles/import
// Body: { sellerArticleIds: string[] }
// Imports archive articles into the current basar (creates new Article rows with fresh QR codes).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.role === 'admin') {
      return NextResponse.json({ error: 'Admins legen keine Artikel an' }, { status: 403 });
    }

    const sellerId: number = decoded.sellerId;
    const { id: basarId } = await params;

    // Verify seller is active
    const seller = await prisma.seller.findUnique({ where: { sellerId } });
    if (!seller?.sellerStatusActive) {
      return NextResponse.json({ error: 'Du bist nicht als Verkäufer aktiv' }, { status: 403 });
    }

    // Verify basar is OPEN
    const basar = await prisma.basar.findUnique({ where: { id: basarId } });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });
    if (basar.status !== 'OPEN') {
      return NextResponse.json({ error: 'Artikel können nur bei offenem Basar importiert werden' }, { status: 400 });
    }

    // Get or create BasarSeller
    let basarSeller = await prisma.basarSeller.findUnique({
      where: { basarId_sellerId: { basarId, sellerId } },
    });

    if (!basarSeller) {
      const sellerCount = await prisma.basarSeller.count({ where: { basarId } });
      if (sellerCount >= basar.maxSellers) {
        return NextResponse.json({ error: 'Maximale Verkäuferanzahl erreicht' }, { status: 400 });
      }
      basarSeller = await prisma.basarSeller.create({
        data: { basarId, sellerId },
      });
    }

    // Check article limit
    const maxArticles = basarSeller.maxArticlesOverride ?? basar.maxArticlesPerSeller;
    const currentCount = await prisma.article.count({ where: { basarSellerId: basarSeller.id } });

    const { sellerArticleIds } = await request.json() as { sellerArticleIds: string[] };
    if (!Array.isArray(sellerArticleIds) || sellerArticleIds.length === 0) {
      return NextResponse.json({ error: 'Keine Artikel ausgewählt' }, { status: 400 });
    }

    // Filter: only articles owned by this seller and not already in this basar
    const archiveItems = await prisma.sellerArticle.findMany({
      where: { id: { in: sellerArticleIds }, sellerId },
      include: {
        articles: {
          where: { basarSeller: { basarId } },
          select: { id: true },
        },
      },
    });

    const toImport = archiveItems.filter((sa: any) => sa.articles.length === 0);

    if (toImport.length === 0) {
      return NextResponse.json({ error: 'Alle gewählten Artikel sind bereits in diesem Basar' }, { status: 400 });
    }

    if (currentCount + toImport.length > maxArticles) {
      return NextResponse.json({
        error: `Zu viele Artikel. Noch ${maxArticles - currentCount} Plätze frei, du versuchst ${toImport.length} zu importieren.`,
      }, { status: 400 });
    }

    // Create Article rows reusing the stable QR code from the archive entry
    const created = await prisma.$transaction(
      toImport.map((sa: any) =>
        prisma.article.create({
          data: {
            basarSellerId: basarSeller!.id,
            sellerArticleId: sa.id,
            title: sa.title,
            sizeLabel: sa.sizeLabel,
            gender: sa.gender ?? null,
            price: sa.price,
            // Reuse the archive QR code so already-printed labels still work.
            // Fall back to a new UUID only for legacy articles that predate this feature.
            qrCode: sa.qrCode ?? crypto.randomUUID(),
          },
        })
      )
    );

    return NextResponse.json({ articles: created, basarSeller }, { status: 201 });
  } catch (error) {
    console.error('POST /api/basars/[id]/articles/import error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
