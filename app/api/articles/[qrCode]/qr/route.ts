import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { prisma } from '../../../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET!;

// GET /api/articles/:qrCode/qr – returns QR code as PNG
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ qrCode: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return new Response('Unauthorized', { status: 401 });
    jwt.verify(token, JWT_SECRET);

    const { qrCode } = await params;

    // findFirst – qrCode is no longer unique on Article (same code reused across basars)
    const article = await prisma.article.findFirst({ where: { qrCode } });
    if (!article) return new Response('Not Found', { status: 404 });

    const buffer = await QRCode.toBuffer(qrCode, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 300,
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('GET /api/articles/[qrCode]/qr error:', error);
    return new Response('Error', { status: 500 });
  }
}
