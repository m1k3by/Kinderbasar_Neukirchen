import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { requireAuth } from '../../../../../lib/apiAuth';
import { requireBasarAccess } from '../../../../../lib/basarAccess';
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
    // Testbasar: nur Admin und Eingeladene, sonst 404 (app/lib/basarAccess.ts).
    const denied = await requireBasarAccess(authResult.auth, basarId);
    if (denied) return denied;

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

    // Zählen, „schon im Basar?", Limit und Schreiben laufen in EINER Transaktion hinter einer
    // Zeilensperre – wie in POST /api/basars/[id]/articles. Bis 11.11.2026 standen die
    // Prüfungen davor und ohne Sperre: ein Doppeltipp auf „Übernehmen" (oder zwei Tabs)
    // bestand sie zweimal und legte jeden Artikel doppelt an – zwei Zeilen mit demselben
    // QR-Code, von denen eine nach dem Verkauf für immer „nicht verkauft" blieb, und das
    // Artikellimit ließ sich so überschreiten. Der zweite Request wartet jetzt bis zum Commit
    // des ersten und sieht dessen Artikel.
    const maxArticles = maxArticlesFor(basar, seller ?? { isEmployee: false, isOrga: false }, basarSeller.maxArticlesOverride);
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "BasarSeller" WHERE id = ${basarSeller.id} FOR UPDATE`;

      const currentCount = await tx.article.count({ where: { basarSellerId: basarSeller.id } });

      // Filter: only articles owned by this seller and not already in this basar
      const archiveItems = await tx.sellerArticle.findMany({
        where: { id: { in: sellerArticleIds }, sellerId },
        include: {
          articles: {
            where: { basarSeller: { basarId } },
            select: { id: true },
          },
        },
      });
      const toImport = archiveItems.filter((sa) => sa.articles.length === 0);

      if (toImport.length === 0) return { error: 'Alle gewählten Artikel sind bereits in diesem Basar' } as const;
      if (currentCount + toImport.length > maxArticles) {
        return {
          error: `Zu viele Artikel. Noch ${maxArticles - currentCount} Plätze frei, du versuchst ${toImport.length} zu importieren.`,
        } as const;
      }

      // Ein Statement statt eines je Artikel: eine interaktive Transaktion läuft auf einer
      // Verbindung, 50 einzelne Inserts wären 50 Roundtrips unter gehaltener Sperre.
      const articles = await tx.article.createManyAndReturn({
        data: toImport.map((sa) => ({
          basarSellerId: basarSeller.id,
          sellerArticleId: sa.id,
          title: sa.title,
          sizeLabel: sa.sizeLabel,
          gender: sa.gender ?? null,
          price: sa.price,
          // Reuse the archive QR code so already-printed labels still work.
          // Fall back to a new UUID only for legacy articles that predate this feature.
          qrCode: sa.qrCode ?? crypto.randomUUID(),
        })),
      });
      return { articles };
    });

    if ('error' in outcome) return NextResponse.json({ error: outcome.error }, { status: 400 });
    const created = outcome.articles;

    return NextResponse.json({ articles: created, basarSeller }, { status: 201 });
  } catch (error) {
    console.error('POST /api/basars/[id]/articles/import error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
