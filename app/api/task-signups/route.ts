import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { taskId, sellerId } = await req.json();

    if (!taskId || !sellerId) {
      return NextResponse.json(
        { error: 'taskId und sellerId sind erforderlich' },
        { status: 400 }
      );
    }

    // Parse sellerId to integer
    const sellerIdInt = typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId;

    // Prüfen ob bereits angemeldet
    const existing = await prisma.taskSignup.findUnique({
      where: {
        taskId_sellerId: {
          taskId,
          sellerId: sellerIdInt,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Bereits für diese Aufgabe angemeldet' },
        { status: 400 }
      );
    }

    // Prüfen ob noch Platz ist
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        signups: true,
      },
    });

    if (!task) {
      return NextResponse.json({ error: 'Aufgabe nicht gefunden' }, { status: 404 });
    }

    if (task.signups.length >= task.capacity) {
      return NextResponse.json({ error: 'Keine Plätze mehr verfügbar' }, { status: 400 });
    }

    // Anmelden
    const signup = await prisma.taskSignup.create({
      data: {
        taskId,
        sellerId: sellerIdInt,
      },
    });

    return NextResponse.json({ success: true, signup });
  } catch (error) {
    console.error('Error creating task signup:', error);
    return NextResponse.json(
      { error: 'Fehler beim Anmelden' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    const sellerId = searchParams.get('sellerId');

    if (!taskId || !sellerId) {
      return NextResponse.json(
        { error: 'taskId und sellerId sind erforderlich' },
        { status: 400 }
      );
    }

    // Parse sellerId to integer
    const sellerIdInt = parseInt(sellerId, 10);

    await prisma.taskSignup.delete({
      where: {
        taskId_sellerId: {
          taskId,
          sellerId: sellerIdInt,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting task signup:', error);
    return NextResponse.json(
      { error: 'Fehler beim Austragen' },
      { status: 500 }
    );
  }
}
