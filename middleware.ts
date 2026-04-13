import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Decode JWT payload without signature verification (Edge Runtime compatible).
 *  Full verification is done in every API route handler. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;

  // No token at all → redirect to login for UI routes, 401 for API routes
  if (!token) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const payload = decodeJwtPayload(token);

  // Allow cashiers through to the kasse page
  const kassePath = /^\/admin\/basars\/[^/]+\/kasse(\/|$)/;
  if (kassePath.test(request.nextUrl.pathname)) {
    if (payload?.isCashier === true || payload?.role === 'admin') {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // /admin UI routes: require admin role
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (payload?.role !== 'admin') {
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
  ],
};
