import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const encodedSecret = new TextEncoder().encode(process.env.JWT_SECRET);

/** Verifies the JWT signature (Edge Runtime compatible via jose). Returns null if
 *  missing, expired, or the signature doesn't verify. Route handlers still perform
 *  their own full verification – this middleware is defense-in-depth. */
async function verifyJwt(token: string): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, encodedSecret);
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;

  // No token at all → redirect to login for UI routes, 401 for API routes
  if (!token) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const payload = await verifyJwt(token);

  // Invalid or expired token → same handling as a missing token
  if (!payload) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Allow cashiers through to the basar list and kasse page
  if (request.nextUrl.pathname.startsWith('/admin/basars')) {
    if (payload.isCashier === true || payload.role === 'admin') {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // /admin UI routes: require admin role
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (payload.role !== 'admin') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  // /api/* routes: any authenticated user proceeds; individual handlers check roles
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/sellers/:path*',
    '/api/tasks/:path*',
    '/api/cakes/:path*',
    '/api/basars/:path*',
    '/api/sales/:path*',
    '/api/admin/:path*',
    '/api/task-signups/:path*',
    '/api/chat-feedback/:path*',
    '/api/seller-articles/:path*',
    '/api/articles/:path*',
  ],
};
