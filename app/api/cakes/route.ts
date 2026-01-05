import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';

export async function GET(request: Request) {
  try {
    const cakes = await prisma.cake.findMany({
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
    const body = await request.json();
    
    if (!body.cakeName || !body.sellerId) {
      return NextResponse.json(
        { error: 'Fehlende Pflichtfelder: cakeName, sellerId' },
        { status: 400 }
      );
    }
    
    // Parse sellerId to integer
    const sellerIdInt = typeof body.sellerId === 'string' ? parseInt(body.sellerId, 10) : body.sellerId;
    
    if (isNaN(sellerIdInt)) {
      return NextResponse.json(
        { error: 'Ungültige Verkäufer-ID' },
        { status: 400 }
      );
    }
    
    const cake = await prisma.cake.create({
      data: {
        cakeName: body.cakeName,
        sellerId: sellerIdInt,
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
    const body = await request.json();
    const { id, cakeName } = body;

    if (!id || !cakeName) {
      return NextResponse.json(
        { error: 'ID und Kuchenname sind erforderlich' },
        { status: 400 }
      );
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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'ID ist erforderlich' },
        { status: 400 }
      );
    }

    await prisma.cake.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting cake:', error);
    return NextResponse.json(
      { error: 'Fehler beim Löschen des Kuchens' },
      { status: 500 }
    );
  }
}