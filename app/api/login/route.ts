import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { createToken } from '../../lib/auth';
import { rateLimit } from '../../lib/rateLimit';
import bcrypt from 'bcrypt';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  try {
    const body = await request.json();
    let { email, password } = body;
    
    console.log('[LOGIN] Attempt:', {
      email: email ? email.substring(0, 3) + '***' : 'undefined',
      ip,
      userAgent: userAgent.substring(0, 50),
      timestamp: new Date().toISOString()
    });
    
    // Normalize email to lowercase for case-insensitive comparison
    email = email?.toLowerCase();

    // Rate limiting: 10 login attempts per 15 minutes per IP
    const rateLimitKey = `login:${ip}`;
    
    if (!rateLimit(rateLimitKey, { maxRequests: 10, windowMs: 15 * 60 * 1000 })) {
      console.log('[LOGIN] Rate limit exceeded:', { email: email?.substring(0, 3) + '***', ip });
      return NextResponse.json(
        { error: 'Zu viele Login-Versuche. Bitte versuchen Sie es später erneut.' },
        { status: 429 }
      );
    }

    // Check for admin login (case-insensitive)
    if (email === process.env.ADMIN_USER?.toLowerCase() && password === process.env.ADMIN_PASS) {
      console.log('[LOGIN] Success: Admin login', { ip });
      const token = createToken({ role: 'admin' });
      const response = NextResponse.json({ success: true, role: 'admin' });
      response.cookies.set('token', token, { httpOnly: true });
      return response;
    }

    // Find seller
    const seller = await prisma.seller.findUnique({
      where: { email },
    });

    if (!seller) {
      console.log('[LOGIN] Failed: User not found', { email: email?.substring(0, 3) + '***', ip });
      return NextResponse.json(
        { error: 'Ungültige Anmeldedaten' },
        { status: 401 }
      );
    }
    
    if (!seller.password) {
      console.log('[LOGIN] Failed: No password set', { sellerId: seller.sellerId, email: email?.substring(0, 3) + '***', ip });
      return NextResponse.json(
        { error: 'Ungültige Anmeldedaten' },
        { status: 401 }
      );
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, seller.password);

    if (!validPassword) {
      console.log('[LOGIN] Failed: Invalid password', { sellerId: seller.sellerId, email: email?.substring(0, 3) + '***', ip });
      return NextResponse.json(
        { error: 'Ungültige Anmeldedaten' },
        { status: 401 }
      );
    }

    // Create token
    const role = seller.isEmployee ? 'employee' : 'seller';
    const token = createToken({ 
      sellerId: seller.sellerId,
      role: role,
      isEmployee: seller.isEmployee 
    });

    console.log('[LOGIN] Success:', { 
      sellerId: seller.sellerId, 
      role, 
      email: email?.substring(0, 3) + '***',
      ip 
    });

    const response = NextResponse.json({ success: true, role: role, sellerId: seller.sellerId });
    response.cookies.set('token', token, { httpOnly: true });
    response.cookies.set('sellerId', seller.sellerId.toString(), { httpOnly: false }); // Make sellerId available to client
    return response;

  } catch (error: any) {
    console.error('[LOGIN] Exception:', { 
      error: error.message, 
      stack: error.stack?.substring(0, 200),
      ip 
    });
    return NextResponse.json(
      { error: 'Anmeldung fehlgeschlagen' },
      { status: 500 }
    );
  }
}