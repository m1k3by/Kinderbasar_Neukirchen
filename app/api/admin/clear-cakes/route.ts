import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/apiAuth';

export async function POST(_request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult.response) return authResult.response;

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
