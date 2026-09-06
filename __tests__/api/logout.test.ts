import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/logout/route';

/**
 * Vor dem 06.09.2026 gab es diese Route nicht – „Logout" war ein Link auf '/', das Cookie
 * blieb volle 24 Stunden gültig. Auf einem geteilten Kassenrechner reichte danach ein Klick
 * auf „Verkäuferbereich", um in der fremden Sitzung zu landen.
 */
describe('POST /api/logout', () => {
  it('überschreibt das Sitzungs-Cookie mit sofortigem Ablauf', async () => {
    const res = await POST();
    expect(res.status).toBe(200);

    const cookie = res.cookies.get('token');
    expect(cookie?.value).toBe('');
    expect(cookie?.maxAge).toBe(0);
  });

  it('spiegelt path und httpOnly aus dem Login – sonst wird ein anderes Cookie gelöscht', async () => {
    const cookie = (await POST()).cookies.get('token');
    expect(cookie?.path).toBe('/');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
  });
});
