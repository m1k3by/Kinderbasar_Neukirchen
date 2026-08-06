import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('env module', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when JWT_SECRET is empty', async () => {
    vi.stubEnv('JWT_SECRET', '');
    await expect(import('@/app/lib/env')).rejects.toThrow('JWT_SECRET');
  });

  it('throws when ADMIN_PASS is empty', async () => {
    vi.stubEnv('ADMIN_PASS', '');
    await expect(import('@/app/lib/env')).rejects.toThrow('ADMIN_PASS');
  });

  it('exports env.ADMIN_USER from process.env', async () => {
    vi.stubEnv('ADMIN_USER', 'myadmin');
    const { env } = await import('@/app/lib/env');
    expect(env.ADMIN_USER).toBe('myadmin');
  });

  it('defaults ADMIN_USER to "admin" when not set', async () => {
    vi.stubEnv('ADMIN_USER', '');
    const { env } = await import('@/app/lib/env');
    expect(env.ADMIN_USER).toBe('admin');
  });

  it('parses SMTP_PORT to a number', async () => {
    vi.stubEnv('SMTP_PORT', '465');
    const { env } = await import('@/app/lib/env');
    expect(env.SMTP_PORT).toBe(465);
    expect(typeof env.SMTP_PORT).toBe('number');
  });

  it('defaults SMTP_PORT to 587', async () => {
    vi.stubEnv('SMTP_PORT', '');
    const { env } = await import('@/app/lib/env');
    expect(env.SMTP_PORT).toBe(587);
  });
});
