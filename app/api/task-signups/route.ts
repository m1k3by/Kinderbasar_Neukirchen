import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../lib/apiAuth';

function parseSellerId(value: unknown): number | null {
  const num = typeof value === 'string' ? parseInt(value, 10) : (value as number);
  return typeof num === 'number' && !isNaN(num) ? num : null;
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { taskId, sellerId: bodySellerId } = await req.json();

    // Non-admins may only sign up themselves. Admins may sign up any seller.
    let sellerIdInt: number | null;
    if (auth.role === 'admin') {
      sellerIdInt = bodySellerId !== undefined && bodySellerId !== null ? parseSellerId(bodySellerId) : null;
    } else {
      if (!auth.sellerId) {
        return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
      }
      if (bodySellerId !== undefined && bodySellerId !== null) {
        const requestedSellerId = parseSellerId(bodySellerId);
        if (requestedSellerId !== auth.sellerId) {
          return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
        }
      }
      sellerIdInt = auth.sellerId;
    }

    if (!taskId || !sellerIdInt) {
      return NextResponse.json(
        { error: 'taskId und sellerId sind erforderlich' },
        { status: 400 }
      );
    }

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

    // Hole die Aufgabe, für die sich der User anmelden will
    const targetTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        signups: true,
      },
    });

    if (!targetTask) {
      return NextResponse.json({ error: 'Aufgabe nicht gefunden' }, { status: 404 });
    }

    // Prüfen auf zeitliche Überschneidungen mit bereits angemeldeten Aufgaben
    if (targetTask.timeFrom && targetTask.timeTo) {
      // Hole alle Aufgaben, für die der User bereits angemeldet ist
      const userSignups = await prisma.taskSignup.findMany({
        where: { sellerId: sellerIdInt },
        include: { task: true },
      });

      // Prüfe jede Aufgabe auf Überschneidung
      for (const signup of userSignups) {
        const existingTask = signup.task;

        // Prüfen: Gleicher Tag?
        if (existingTask.day === targetTask.day) {
          // Prüfen: Zeitüberschneidung?
          if (existingTask.timeFrom && existingTask.timeTo) {
            // Zwei Zeiträume überschneiden sich wenn: start1 < end2 UND start2 < end1
            const hasOverlap =
              targetTask.timeFrom < existingTask.timeTo &&
              existingTask.timeFrom < targetTask.timeTo;

            if (hasOverlap) {
              return NextResponse.json(
                {
                  error: `Eintragung nicht möglich! Du hast dich bereits für "${existingTask.title}" (${existingTask.timeFrom} - ${existingTask.timeTo}) am ${existingTask.day} eingetragen.`
                },
                { status: 400 }
              );
            }
          }
        }
      }
    }

    // Prüfen ob noch Platz ist
    if (targetTask.signups.length >= targetTask.capacity) {
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
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    const bodySellerId = searchParams.get('sellerId');

    // Non-admins may only remove themselves. Admins may remove any seller.
    let sellerIdInt: number | null;
    if (auth.role === 'admin') {
      sellerIdInt = bodySellerId ? parseSellerId(bodySellerId) : null;
    } else {
      if (!auth.sellerId) {
        return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
      }
      if (bodySellerId !== null && bodySellerId !== '') {
        const requestedSellerId = parseSellerId(bodySellerId);
        if (requestedSellerId !== auth.sellerId) {
          return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
        }
      }
      sellerIdInt = auth.sellerId;
    }

    if (!taskId || !sellerIdInt) {
      return NextResponse.json(
        { error: 'taskId und sellerId sind erforderlich' },
        { status: 400 }
      );
    }

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
