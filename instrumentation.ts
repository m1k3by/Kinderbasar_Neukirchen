/**
 * Läuft einmal beim Start jeder Laufzeit (Next.js `register`-Hook).
 *
 * Der Import ist bewusst dynamisch und hinter der Runtime-Prüfung: middleware.ts läuft in der
 * Edge Runtime, und app/lib/errorLog.ts zieht Prisma nach – ein statischer Import würde
 * Prisma in das Edge-Bundle ziehen, wo es nicht lauffähig ist.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Reihenfolge: beide Module zuerst laden – jedes merkt sich beim Laden das ungepatchte
  // console.error. Dann zuerst den ErrorLogger, danach den Forwarder: der Forwarder wrappt den
  // bereits gewrappten console.error und ruft ihn zuerst auf, jede Fehlerzeile erreicht also
  // ErrorLog *und* Axiom, ohne dass einer den anderen aufruft (keine Rekursion). Andersherum
  // würde errorLog.ts – falls es erst nach dem Forwarder geladen wird – dessen Wrapper als
  // „Original" binden; das ginge nur bei genau dieser Importreihenfolge gut.
  const { installErrorLogger } = await import('./app/lib/errorLog');
  const { installLogForwarder } = await import('./app/lib/logForward');
  installErrorLogger();
  installLogForwarder();
}
