import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';

export async function GET(request: Request) {
  try {
    const tasks = await prisma.task.findMany({
      include: {
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

    // Validate day format
    if (!['FR', 'SA', 'SO'].includes(body.day)) {
      return NextResponse.json(
        { error: 'Tag muss FR, SA oder SO sein' },
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