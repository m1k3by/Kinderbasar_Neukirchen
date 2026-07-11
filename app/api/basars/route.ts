import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireAdmin } from '../../lib/apiAuth';

// GET /api/basars – list all basars (any logged-in user)
export async function GET(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;

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
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

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
