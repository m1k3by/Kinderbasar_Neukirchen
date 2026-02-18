import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function POST(req: Request) {
  try {
    // Delete all task signups
    const result = await prisma.taskSignup.deleteMany({});

    return NextResponse.json({
      message: `Alle Aufgaben-Anmeldungen wurden gelöscht. ${result.count} Einträge entfernt.`,
      count: result.count,
    });
  } catch (error: any) {
    console.error('Error clearing task signups:', error);
    return NextResponse.json(
      { error: 'Fehler beim Löschen der Aufgaben-Anmeldungen: ' + error.message },
      { status: 500 }
    );
  }
}
