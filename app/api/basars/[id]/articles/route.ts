import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// GET /api/basars/:id/articles – get articles for calling seller in this basar
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { id: basarId } = await params;

    // Admin sees all articles; seller/employee sees only their own
    let articles;
    if (decoded.role === 'admin') {
      articles = await prisma.article.findMany({
        where: { basarSeller: { basarId } },
        include: { basarSeller: { include: { seller: { select: { firstName: true, lastName: true, sellerId: true } } } } },
        orderBy: { createdAt: 'asc' },
      });
    } else {
      const sellerId = decoded.sellerId;
      if (!sellerId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

      const basarSeller = await prisma.basarSeller.findUnique({
        where: { basarId_sellerId: { basarId, sellerId } },
        include: { seller: { select: { sellerId: true } } },
      });
      if (!basarSeller) return NextResponse.json({ articles: [], basarSeller: null });

      articles = await prisma.article.findMany({
        where: { basarSellerId: basarSeller.id },
        orderBy: { createdAt: 'asc' },
      });
      return NextResponse.json({ articles, basarSeller });
    }

    return NextResponse.json({ articles });
  } catch (error) {
    console.error('GET /api/basars/[id]/articles error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

// POST /api/basars/:id/articles – create article for calling seller
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    // Check seller is active
    const seller = await prisma.seller.findUnique({ where: { sellerId } });
    if (!seller?.sellerStatusActive) {
      return NextResponse.json({ error: 'Du bist nicht als Verkäufer aktiv' }, { status: 403 });
    }

    // Check basar is OPEN
    const basar = await prisma.basar.findUnique({ where: { id: basarId } });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });
    if (basar.status !== 'OPEN') {
      return NextResponse.json({ error: 'Artikel können nur bei offenem Basar angelegt werden' }, { status: 400 });
    }

    // Get or create BasarSeller entry
    let basarSeller = await prisma.basarSeller.findUnique({
      where: { basarId_sellerId: { basarId, sellerId } },
    });

    if (!basarSeller) {
      // Check max sellers
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
    const articleCount = await prisma.article.count({ where: { basarSellerId: basarSeller.id } });
    if (articleCount >= maxArticles) {
      return NextResponse.json({ error: `Maximale Artikelanzahl (${maxArticles}) erreicht` }, { status: 400 });
    }

    const body = await request.json();
    const { title, sizeLabel, gender, price } = body;

    if (!title || !price) {
      return NextResponse.json({ error: 'Beschreibung und Preis sind Pflichtfelder' }, { status: 400 });
    }
    if (parseFloat(price) <= 0) {
      return NextResponse.json({ error: 'Preis muss größer als 0 sein' }, { status: 400 });
    }

    const genderValue = (gender === 'Junge' || gender === 'Mädchen') ? gender : null;

    // Auto-create a SellerArticle archive entry so it survives basar closure
    const sellerArticle = await prisma.sellerArticle.create({
      data: {
        sellerId,
        title: title.substring(0, 120),
        sizeLabel: sizeLabel ? sizeLabel.substring(0, 40) : null,
        gender: genderValue,
        price: parseFloat(price),
      },
    });

    const article = await prisma.article.create({
      data: {
        basarSellerId: basarSeller.id,
        sellerArticleId: sellerArticle.id,
        title: title.substring(0, 120),
        sizeLabel: sizeLabel ? sizeLabel.substring(0, 40) : null,
        gender: genderValue,
        price: parseFloat(price),
        qrCode: crypto.randomUUID(),
      },
    });

    return NextResponse.json({ article, basarSeller }, { status: 201 });
  } catch (error) {
    console.error('POST /api/basars/[id]/articles error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
