import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/apiAuth';

// Leert die Kuchenliste eines Basars – basarId ist Pflicht, siehe clear-task-signups.
export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult.response) return authResult.response;

  try {
    const basarId = new URL(request.url).searchParams.get('basarId');
    if (!basarId) {
      return NextResponse.json({ error: 'basarId ist erforderlich' }, { status: 400 });
    }

    const result = await prisma.cake.deleteMany({ where: { basarId } });

    return NextResponse.json({
      message: `Alle Kuchen dieses Basars wurden gelöscht. ${result.count} Einträge entfernt.`,
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
