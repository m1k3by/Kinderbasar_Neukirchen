import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireAdmin } from '../../lib/apiAuth';

export async function GET(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    // basarId ist Pflicht, bewusst ohne stillen Fallback auf "alle Basare": genau so ein
    // stiller Fallback hat /admin/tasks monatelang 0 Helfer anzeigen lassen. Fehlt der
    // Parameter, soll der Aufrufer das merken.
    const { searchParams } = new URL(request.url);
    const basarId = searchParams.get('basarId');
    if (!basarId) {
      return NextResponse.json({ error: 'basarId ist erforderlich' }, { status: 400 });
    }

    // Task selbst ist basarübergreifend (dieselben Schichten jeden Basar), nur die
    // Anmeldungen werden auf den Basar eingegrenzt. Die Seiten zählen signups.length –
    // ein zusätzliches _count wäre dieselbe Zahl doppelt und die nächste Gelegenheit,
    // dass beide auseinanderlaufen.
    const tasks = await prisma.task.findMany({
      select: {
        id: true,
        title: true,
        day: true,
        timeFrom: true,
        timeTo: true,
        capacity: true,
        createdAt: true,
        signups: {
          where: { basarId },
          select: {
            sellerId: true,
            seller: {
              select: {
                firstName: true,
                lastName: true,
                // Only admins may see which email address a signup belongs to
                ...(auth.role === 'admin' ? { email: true } : {}),
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return NextResponse.json(tasks);
  } catch (error: any) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden der Aufgaben' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const body = await request.json();

    // Validate required fields
    if (!body.title || !body.day || !body.capacity) {
      return NextResponse.json(
        { error: 'Fehlende Pflichtfelder: title, day, capacity' },
        { status: 400 }
      );
    }

    // Validate capacity is a positive number
    if (typeof body.capacity !== 'number' || body.capacity <= 0) {
      return NextResponse.json(
        { error: 'Kapazität muss eine positive Zahl sein' },
        { status: 400 }
      );
    }
    
    const task = await prisma.task.create({
      data: {
        title: body.title,
        day: body.day,
        timeFrom: body.timeFrom || null,
        timeTo: body.timeTo || null,
        capacity: body.capacity,
      },
    });

    return NextResponse.json(task);
  } catch (error: any) {
    console.error('Error creating task:', error);

    return NextResponse.json(
      { error: 'Fehler beim Erstellen der Aufgabe' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const body = await request.json();
    const { id, title, day, timeFrom, timeTo, capacity } = body;

    // Validate required fields
    if (!id) {
      return NextResponse.json(
        { error: 'Task-ID fehlt' },
        { status: 400 }
      );
    }

    if (!title || !day || !capacity) {
      return NextResponse.json(
        { error: 'Fehlende Pflichtfelder: title, day, capacity' },
        { status: 400 }
      );
    }

    // Validate capacity is a positive number
    if (typeof capacity !== 'number' || capacity <= 0) {
      return NextResponse.json(
        { error: 'Kapazität muss eine positive Zahl sein' },
        { status: 400 }
      );
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        title,
        day,
        timeFrom: timeFrom || null,
        timeTo: timeTo || null,
        capacity,
      },
    });

    return NextResponse.json(task);
  } catch (error: any) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Fehler beim Aktualisieren der Aufgabe' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Task-ID fehlt' },
        { status: 400 }
      );
    }

    // Delete task (cascade will delete signups automatically)
    await prisma.task.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { error: 'Fehler beim Löschen der Aufgabe' },
      { status: 500 }
    );
  }
}