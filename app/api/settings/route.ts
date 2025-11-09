import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';

// GET - Hole alle Settings
export async function GET() {
  try {
    const settings = await prisma.settings.findMany();
    
    // Convert to key-value object
    const settingsObj: Record<string, string> = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
    });
    
    return NextResponse.json(settingsObj);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden der Einstellungen' },
      { status: 500 }
    );
  }
}

// PUT - Aktualisiere Settings
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    
    // Update each setting
    const updates = Object.entries(body).map(([key, value]) =>
      prisma.settings.upsert({
        where: { key },
        update: { value: value as string },
        create: { key, value: value as string },
      })
    );
    
    await Promise.all(updates);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Fehler beim Speichern der Einstellungen' },
      { status: 500 }
    );
  }
}
