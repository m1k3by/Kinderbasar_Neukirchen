import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { env } from './env';

export interface TokenPayload {
  role: 'admin' | 'seller' | 'employee';
  sellerId?: number;
  isEmployee?: boolean;
  isCashier?: boolean;
}

/** Reads the `token` cookie and verifies it. Returns null on missing/invalid token. */
export async function getAuth(): Promise<TokenPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return null;
    const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

type AuthResult = { auth: TokenPayload; response?: undefined } | { auth?: undefined; response: NextResponse };

/** Any authenticated user (admin, seller, or employee). */
export async function requireAuth(): Promise<AuthResult> {
  const auth = await getAuth();
  if (!auth) {
    return { response: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }) };
  }
  return { auth };
}

/** Admin only. */
export async function requireAdmin(): Promise<AuthResult> {
  const result = await requireAuth();
  if (result.response) return result;
  if (result.auth.role !== 'admin') {
    return { response: NextResponse.json({ error: 'Nur Admins' }, { status: 403 }) };
  }
  return result;
}

/** Admin or cashier. */
export async function requireCashier(): Promise<AuthResult> {
  const result = await requireAuth();
  if (result.response) return result;
  if (result.auth.role !== 'admin' && result.auth.isCashier !== true) {
    return { response: NextResponse.json({ error: 'Nur Kassierer oder Admins dürfen kassieren' }, { status: 403 }) };
  }
  return result;
}
