/**
 * Läuft einmal beim Start jeder Laufzeit (Next.js `register`-Hook).
 *
 * Der Import ist bewusst dynamisch und hinter der Runtime-Prüfung: middleware.ts läuft in der
 * Edge Runtime, und app/lib/errorLog.ts zieht Prisma nach – ein statischer Import würde
 * Prisma in das Edge-Bundle ziehen, wo es nicht lauffähig ist.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { installErrorLogger } = await import('./app/lib/errorLog');
  installErrorLogger();
}
