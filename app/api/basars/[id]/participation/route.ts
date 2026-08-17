import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAuth } from '../../../../lib/apiAuth';
import { isActivationOpen } from '../../../../lib/basarWindows';
import { TERMS_VERSION, PRIVACY_VERSION } from '../../../../lib/legalDocs';

// PUT /api/basars/:id/participation – seller/employee an- oder abmelden für genau
// diesen Basar. Ersetzt PUT /api/sellers/seller-status, das ein globales
// Seller.sellerStatusActive umschaltete und damit nicht zwischen Basaren
// unterscheiden konnte.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

  try {
    const authResult = await requireAuth();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { id: basarId } = await params;
    const body = await request.json();
    const { sellerId: sellerIdInput, isActive, acceptedTerms } = body;

    if (typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive (boolean) ist ein Pflichtfeld' }, { status: 400 });
    }

    const sellerId = sellerIdInput !== undefined
      ? (typeof sellerIdInput === 'string' ? parseInt(sellerIdInput, 10) : sellerIdInput)
      : auth.sellerId;

    if (!sellerId || isNaN(sellerId)) {
      console.log('[PARTICIPATION] Failed: Invalid sellerId', { sellerIdInput, ip });
      return NextResponse.json({ error: 'Ungültige Verkäufer-ID' }, { status: 400 });
    }

    // Self-or-admin: non-admins may only change their own participation.
    if (auth.role !== 'admin' && auth.sellerId !== sellerId) {
      console.log('[PARTICIPATION] Failed: sellerId mismatch', { sellerId, callerSellerId: auth.sellerId, ip });
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    console.log('[PARTICIPATION] Attempt:', { basarId, sellerId, requestedActive: isActive, ip, timestamp: new Date().toISOString() });

    const [basar, seller] = await Promise.all([
      prisma.basar.findUnique({ where: { id: basarId } }),
      prisma.seller.findUnique({ where: { sellerId } }),
    ]);

    if (!basar) return NextResponse.json({ error: 'Basar nicht gefunden' }, { status: 404 });
    if (!seller) return NextResponse.json({ error: 'Verkäufer nicht gefunden' }, { status: 404 });

    const existing = await prisma.basarSeller.findUnique({
      where: { basarId_sellerId: { basarId, sellerId } },
    });

    // Meldet sich jemand selbst an, muss er AGB und Datenschutzerklärung bestätigt haben.
    // Ein Admin, der stellvertretend aktiviert, kann diese Zustimmung nicht abgeben –
    // dort bleibt termsAcceptedAt leer, statt eine fremde Zustimmung zu fingieren.
    const isSelfActivation = isActive && !(existing?.isActive) && auth.sellerId === sellerId;

    if (isActive && !(existing?.isActive)) {
      // Nur beim (Re-)Aktivieren prüfen – Abmelden ist immer erlaubt.
      if (auth.role !== 'admin') {
        if (basar.isArchived || basar.status === 'CLOSED' || basar.status === 'DRAFT') {
          return NextResponse.json(
            { error: 'Für diesen Basar ist derzeit keine Teilnahme möglich.' },
            { status: 403 }
          );
        }

        if (!isActivationOpen(basar, seller.isEmployee)) {
          console.log('[PARTICIPATION] Failed: activation window closed', { basarId, sellerId, isEmployee: seller.isEmployee, ip });
          return NextResponse.json(
            {
              error: seller.isEmployee
                ? 'Die Aktivierung ist derzeit nicht möglich. Der Aktivierungszeitraum für Mitarbeiter ist geschlossen.'
                : 'Die Aktivierung ist derzeit nicht möglich. Der Aktivierungszeitraum für Verkäufer ist geschlossen.',
            },
            { status: 403 }
          );
        }

        if (!seller.isEmployee) {
          const activeSellers = await prisma.basarSeller.count({
            where: { basarId, isActive: true, seller: { isEmployee: false } },
          });
          if (activeSellers >= basar.maxSellers) {
            console.log('[PARTICIPATION] Failed: capacity reached', { basarId, sellerId, activeSellers, maxSellers: basar.maxSellers, ip });
            return NextResponse.json(
              { error: `Die maximale Anzahl von ${basar.maxSellers} Verkäufern für diesen Basar ist bereits erreicht.` },
              { status: 400 }
            );
          }
        }
      }
    }

    // Erst prüfen, ob eine Teilnahme überhaupt möglich ist – eine fehlende Zustimmung
    // zu melden, wenn der Basar ohnehin geschlossen ist, wäre irreführend.
    if (isSelfActivation && acceptedTerms !== true) {
      console.log('[PARTICIPATION] Failed: terms not accepted', { basarId, sellerId, ip });
      return NextResponse.json(
        { error: 'Bitte bestätige die AGB und die Datenschutzerklärung, um teilzunehmen.' },
        { status: 400 }
      );
    }

    // Zustimmungsnachweis: Zeitpunkt *und* Fassung der beiden Dokumente. Die Fassungen kommen
    // aus der Serverkonstante, nicht aus dem Request – ein Client könnte sonst behaupten, einer
    // beliebigen (etwa längst ersetzten) Fassung zugestimmt zu haben.
    const consent = {
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    };

    const basarSeller = await prisma.basarSeller.upsert({
      where: { basarId_sellerId: { basarId, sellerId } },
      update: {
        isActive,
        ...(isActive ? { activatedAt: new Date() } : {}),
        ...(isSelfActivation ? consent : {}),
      },
      create: {
        basarId,
        sellerId,
        isActive,
        activatedAt: isActive ? new Date() : null,
        ...(isSelfActivation ? consent : { termsAcceptedAt: null, termsVersion: null, privacyVersion: null }),
      },
    });

    // War dies eine (Re-)Aktivierung, die vorher nicht aktiv war? Dann jetzt genau in diesem
    // Moment die Anlieferungs-/Abholzeiten per Mail bestätigen – das ist der Zeitpunkt, an dem
    // diese Info für den Verkäufer relevant wird (Registrierung selbst ist basar-unabhängig
    // und verschickt keine Logistik-Infos mehr).
    if (isActive && !(existing?.isActive)) {
      try {
        const formatDateTime = (value: Date | null | undefined) => {
          if (!value) return null;
          try {
            const date = value instanceof Date ? value : new Date(value);
            return date.toLocaleString('de-DE', {
              weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin',
            });
          } catch { return null; }
        };

        const deliveryStart = formatDateTime(basar.deliveryStart);
        const deliveryEnd = formatDateTime(basar.deliveryEnd);
        const deliveryStart2 = formatDateTime(basar.deliveryStart2);
        const deliveryEnd2 = formatDateTime(basar.deliveryEnd2);
        const pickupStart = formatDateTime(basar.pickupStart);
        const pickupEnd = formatDateTime(basar.pickupEnd);
        const pickupStart2 = formatDateTime(basar.pickupStart2);
        const pickupEnd2 = formatDateTime(basar.pickupEnd2);

        const deliverySection = deliveryStart && deliveryEnd
          ? `<div style="margin-top:20px;padding:14px;border-radius:8px;background:#f3f4f6;border:1px solid #e5e7eb;">
               <strong>Anlieferung</strong><br/>
               <span style="font-size:0.95em;">Zeitfenster 1:</span><br/>
               <span>${deliveryStart}</span><br/><span>${deliveryEnd}</span>
               ${deliveryStart2 && deliveryEnd2 ? `
                 <br/><br/><span style="font-size:0.95em;">Zeitfenster 2:</span><br/>
                 <span>${deliveryStart2}</span><br/><span>${deliveryEnd2}</span>
               ` : ''}
             </div>`
          : '';

        const pickupSection = pickupStart && pickupEnd
          ? `<div style="margin-top:12px;padding:14px;border-radius:8px;background:#f3f4f6;border:1px solid #e5e7eb;">
               <strong>Abholung</strong><br/>
               <span style="font-size:0.95em;">Zeitfenster 1:</span><br/>
               <span>${pickupStart}</span><br/><span>${pickupEnd}</span>
               ${pickupStart2 && pickupEnd2 ? `
                 <br/><br/><span style="font-size:0.95em;">Zeitfenster 2:</span><br/>
                 <span>${pickupStart2}</span><br/><span>${pickupEnd2}</span>
               ` : ''}
             </div>`
          : '';

        const datesBox = (deliverySection || pickupSection)
          ? `<div style="margin-top:20px;display:flex;flex-direction:column;gap:10px;">${deliverySection}${pickupSection}</div>`
          : '';

        const emailHtml = `
          <div style="font-family:system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color:#111827;">
            <h1 style="color:#0f172a;">Teilnahme bestätigt: ${basar.title}</h1>
            <p>Hallo ${seller.firstName}, deine Teilnahme am Basar <strong>${basar.title}</strong> ist jetzt aktiv.</p>
            ${datesBox}
            <p style="margin-top:18px;">Mit freundlichen Grüßen,<br/><strong>Dein Basar-Team</strong></p>
          </div>
        `;

        await prisma.mailQueue.create({
          data: {
            to: seller.email,
            subject: `Teilnahme bestätigt: ${basar.title}`,
            html: emailHtml,
          },
        });
      } catch (emailError) {
        console.error('[PARTICIPATION] Failed to enqueue confirmation email:', { basarId, sellerId, error: emailError, ip });
        // Teilnahme-Aktivierung selbst darf durch einen Mail-Fehler nicht scheitern.
      }
    }

    console.log('[PARTICIPATION] Success:', { basarId, sellerId, newActive: basarSeller.isActive, ip });

    return NextResponse.json({ success: true, isActive: basarSeller.isActive });
  } catch (error: any) {
    console.error('[PARTICIPATION] Exception:', { error: error.message, stack: error.stack?.substring(0, 200), ip });
    return NextResponse.json({ error: 'Fehler beim Aktualisieren der Teilnahme' }, { status: 500 });
  }
}
