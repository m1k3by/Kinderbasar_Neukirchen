import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { env } from './lib/env';

export async function middleware(request: NextRequest) {
  // Protected routes
  const protectedPaths = ['/admin', '/api/sellers', '/api/tasks', '/api/cakes'];
  
  if (protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Check for admin basic auth
    const authHeader = request.headers.get('authorization');
    
    if (authHeader) {
      const [type, credentials] = authHeader.split(' ');
      if (type === 'Basic') {
        const [username, password] = atob(credentials).split(':');
        if (username === env.ADMIN_USER && password === env.ADMIN_PASS) {
          return NextResponse.next();
        }
      }
    }
    
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Secure Area"',
      },
    });
  }

  return NextResponse.next();
}