import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { generateQR } from '../../../../lib/qr';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sellerId = parseInt(id, 10);
    
    if (isNaN(sellerId)) {
      return NextResponse.json({ error: 'Invalid seller ID' }, { status: 400 });
    }
    
    const seller = await prisma.seller.findUnique({
      where: { sellerId },
    });

    if (!seller) {
      return NextResponse.json({ error: 'Seller not found' }, { status: 404 });
    }

    // Format: sellerId_lastName_firstName (z.B. 1_Müller_Anna)
    const qrData = `${seller.sellerId}_${seller.lastName}_${seller.firstName}`;
    const qrCode = await generateQR(qrData);

    return NextResponse.json({ qrCode });
  } catch (error) {
    console.error('Error generating QR code:', error);
    return NextResponse.json(
      { error: 'Failed to generate QR code' },
      { status: 500 }
    );
  }
}
