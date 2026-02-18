import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function POST(req: Request) {
  try {
    // Delete all cakes
    const result = await prisma.cake.deleteMany({});

    return NextResponse.json({
      message: `Alle Kuchen wurden gelöscht. ${result.count} Einträge entfernt.`,
      count: result.count,
    });
  } catch (error: any) {
    console.error('Error clearing cakes:', error);
    return NextResponse.json(
      { error: 'Fehler beim Löschen der Kuchen: ' + error.message },
      { status: 500 }
    );
  }
}
