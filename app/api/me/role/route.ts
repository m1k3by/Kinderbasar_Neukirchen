import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/apiAuth';
import { setEmployeeStatus } from '../../../lib/employeeRole';
import { createToken } from '../../../lib/auth';

/**
 * PUT /api/me/role  body: { isEmployee: boolean }
 *
 * Selbstbedienung für die eigene Rolle: Verkäufer machen sich zu Mitarbeitern und wieder
 * zurück. Bis zum 12.09.2026 ging das ausschließlich über den Admin – im Hilfe-Protokoll
 * stellte am 07.09. eine Person binnen zwei Minuten vier Fragen danach („Wie werde ich
 * Mitarbeiter", „Wo kann ich das umstellen?") und bekam als Antwort den Registrierungsweg,
 * der für ein bestehendes Konto gar nicht funktioniert: Seller.email ist @unique, eine
 * zweite Registrierung scheitert.
 *
 * Umgestellt wird nur die *eigene* Zeile: sellerId kommt aus dem Token, nicht aus dem Body.
 * isCashier und isOrga lassen sich hierüber nicht heraufsetzen – beides bleibt beim Admin.
 */
export async function PUT(request: Request) {
  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    // Admin-Token haben keine sellerId und damit keine Zeile, die umzustellen wäre.
    if (!auth.sellerId) {
      return NextResponse.json({ error: 'Nur für Verkäufer und Mitarbeiter' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const isEmployee = body?.isEmployee;
    if (typeof isEmployee !== 'boolean') {
      return NextResponse.json({ error: 'isEmployee muss true oder false sein' }, { status: 400 });
    }

    const seller = await prisma.seller.findUnique({
      where: { sellerId: auth.sellerId },
      select: { isOrga: true, isCashier: true },
    });
    if (!seller) {
      return NextResponse.json({ error: 'Verkäufer nicht gefunden' }, { status: 404 });
    }

    const orgaRemoved = !isEmployee && seller.isOrga;
    const updated = await setEmployeeStatus(auth.sellerId, isEmployee);

    const response = NextResponse.json({
      success: true,
      isEmployee: updated.isEmployee,
      isOrga: updated.isOrga,
      orgaRemoved,
    });

    // Token neu ausstellen. role und isEmployee stecken darin, und app/layout.tsx leitet
    // daraus die FAQ-Bereiche des Hilfe-Assistenten ab (computeContexts). Ohne diesen
    // Schritt behielte die Person bis zur nächsten Anmeldung die alte Rolle – der
    // Hilfe-Assistent kennte also genau die Antworten nicht, die sie gerade freigeschaltet
    // hat. isCashier wird aus der Datenbank übernommen statt aus dem alten Token: es darf
    // sich hier nicht ändern, aber auch nicht verlorengehen.
    response.cookies.set('token', createToken({
      sellerId: auth.sellerId,
      role: updated.isEmployee ? 'employee' : 'seller',
      isEmployee: updated.isEmployee,
      isCashier: seller.isCashier,
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('PUT /api/me/role error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
