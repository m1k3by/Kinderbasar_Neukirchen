import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/apiAuth';

// Leert die Helferliste eines Basars. basarId ist Pflicht und hat bewusst keinen Fallback:
// ein deleteMany({}) ohne where löscht die Anmeldungen sämtlicher Basare, also die gesamte
// Historie – das war bis zur Einführung von basarId das tatsächliche Verhalten.
export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult.response) return authResult.response;

  try {
    const basarId = new URL(request.url).searchParams.get('basarId');
    if (!basarId) {
      return NextResponse.json({ error: 'basarId ist erforderlich' }, { status: 400 });
    }

    const result = await prisma.taskSignup.deleteMany({ where: { basarId } });

    return NextResponse.json({
      message: `Alle Aufgaben-Anmeldungen dieses Basars wurden gelöscht. ${result.count} Einträge entfernt.`,
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
