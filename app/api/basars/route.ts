import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireAdmin } from '../../lib/apiAuth';
import { buildBasarData } from '../../lib/basarPayload';

// GET /api/basars – list all basars (any logged-in user)
export async function GET(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    const archived = searchParams.get('archived') === 'true';
    const where = { isArchived: archived };
    const isAdmin = auth.role === 'admin';

    const [rows, total] = await Promise.all([
      prisma.basar.findMany({
        where,
        skip,
        take: limit,
        orderBy: { eventDate: 'desc' },
        include: {
          // Zählt nur aktive Teilnahmen – abgemeldete BasarSeller-Zeilen bleiben
          // wegen der Artikel-Historie erhalten, dürfen aber nicht gegen maxSellers zählen.
          _count: { select: { basarSellers: { where: { isActive: true } } } },
          // Nur die eigene Teilnahme, keine fremden Sellerdaten (siehe GET /api/basars/[id]).
          ...(!isAdmin && auth.sellerId
            ? { basarSellers: { where: { sellerId: auth.sellerId }, select: { isActive: true, activatedAt: true } } }
            : {}),
        },
      }),
      prisma.basar.count({ where }),
    ]);

    const basars = rows.map((b) => {
      if (isAdmin || !('basarSellers' in b)) return b;
      const { basarSellers, ...rest } = b as typeof b & { basarSellers: { isActive: boolean; activatedAt: Date | null }[] };
      return { ...rest, myParticipation: basarSellers[0] ?? null };
    });

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
    const result = buildBasarData(body, 'create');
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const basar = await prisma.basar.create({
      data: result.data as Parameters<typeof prisma.basar.create>[0]['data'],
    });

    return NextResponse.json(basar, { status: 201 });
  } catch (error) {
    console.error('POST /api/basars error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
