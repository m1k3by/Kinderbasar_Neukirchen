import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { generateBarcode } from '@/app/lib/qr';

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
      where: { sellerId }
    });

    if (!seller) {
      return NextResponse.json({ error: 'Seller not found' }, { status: 404 });
    }

    // Format: sellerId_lastName_firstName (z.B. 1_Müller_Anna)
    const barcodeData = `${seller.sellerId}_${seller.lastName}_${seller.firstName}`;
    const barcode = await generateBarcode(barcodeData);
    
    return NextResponse.json({ barcode });
  } catch (error) {
    console.error('Error generating barcode:', error);
    return NextResponse.json({ error: 'Failed to generate barcode' }, { status: 500 });
  }
}
