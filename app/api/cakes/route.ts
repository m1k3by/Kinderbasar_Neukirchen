import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../lib/apiAuth';

function parseSellerId(value: unknown): number | null {
  const num = typeof value === 'string' ? parseInt(value, 10) : (value as number);
  return typeof num === 'number' && !isNaN(num) ? num : null;
}

// GET /api/cakes – list this basar's cake entries so sellers/employees can see which cake
// types already exist (without seeing who is bringing them). Admins get full seller details.
export async function GET(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { searchParams } = new URL(request.url);
    const basarId = searchParams.get('basarId');
    if (!basarId) {
      return NextResponse.json({ error: 'basarId ist erforderlich' }, { status: 400 });
    }

    const cakes = await prisma.cake.findMany({
      where: { basarId },
      select: {
        id: true,
        cakeName: true,
        sellerId: true,
        ...(auth.role === 'admin'
          ? {
              seller: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            }
          : {}),
      },
    });

    return NextResponse.json(cakes);
  } catch (error: any) {
    console.error('Error fetching cakes:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden der Kuchen' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const body = await request.json();

    if (!body.cakeName || !body.sellerId || !body.basarId) {
      return NextResponse.json(
        { error: 'Fehlende Pflichtfelder: cakeName, sellerId, basarId' },
        { status: 400 }
      );
    }

    const sellerIdInt = parseSellerId(body.sellerId);

    if (sellerIdInt === null) {
      return NextResponse.json(
        { error: 'Ungültige Verkäufer-ID' },
        { status: 400 }
      );
    }

    // Non-admins may only create cakes for themselves
    if (auth.role !== 'admin' && sellerIdInt !== auth.sellerId) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    const cake = await prisma.cake.create({
      data: {
        cakeName: body.cakeName,
        sellerId: sellerIdInt,
        basarId: body.basarId,
      },
      include: {
        seller: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(cake);
  } catch (error: any) {
    console.error('Error creating cake:', error);
    return NextResponse.json(
      { error: 'Fehler beim Erstellen des Kuchens' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const body = await request.json();
    const { id, cakeName } = body;

    if (!id || !cakeName) {
      return NextResponse.json(
        { error: 'ID und Kuchenname sind erforderlich' },
        { status: 400 }
      );
    }

    if (auth.role !== 'admin') {
      const existing = await prisma.cake.findUnique({ where: { id } });
      if (!existing || existing.sellerId !== auth.sellerId) {
        return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
      }
    }

    const cake = await prisma.cake.update({
      where: { id },
      data: { cakeName },
    });

    return NextResponse.json(cake);
  } catch (error: any) {
    console.error('Error updating cake:', error);
    return NextResponse.json(
      { error: 'Fehler beim Aktualisieren des Kuchens' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'ID ist erforderlich' },
        { status: 400 }
      );
    }

    if (auth.role !== 'admin') {
      const existing = await prisma.cake.findUnique({ where: { id } });
      if (!existing || existing.sellerId !== auth.sellerId) {
        return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
      }
    }

    await prisma.cake.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting cake:', error);
    return NextResponse.json(
      { error: 'Fehler beim Löschen des Kuchens' },
      { status: 500 }
    );
  }
}
