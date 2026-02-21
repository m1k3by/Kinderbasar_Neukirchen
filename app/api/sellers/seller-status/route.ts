import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export async function PUT(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  
  try {
    const body = await request.json();
    const { sellerId, sellerStatusActive } = body;

    console.log('[SELLER-STATUS] Attempt:', {
      sellerId,
      requestedStatus: sellerStatusActive,
      ip,
      timestamp: new Date().toISOString()
    });

    if (!sellerId) {
      console.log('[SELLER-STATUS] Failed: Missing sellerId', { ip });
      return NextResponse.json(
        { error: 'Verkäufer-ID ist erforderlich' },
        { status: 400 }
      );
    }

    // Parse sellerId to integer
    const sellerIdInt = typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId;

    if (isNaN(sellerIdInt)) {
      console.log('[SELLER-STATUS] Failed: Invalid sellerId', { sellerId, ip });
      return NextResponse.json(
        { error: 'Ungültige Verkäufer-ID' },
        { status: 400 }
      );
    }

    // Find seller by their sellerId
    const seller = await prisma.seller.findFirst({
      where: { sellerId: sellerIdInt }
    });

    if (!seller) {
      console.log('[SELLER-STATUS] Failed: Seller not found', { sellerId: sellerIdInt, ip });
      return NextResponse.json(
        { error: 'Verkäufer nicht gefunden' },
        { status: 404 }
      );
    }

    // Check activation period if trying to activate
    if (sellerStatusActive && !seller.sellerStatusActive) {
      // Load settings to check activation periods
      const settings = await prisma.settings.findMany();
      const settingsObj: Record<string, string> = {};
      settings.forEach((s) => {
        settingsObj[s.key] = s.value;
      });

      // Helper function to parse datetime-local as German time (MEZ/MESZ)
      const parseAsGermanTime = (dateTimeStr: string): Date => {
        if (!dateTimeStr) return new Date(0);
        
        // Parse the datetime-local value (format: "YYYY-MM-DDTHH:mm")
        const [datePart, timePart] = dateTimeStr.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hours, minutes] = timePart.split(':').map(Number);
        
        // Determine UTC offset for Europe/Berlin timezone
        // Check if date is in DST (last Sunday of March 02:00 to last Sunday of October 03:00)
        const date = new Date(year, month - 1, day);
        const marchLastSunday = new Date(year, 2, 31);
        marchLastSunday.setDate(31 - (marchLastSunday.getDay() || 7) + 1);
        const octoberLastSunday = new Date(year, 9, 31);
        octoberLastSunday.setDate(31 - (octoberLastSunday.getDay() || 7) + 1);
        
        const isDST = date >= marchLastSunday && date < octoberLastSunday;
        const offset = isDST ? '+02:00' : '+01:00';
        
        return new Date(dateTimeStr + offset);
      };

      const now = new Date();
      const isEmployee = seller.isEmployee;

      // Check appropriate activation period based on user type
      if (isEmployee) {
        if (settingsObj.activation_employee_start && settingsObj.activation_employee_end) {
          const start = parseAsGermanTime(settingsObj.activation_employee_start);
          const end = parseAsGermanTime(settingsObj.activation_employee_end);
          
          if (now < start || now > end) {
            console.log('[SELLER-STATUS] Failed: Employee activation period closed', {
              sellerId: sellerIdInt,
              now: now.toISOString(),
              start: start.toISOString(),
              end: end.toISOString(),
              ip
            });
            return NextResponse.json(
              { error: 'Die Aktivierung ist derzeit nicht möglich. Der Aktivierungszeitraum für Mitarbeiter ist geschlossen.' },
              { status: 403 }
            );
          }
        }
      } else {
        if (settingsObj.activation_seller_start && settingsObj.activation_seller_end) {
          const start = parseAsGermanTime(settingsObj.activation_seller_start);
          const end = parseAsGermanTime(settingsObj.activation_seller_end);
          
          if (now < start || now > end) {
            console.log('[SELLER-STATUS] Failed: Seller activation period closed', {
              sellerId: sellerIdInt,
              now: now.toISOString(),
              start: start.toISOString(),
              end: end.toISOString(),
              ip
            });
            return NextResponse.json(
              { error: 'Die Aktivierung ist derzeit nicht möglich. Der Aktivierungszeitraum für Verkäufer ist geschlossen.' },
              { status: 403 }
            );
          }
        }
      }

      // Check if limit is reached (only for sellers)
      if (!isEmployee) {
        const activeSellers = await prisma.seller.count({
          where: {
            sellerStatusActive: true,
            isEmployee: false
          }
        });
        const maxSellers = parseInt(process.env.MAX_SELLERS || '200');
        
        if (activeSellers >= maxSellers) {
          console.log('[SELLER-STATUS] Failed: Max sellers reached', {
            sellerId: sellerIdInt,
            activeSellers,
            maxSellers,
            ip
          });
          return NextResponse.json(
            { error: `Die maximale Anzahl von ${maxSellers} aktiven Verkäufern ist bereits erreicht. Sie können Ihren Status derzeit nicht aktivieren.` },
            { status: 400 }
          );
        }
      }
    }

    // Update seller status
    const updatedSeller = await prisma.seller.update({
      where: { sellerId: sellerIdInt },
      data: { sellerStatusActive },
    });

    console.log('[SELLER-STATUS] Success:', {
      sellerId: sellerIdInt,
      newStatus: updatedSeller.sellerStatusActive,
      isEmployee: seller.isEmployee,
      ip
    });

    return NextResponse.json({ 
      success: true, 
      sellerStatusActive: updatedSeller.sellerStatusActive 
    });
  } catch (error: any) {
    console.error('[SELLER-STATUS] Exception:', {
      error: error.message,
      stack: error.stack?.substring(0, 200),
      ip
    });
    return NextResponse.json(
      { error: 'Fehler beim Aktualisieren des Verkäuferstatus' },
      { status: 500 }
    );
  }
}
