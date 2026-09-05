import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  errorLog: { create: vi.fn(), count: vi.fn(), update: vi.fn() },
  mailQueue: { create: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

const deliverMailMock = vi.hoisted(() => vi.fn());
vi.mock('@/app/lib/mailQueue', () => ({ deliverMail: deliverMailMock }));

const realConsoleError = console.error;

/**
 * Frische Modulinstanz mit einer bekannten `console.error`-Ausgabe.
 *
 * Wichtig: errorLog.ts merkt sich die *ungepatchte* Ausgabe beim Laden des Moduls, nicht
 * beim Aufruf von installErrorLogger(). Der Ersatz muss also vor dem Import stehen – sonst
 * merkt sich eine zweite Instanz den Patch der ersten und ruft sich gegenseitig auf.
 */
async function load() {
  const original = vi.fn();
  console.error = original as unknown as typeof console.error;
  vi.resetModules();
  const mod = await import('@/app/lib/errorLog');
  return { mod, original };
}

beforeEach(() => {
  vi.clearAllMocks();
  console.error = realConsoleError;
  delete process.env.ADMIN_ALERT_EMAIL;
  prismaMock.errorLog.create.mockResolvedValue({ id: 'err-1' });
  prismaMock.errorLog.count.mockResolvedValue(0);
  prismaMock.errorLog.update.mockResolvedValue({ id: 'err-1' });
  prismaMock.mailQueue.create.mockResolvedValue({ id: 'mail-1' });
});

afterEach(() => {
  console.error = realConsoleError;
});

describe('parseConsoleErrorArgs', () => {
  it('splits the route prefix off the convention used in app/api/**', async () => {
    const { mod } = await load();
    const err = new Error('boom');
    const parsed = mod.parseConsoleErrorArgs(['GET /api/basars error:', err]);

    expect(parsed.route).toBe('GET /api/basars');
    expect(parsed.message).toContain('boom');
    expect(parsed.stack).toBe(err.stack);
  });

  it('keeps the message when the call does not follow the convention', async () => {
    const { mod } = await load();
    const parsed = mod.parseConsoleErrorArgs(['irgendwas ist kaputt']);

    expect(parsed.route).toBeNull();
    expect(parsed.message).toBe('irgendwas ist kaputt');
    expect(parsed.stack).toBeNull();
  });

  it('survives values that cannot be serialised', async () => {
    const { mod } = await load();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const parsed = mod.parseConsoleErrorArgs(['kaputt:', null, undefined, circular]);

    expect(parsed.message).toContain('null');
    expect(parsed.message).toContain('undefined');
    expect(parsed.message).toContain('[object Object]');
  });

  it('serialises objects instead of dropping them', async () => {
    const { mod } = await load();
    const parsed = mod.parseConsoleErrorArgs(['[MAIL-QUEUE] Send failed:', { id: 'mail-9' }]);

    expect(parsed.route).toBe('[MAIL-QUEUE] Send failed');
    expect(parsed.message).toContain('mail-9');
  });
});

describe('recordError', () => {
  it('writes the row and clips message and stack to the column lengths', async () => {
    const { mod } = await load();
    await mod.recordError({
      source: 'SERVER',
      message: 'x'.repeat(600),
      stack: 'y'.repeat(5000),
      route: 'r'.repeat(300),
      userAgent: 'u'.repeat(400),
    });

    const data = prismaMock.errorLog.create.mock.calls[0][0].data;
    expect(data.source).toBe('SERVER');
    expect(data.message).toHaveLength(500);
    expect(data.stack).toHaveLength(4000);
    expect(data.route).toHaveLength(200);
    expect(data.userAgent).toHaveLength(300);
  });

  it('keeps the seller of a client-side error', async () => {
    const { mod } = await load();
    await mod.recordError({ source: 'CLIENT', message: 'kaputt', sellerId: 1234, role: 'seller' });

    expect(prismaMock.errorLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sellerId: 1234, role: 'seller' }) })
    );
  });

  it('ignores an empty message instead of writing a useless row', async () => {
    const { mod } = await load();
    await mod.recordError({ source: 'CLIENT', message: '   ' });

    expect(prismaMock.errorLog.create).not.toHaveBeenCalled();
  });

  it('never throws when the database write fails', async () => {
    const { mod, original } = await load();
    prismaMock.errorLog.create.mockRejectedValue(new Error('db weg'));

    await expect(mod.recordError({ source: 'SERVER', message: 'kaputt' })).resolves.toBeUndefined();
    expect(original).toHaveBeenCalledWith(
      '[ERRORLOG] Fehler konnte nicht gespeichert werden:',
      expect.any(Error)
    );
  });

  it('sends an alert mail via the existing queue and marks the row as alerted', async () => {
    process.env.ADMIN_ALERT_EMAIL = 'admin@example.de';
    const { mod } = await load();
    await mod.recordError({ source: 'SERVER', message: 'kaputt', route: 'GET /api/basars' });

    expect(prismaMock.errorLog.update).toHaveBeenCalledWith({
      where: { id: 'err-1' },
      data: { alerted: true },
    });
    expect(prismaMock.mailQueue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ to: 'admin@example.de' }) })
    );
    expect(prismaMock.mailQueue.create.mock.calls[0][0].data.html).toContain('GET /api/basars');
    expect(deliverMailMock).toHaveBeenCalledWith('mail-1');
  });

  it('names the affected seller in the alert mail for a browser error', async () => {
    process.env.ADMIN_ALERT_EMAIL = 'admin@example.de';
    process.env.NEXT_PUBLIC_BASE_URL = 'https://basar.example';
    const { mod } = await load();
    await mod.recordError({ source: 'CLIENT', message: 'kaputt', sellerId: 1234 });

    const html = prismaMock.mailQueue.create.mock.calls[0][0].data.html;
    expect(html).toContain('1234');
    expect(html).toContain('im Browser eines Nutzers');
    expect(html).toContain('https://basar.example/admin/logs');
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });

  it('sends no second mail while one went out within the last hour', async () => {
    process.env.ADMIN_ALERT_EMAIL = 'admin@example.de';
    prismaMock.errorLog.count.mockResolvedValue(1);
    const { mod } = await load();
    await mod.recordError({ source: 'SERVER', message: 'kaputt' });

    expect(prismaMock.errorLog.create).toHaveBeenCalled();
    expect(prismaMock.mailQueue.create).not.toHaveBeenCalled();
    expect(prismaMock.errorLog.update).not.toHaveBeenCalled();
  });

  it('logs without mailing when ADMIN_ALERT_EMAIL is not configured', async () => {
    const { mod } = await load();
    await mod.recordError({ source: 'SERVER', message: 'kaputt' });

    expect(prismaMock.errorLog.create).toHaveBeenCalled();
    expect(prismaMock.mailQueue.create).not.toHaveBeenCalled();
  });
});

describe('installErrorLogger', () => {
  it('forwards to the original output and records the error', async () => {
    const { mod, original } = await load();
    mod.installErrorLogger();

    const err = new Error('boom');
    console.error('GET /api/basars error:', err);

    expect(original).toHaveBeenCalledWith('GET /api/basars error:', err);
    await vi.waitFor(() => expect(prismaMock.errorLog.create).toHaveBeenCalled());

    const data = prismaMock.errorLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ source: 'SERVER', route: 'GET /api/basars', stack: err.stack });
    expect(data.message).toContain('boom');
  });

  it('ignores prisma’s own warnings', async () => {
    const { mod, original } = await load();
    mod.installErrorLogger();

    console.error('prisma:warn', 'langsame Abfrage');

    expect(original).toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));
    expect(prismaMock.errorLog.create).not.toHaveBeenCalled();
  });

  it('does not loop when the write itself fails', async () => {
    prismaMock.errorLog.create.mockRejectedValue(new Error('db weg'));
    const { mod } = await load();
    mod.installErrorLogger();

    console.error('GET /api/basars error:', new Error('boom'));

    await vi.waitFor(() => expect(prismaMock.errorLog.create).toHaveBeenCalled());
    await new Promise((resolve) => setImmediate(resolve));
    expect(prismaMock.errorLog.create).toHaveBeenCalledTimes(1);
  });

  it('patches only once', async () => {
    const { mod } = await load();
    mod.installErrorLogger();
    const patched = console.error;
    mod.installErrorLogger();

    expect(console.error).toBe(patched);
  });
});
