import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// GET /api/basars/:id
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    jwt.verify(token, JWT_SECRET);

    const { id } = await params;
    const basar = await prisma.basar.findUnique({
      where: { id },
      include: {
        _count: { select: { basarSellers: true, sales: true } },
        basarSellers: {
          include: {
            seller: { select: { sellerId: true, firstName: true, lastName: true, email: true, sellerStatusActive: true } },
            _count: { select: { articles: true } },
          },
          orderBy: { sellerId: 'asc' },
        },
      },
    });

    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });
    return NextResponse.json(basar);
  } catch (error) {
    console.error('GET /api/basars/[id] error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

// PUT /api/basars/:id – update basar (admin only, only if not ACTIVE or CLOSED)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Nur Admins dürfen Basare bearbeiten' }, { status: 403 });
    }

    const { id } = await params;
    const basar = await prisma.basar.findUnique({ where: { id } });
    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });
    if (basar.status === 'CLOSED') {
      return NextResponse.json({ error: 'Geschlossene Basare können nicht bearbeitet werden' }, { status: 400 });
    }

    const body = await request.json();
    const { title, description, eventDate, location, maxSellers, maxArticlesPerSeller, commissionPercent, entryFee } = body;

    const updated = await prisma.basar.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(eventDate && { eventDate: new Date(eventDate) }),
        ...(location !== undefined && { location }),
        ...(maxSellers !== undefined && { maxSellers: parseInt(maxSellers) }),
        ...(maxArticlesPerSeller !== undefined && { maxArticlesPerSeller: parseInt(maxArticlesPerSeller) }),
        ...(commissionPercent !== undefined && { commissionPercent: parseFloat(commissionPercent) }),
        ...(entryFee !== undefined && { entryFee: parseFloat(entryFee) }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/basars/[id] error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
