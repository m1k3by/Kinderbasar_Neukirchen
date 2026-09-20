import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Das Modul hält seinen Zustand (Zähler, bereits gemeldete Schlüssel) in Modulvariablen –
 * deshalb pro Test frisch laden, sonst greift die Entdopplung über Testgrenzen hinweg.
 */
async function load() {
  vi.resetModules();
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  const { reportClientError } = await import('@/app/components/ErrorReporter');
  return { reportClientError, fetchMock };
}

describe('reportClientError', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('meldet einen echten Fehler', async () => {
    const { reportClientError, fetchMock } = await load();

    reportClientError('Cannot read properties of undefined', 'at Foo');

    expect(fetchMock).toHaveBeenCalledWith('/api/errors', expect.anything());
  });

  it.each(['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.'])(
    'meldet abgebrochene Netzwerkanfragen nicht: %s',
    async (message) => {
      const { reportClientError, fetchMock } = await load();

      reportClientError(message, null);

      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('meldet weiterhin, wenn der Wortlaut nur zufällig ähnlich ist', async () => {
    const { reportClientError, fetchMock } = await load();

    reportClientError('Import fehlgeschlagen: Failed to fetch');

    expect(fetchMock).toHaveBeenCalled();
  });
});
