import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { createToken, verifyToken } from '@/app/lib/auth';

const SECRET = process.env.JWT_SECRET!;

describe('createToken / verifyToken', () => {
  it('round-trips a simple admin payload', () => {
    const token = createToken({ role: 'admin' });
    const decoded = verifyToken(token) as jwt.JwtPayload;
    expect(decoded.role).toBe('admin');
  });

  it('round-trips sellerId, isEmployee, isCashier', () => {
    const token = createToken({ sellerId: 42, role: 'seller', isCashier: true });
    const decoded = verifyToken(token) as jwt.JwtPayload;
    expect(decoded.sellerId).toBe(42);
    expect(decoded.isCashier).toBe(true);
    expect(decoded.role).toBe('seller');
  });

  it('generated token is valid for at least 23h 59m', () => {
    const token = createToken({ role: 'admin' });
    const decoded = verifyToken(token) as jwt.JwtPayload;
    const nowSec = Math.floor(Date.now() / 1000);
    expect(decoded.exp!).toBeGreaterThan(nowSec + 23 * 3600);
  });

  it('throws JsonWebTokenError for garbage input', () => {
    expect(() => verifyToken('definitely.not.a.jwt')).toThrow(jwt.JsonWebTokenError);
  });

  it('throws JsonWebTokenError for token signed with wrong secret', () => {
    const badToken = jwt.sign({ role: 'admin' }, 'wrong-secret-entirely');
    expect(() => verifyToken(badToken)).toThrow(jwt.JsonWebTokenError);
  });

  it('throws TokenExpiredError for an expired token', async () => {
    const expiredToken = jwt.sign({ role: 'admin' }, SECRET, { expiresIn: 0 });
    // expiresIn: 0 means expired immediately — needs 1ms of real time
    await new Promise(r => setTimeout(r, 50));
    expect(() => verifyToken(expiredToken)).toThrow(jwt.TokenExpiredError);
  });
});
