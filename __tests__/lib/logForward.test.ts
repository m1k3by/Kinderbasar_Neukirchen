import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Führt den Rückruf sofort aus – entspricht „Request-Kontext vorhanden".
const afterMock = vi.hoisted(() => vi.fn((fn: () => unknown) => { fn(); }));
vi.mock('next/server', () => ({ after: afterMock }));

const saved = {
  log: console.log, info: console.info, warn: console.warn, error: console.error,
  fetch: global.fetch,
};
const fetchMock = vi.fn();
let originals: Record<'log' | 'info' | 'warn' | 'error', ReturnType<typeof vi.fn>>;

/** Frisches Modul (installed-Flag zurückgesetzt) über bekannten Original-Methoden. */
async function load() {
  originals = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  Object.assign(console, originals);
  vi.resetModules();
  const mod = await import('@/app/lib/logForward');
  mod.installLogForwarder();
}

const body = () => JSON.parse(fetchMock.mock.calls[0][1].body)[0];

beforeEach(() => {
  vi.clearAllMocks();
  afterMock.mockImplementation((fn: () => unknown) => { fn(); });
  fetchMock.mockResolvedValue({ ok: true });
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.AXIOM_TOKEN = 'xaat-test';
  process.env.AXIOM_DATASET = 'basar';
  delete process.env.AXIOM_INGEST_URL;
});

afterEach(() => {
  Object.assign(console, { log: saved.log, info: saved.info, warn: saved.warn, error: saved.error });
  global.fetch = saved.fetch;
  delete process.env.AXIOM_TOKEN;
  delete process.env.AXIOM_DATASET;
});

describe('installLogForwarder', () => {
  it('does nothing without AXIOM_TOKEN', async () => {
    delete process.env.AXIOM_TOKEN;
    await load();
    console.warn('x');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.warn).toBe(originals.warn);
  });

  it('posts an info line to the US East edge with bearer token', async () => {
    await load();
    console.info('POST /api/x:', 'hallo');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://us-east-1.aws.edge.axiom.co/v1/ingest/basar');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer xaat-test');
    expect(init.headers['Content-Type']).toBe('application/json');
    // Frist: after() hält die Invocation sonst an einem hängenden Axiom fest.
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(body().level).toBe('info');
    expect(body().message).toContain('hallo');
    expect(body()._time).toEqual(expect.any(String));
  });

  it('forwards the stack of an Error argument', async () => {
    await load();
    const err = new Error('boom');
    console.error('GET /api/y error:', err);

    expect(body().level).toBe('error');
    expect(body().stack).toBe(err.stack);
  });

  it('still calls the original with the same args', async () => {
    await load();
    console.log('a', 1);
    expect(originals.log).toHaveBeenCalledWith('a', 1);
  });

  it('does not throw when fetch rejects', async () => {
    await load();
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(() => console.log('x')).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('does not forward [browser] lines', async () => {
    await load();
    console.log('[browser] hi');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(originals.log).toHaveBeenCalled();
  });
});
