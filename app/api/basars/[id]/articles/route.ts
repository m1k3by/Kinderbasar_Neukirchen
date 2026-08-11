import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAuth } from '../../../../lib/apiAuth';

// GET /api/basars/:id/articles – get articles for calling seller in this basar
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;
    const { id: basarId } = await params;

    // Admin sees all articles; seller/employee sees only their own
    if (auth.role === 'admin') {
      // Cursor-paginated (?cursor=<articleId>&limit=<n>, default 200, max 1000) with a
      // trimmed projection – at 2000+ sellers a single basar can have tens of thousands of
      // articles, and the previous unbounded include(basarSeller -> include(seller)) sent
      // every scalar field of both to every admin request regardless of basar size. (The
      // Kasse's own offline cache uses the dedicated /scan-cache route instead of this one.)
      const url = new URL(request.url);
      const cursor = url.searchParams.get('cursor');
      const limitParam = parseInt(url.searchParams.get('limit') || '200', 10);
      const limit = Math.min(Math.max(Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 200, 1), 1000);

      const rows = await prisma.article.findMany({
        where: { basarSeller: { basarId } },
        select: {
          id: true, title: true, sizeLabel: true, gender: true, price: true, qrCode: true, status: true, soldAt: true, createdAt: true,
          basarSeller: { select: { seller: { select: { firstName: true, lastName: true, sellerId: true } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | null = null;
      if (rows.length > limit) {
        const next = rows.pop();
        nextCursor = next!.id;
      }

      return NextResponse.json({ articles: rows, nextCursor });
    } else {
      const sellerId = auth.sellerId;
      if (!sellerId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

      const basarSeller = await prisma.basarSeller.findUnique({
        where: { basarId_sellerId: { basarId, sellerId } },
        include: { seller: { select: { sellerId: true } } },
      });
      if (!basarSeller) return NextResponse.json({ articles: [], basarSeller: null });

      const articles = await prisma.article.findMany({
        where: { basarSellerId: basarSeller.id },
        orderBy: { createdAt: 'asc' },
      });
      return NextResponse.json({ articles, basarSeller });
    }
  } catch (error) {
    console.error('GET /api/basars/[id]/articles error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

// POST /api/basars/:id/articles – create article for calling seller
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    // is rejected cheaply instead of paying for seller/basar lookups first.
    const body = await request.json();
    const { title, sizeLabel, gender, price } = body;

    if (!title || !price) {
      return NextResponse.json({ error: 'Beschreibung und Preis sind Pflichtfelder' }, { status: 400 });
    }
    const priceNum = parseFloat(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      return NextResponse.json({ error: 'Preis muss größer als 0 sein' }, { status: 400 });
    }
    const genderValue = (gender === 'Junge' || gender === 'Mädchen' || gender === 'Unisex') ? gender : null;
    const titleTrimmed = String(title).substring(0, 120);
    const sizeLabelTrimmed = sizeLabel ? String(sizeLabel).substring(0, 40) : null;

    // Check basar is OPEN
    const basar = await prisma.basar.findUnique({ where: { id: basarId } });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });
    if (basar.status !== 'OPEN') {
      return NextResponse.json({ error: 'Artikel können nur bei offenem Basar angelegt werden' }, { status: 400 });
    }

    // Generate one stable QR code – lives on the archive entry, reused across basars
    const stableQrCode = crypto.randomUUID();

    // Everything that must stay consistent under parallel requests (get-or-create BasarSeller,
    // the maxArticles limit check, and both writes) happens inside one transaction:
    //  - basarSeller.upsert instead of find-then-create: a double-click or two open tabs used
    //    to race two concurrent creates into a P2002 on [basarId, sellerId] → 500. upsert is a
    //    single atomic statement, so the second caller just gets the same row back.
    //  - maxArticles is re-read here (not from a check made before the transaction started) so
    //    the limit can't be exceeded by two requests that both passed the check before either
    //    had written anything.
    // Errors are returned as a discriminated result rather than thrown, mirroring the
    // conditional-update pattern already used in app/api/basars/[id]/sales/route.ts.
    const result = await prisma.$transaction(async (tx) => {
      // Artikel anlegen ist bewusst von der Teilnahme ENTKOPPELT: Ein Verkäufer darf seine
      // Artikel vorbereiten, ohne für diesen Basar angemeldet zu sein. Deshalb wird eine
      // fehlende Zeile hier inaktiv angelegt und maxSellers an dieser Stelle nicht geprüft –
      // eine inaktive Zeile belegt keinen Teilnehmerplatz. Ein Platz entsteht ausschließlich
      // über PUT /api/basars/[id]/participation, das dafür Aktivierungsfenster und maxSellers
      // prüft. `update: {}` lässt eine bestehende Zeile unangetastet, aktiviert also weder
      // versehentlich noch deaktiviert es einen bereits angemeldeten Teilnehmer.
      const basarSeller = await tx.basarSeller.upsert({
        where: { basarId_sellerId: { basarId, sellerId } },
        update: {},
        create: { basarId, sellerId, isActive: false, activatedAt: null },
      });

      const maxArticles = basarSeller.maxArticlesOverride ?? basar.maxArticlesPerSeller;
      const articleCount = await tx.article.count({ where: { basarSellerId: basarSeller.id } });
      if (articleCount >= maxArticles) {
        return { error: 'MAX_ARTICLES' as const, maxArticles };
      }

      // Auto-create a SellerArticle archive entry so it survives basar closure. Both writes
      // are in the same transaction now – previously, if the Article insert failed after the
      // SellerArticle insert succeeded, an orphaned archive row was left behind.
      const sellerArticle = await tx.sellerArticle.create({
        data: {
          sellerId,
          title: titleTrimmed,
          sizeLabel: sizeLabelTrimmed,
          gender: genderValue,
          price: priceNum,
          qrCode: stableQrCode,
        },
      });

      const article = await tx.article.create({
        data: {
          basarSellerId: basarSeller.id,
          sellerArticleId: sellerArticle.id,
          title: titleTrimmed,
          sizeLabel: sizeLabelTrimmed,
          gender: genderValue,
          price: priceNum,
          qrCode: stableQrCode,
        },
      });

      return { article, basarSeller };
    });

    if ('error' in result) {
      return NextResponse.json({ error: `Maximale Artikelanzahl (${result.maxArticles}) erreicht` }, { status: 400 });
    }

    return NextResponse.json({ article: result.article, basarSeller: result.basarSeller }, { status: 201 });
  } catch (error) {
    console.error('POST /api/basars/[id]/articles error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
