import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';

export async function GET(request: Request) {
  try {
    const tasks = await prisma.task.findMany({
      include: {
        _count: {
          select: { signups: true },
        },
        signups: {
          include: {
            seller: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
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