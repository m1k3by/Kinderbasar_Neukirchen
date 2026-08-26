import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../lib/apiAuth';
import { shiftsOverlap } from '../../lib/time';

function parseSellerId(value: unknown): number | null {
  const num = typeof value === 'string' ? parseInt(value, 10) : (value as number);
  return typeof num === 'number' && !isNaN(num) ? num : null;
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { taskId, sellerId: bodySellerId, basarId } = await req.json();

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

    if (!taskId || !sellerIdInt || !basarId) {
      return NextResponse.json(
        { error: 'taskId, sellerId und basarId sind erforderlich' },
        { status: 400 }
      );
    }

    // Prüfen ob bereits angemeldet – im *selben* Basar. Dieselbe Schicht in einem anderen
    // Basar ist eine eigene Anmeldung, deshalb ist basarId Teil des Unique-Keys.
    const existing = await prisma.taskSignup.findUnique({
      where: {
        taskId_sellerId_basarId: {
          taskId,
          sellerId: sellerIdInt,
          basarId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Bereits für diese Aufgabe angemeldet' },
        { status: 400 }
      );
    }

    // Hole die Aufgabe, für die sich der User anmelden will (capacity is re-counted fresh
    // inside the transaction below, so the full signups list isn't needed here)
    const targetTask = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!targetTask) {
      return NextResponse.json({ error: 'Aufgabe nicht gefunden' }, { status: 404 });
    }

    // Prüfen auf zeitliche Überschneidungen mit bereits angemeldeten Aufgaben
    if (targetTask.timeFrom && targetTask.timeTo) {
      // Nur Anmeldungen desselben Basars können sich überschneiden – eine Schicht aus
      // einem vergangenen Basar darf die Eintragung im aktuellen nicht blockieren.
      const userSignups = await prisma.taskSignup.findMany({
        where: { sellerId: sellerIdInt, basarId },
        include: { task: true },
      });

      // Prüfe jede Aufgabe auf Überschneidung
      for (const signup of userSignups) {
        const existingTask = signup.task;

        // Prüfen: Gleicher Tag und mehr als die erlaubte Kulanz Überschneidung?
        if (existingTask.day === targetTask.day && shiftsOverlap(targetTask, existingTask)) {
          return NextResponse.json(
            {
              error: `Eintragung nicht möglich! Du hast dich bereits für "${existingTask.title}" (${existingTask.timeFrom} - ${existingTask.timeTo}) am ${existingTask.day} eingetragen.`
            },
            { status: 400 }
          );
        }
      }
    }

    // Prüfen ob noch Platz ist + Anmelden – in einer Transaktion, damit die Kapazität nicht
    // durch parallele Anfragen überbucht werden kann (z. B. wenn die Helferliste öffnet und
    // alle gleichzeitig klicken). Der Count wird in der Transaktion neu ausgeführt statt den
    // oben geladenen targetTask.signups zu verwenden, der zwischen Laden und Schreiben schon
    // veraltet sein könnte.
    const signup = await prisma.$transaction(async (tx) => {
      const currentCount = await tx.taskSignup.count({ where: { taskId, basarId } });
      if (currentCount >= targetTask.capacity) {
        return null; // signals "full" to the caller
      }
      return tx.taskSignup.create({
        data: {
          taskId,
          sellerId: sellerIdInt,
          basarId,
        },
      });
    });

    if (!signup) {
      return NextResponse.json({ error: 'Keine Plätze mehr verfügbar' }, { status: 400 });
    }

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
    const basarId = searchParams.get('basarId');

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

    if (!taskId || !sellerIdInt || !basarId) {
      return NextResponse.json(
        { error: 'taskId, sellerId und basarId sind erforderlich' },
        { status: 400 }
      );
    }

    await prisma.taskSignup.delete({
      where: {
        taskId_sellerId_basarId: {
          taskId,
          sellerId: sellerIdInt,
          basarId,
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
