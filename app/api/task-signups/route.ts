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
