import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { createToken } from '../../lib/auth';
import bcrypt from 'bcrypt';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Check for admin login
    if (email === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
      const token = createToken({ role: 'admin' });
      const response = NextResponse.json({ success: true, role: 'admin' });
      response.cookies.set('token', token, { httpOnly: true });
      return response;
    }

    // Find seller
    const seller = await prisma.seller.findUnique({
      where: { email },
    });

    if (!seller || !seller.password) {
      return NextResponse.json(
        { error: 'Ungültige Anmeldedaten' },
        { status: 401 }
      );
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, seller.password);

    if (!validPassword) {
      return NextResponse.json(
        { error: 'Ungültige Anmeldedaten' },
        { status: 401 }
      );
    }

    // Create token
    const token = createToken({ 
      id: seller.id,
      role: 'employee',
      isEmployee: seller.isEmployee 
    });

    const response = NextResponse.json({ success: true, role: 'employee', sellerId: seller.id });
    response.cookies.set('token', token, { httpOnly: true });
    response.cookies.set('sellerId', seller.id, { httpOnly: false }); // Make sellerId available to client
    return response;

  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Anmeldung fehlgeschlagen' },
      { status: 500 }
    );
  }
}