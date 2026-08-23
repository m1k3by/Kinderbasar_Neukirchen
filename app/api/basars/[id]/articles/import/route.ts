import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { requireAuth } from '../../../../../lib/apiAuth';
import { maxArticlesFor } from '../../../../../lib/articleLimits';

// POST /api/basars/:id/articles/import
// Body: { sellerArticleIds: string[] }
// Imports archive articles into the current basar (creates new Article rows with fresh QR codes).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;
    if (auth.role === 'admin') {
      return NextResponse.json({ error: 'Admins legen keine Artikel an' }, { status: 403 });
    }

    const sellerId: number = auth.sellerId!;
    const { id: basarId } = await params;

    // Parse and validate the request body BEFORE any DB round trips, so a malformed request
    // is rejected cheaply instead of paying for seller/basar/basarSeller lookups first.
    const { sellerArticleIds } = await request.json() as { sellerArticleIds: string[] };
    if (!Array.isArray(sellerArticleIds) || sellerArticleIds.length === 0) {
      return NextResponse.json({ error: 'Keine Artikel ausgewählt' }, { status: 400 });
    }

    // Verify basar is OPEN
    // seller wird mitgeladen (nicht aus dem Token gelesen) – siehe POST
    // /api/basars/[id]/articles: ein Token behält isEmployee bis zur nächsten Anmeldung.
    const [basar, seller] = await Promise.all([
      prisma.basar.findUnique({ where: { id: basarId } }),
      prisma.seller.findUnique({ where: { sellerId }, select: { isEmployee: true, isOrga: true } }),
    ]);
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });
    if (basar.status !== 'OPEN') {
      return NextResponse.json({ error: 'Artikel können nur bei offenem Basar importiert werden' }, { status: 400 });
    }

    // Get or create BasarSeller. upsert instead of find-then-create: two parallel requests
    // (double-click, two open tabs) used to both pass the find-null check and both attempt a
    // create, racing into a P2002 on [basarId, sellerId] → 500. upsert is a single atomic
    // statement, so the second caller just gets the same row back instead of crashing.
    //
    // Die Übernahme aus dem Archiv ist Artikelanlage und damit – wie POST
    // /api/basars/[id]/articles – bewusst von der Teilnahme entkoppelt: eine fehlende Zeile
    // wird inaktiv angelegt, maxSellers wird hier nicht geprüft (eine inaktive Zeile belegt
    // keinen Teilnehmerplatz), und `update: {}` lässt eine bestehende Zeile unangetastet.
    const basarSeller = await prisma.basarSeller.upsert({
      where: { basarId_sellerId: { basarId, sellerId } },
      update: {},
      create: { basarId, sellerId, isActive: false, activatedAt: null },
    });

    // Check article limit
    const maxArticles = maxArticlesFor(basar, seller ?? { isEmployee: false, isOrga: false }, basarSeller.maxArticlesOverride);
    const currentCount = await prisma.article.count({ where: { basarSellerId: basarSeller.id } });

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
