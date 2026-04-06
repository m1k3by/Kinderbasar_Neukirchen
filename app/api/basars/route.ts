import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// GET /api/basars – list all basars (any logged-in user)
export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    jwt.verify(token, JWT_SECRET);

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    const [basars, total] = await Promise.all([
      prisma.basar.findMany({
        skip,
        take: limit,
        orderBy: { eventDate: 'desc' },
        include: { _count: { select: { basarSellers: true } } },
      }),
      prisma.basar.count(),
    ]);

    return NextResponse.json({ basars, total, page, limit });
  } catch (error) {
    console.error('GET /api/basars error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

// POST /api/basars – create basar (admin only)
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Nur Admins dürfen Basare anlegen' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, eventDate, location, maxSellers, maxArticlesPerSeller, commissionPercent, entryFee } = body;

    if (!title || !eventDate) {
      return NextResponse.json({ error: 'Titel und Datum sind Pflichtfelder' }, { status: 400 });
    }

    const basar = await prisma.basar.create({
      data: {
        title,
        description: description || null,
        eventDate: new Date(eventDate),
        location: location || null,
        maxSellers: maxSellers ? parseInt(maxSellers) : 100,
        maxArticlesPerSeller: maxArticlesPerSeller ? parseInt(maxArticlesPerSeller) : 50,
        commissionPercent: commissionPercent !== undefined ? parseFloat(commissionPercent) : 20,
        entryFee: entryFee !== undefined ? parseFloat(entryFee) : 0,
      },
    });

    return NextResponse.json(basar, { status: 201 });
  } catch (error) {
    console.error('POST /api/basars error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
