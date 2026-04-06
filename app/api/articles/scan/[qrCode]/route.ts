import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// GET /api/articles/scan/:qrCode – returns article info for the kasse scanner
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ qrCode: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const isAuthorized = decoded.role === 'admin' || decoded.isCashier === true;
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Nur Kassierer oder Admins dürfen scannen' }, { status: 403 });
    }

    const { qrCode } = await params;

    const article = await prisma.article.findUnique({
      where: { qrCode },
      include: {
        basarSeller: {
          include: {
            seller: { select: { firstName: true, lastName: true, sellerId: true } },
            basar: { select: { id: true, title: true, status: true } },
          },
        },
      },
    });

    if (!article) return NextResponse.json({ error: 'Artikel nicht gefunden' }, { status: 404 });

    if (article.status === 'SOLD') {
      return NextResponse.json({ error: 'Artikel bereits verkauft', article }, { status: 409 });
    }

    if (article.basarSeller.basar.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Basar ist nicht aktiv' }, { status: 403 });
    }

    return NextResponse.json({
      id: article.id,
      title: article.title,
      sizeLabel: article.sizeLabel,
      price: Number(article.price),
      status: article.status,
      qrCode: article.qrCode,
      sellerNumber: article.basarSeller.sellerNumber,
      sellerName: `${article.basarSeller.seller.firstName} ${article.basarSeller.seller.lastName}`,
      basarId: article.basarSeller.basar.id,
      basarTitle: article.basarSeller.basar.title,
    });
  } catch (error) {
    console.error('GET /api/articles/scan/[qrCode] error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
