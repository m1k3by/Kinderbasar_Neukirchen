// Log-Weiterleitung nach Axiom: console.log/info/warn/error gehen zusätzlich per HTTP an
// einen externen Dienst. Grund: Vercel Hobby behält Logs nur eine Stunde.
//
// Kein SDK, nur `fetch` – für eine einzige POST-Anfrage lohnt keine Abhängigkeit.
import { after } from 'next/server';

/**
 * Referenz auf die *unersetzte* Ausgabe, beim Laden des Moduls gemerkt (wie in errorLog.ts).
 * Fehler beim Versand gehen nur hierüber – über das gewrappte `console.error` wäre das eine
 * Endlosschleife, und über den ErrorLog-Abgriff würde ein Axiom-Ausfall die Tabelle fluten.
 */
const rawConsoleError: typeof console.error = console.error.bind(console);

const MAX_MESSAGE = 8000;
const LEVELS = ['log', 'info', 'warn', 'error'] as const;

export function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value === null || value === undefined) return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

let installed = false;

/**
 * Ersetzt die vier console-Methoden global. Das Original läuft immer zuerst – das Vercel-Log
 * bleibt vollständig, Axiom ist ein zweiter Ort, kein Ersatz.
 *
 * ponytail: eine HTTP-Anfrage pro Logzeile, kein Batching – bei dem Verkehr hier unkritisch;
 * Puffern und gesammelt senden, sobald das Volumen wächst.
 */
export function installLogForwarder(): void {
  // Direkt aus process.env und nicht über app/lib/env.ts: das wirft beim Import, wenn
  // JWT_SECRET oder ADMIN_PASS fehlen, und würde den Serverstart abbrechen.
  const token = process.env.AXIOM_TOKEN;
  const dataset = process.env.AXIOM_DATASET;
  if (installed || !token || !dataset) return;
  installed = true;

  // US-East-Edge: der Gratis-Plan von Axiom bietet nur diese Region (Entscheidung 10.11.2026).
  // EU (eu-central-1.aws.edge.axiom.co) wäre ein kostenpflichtiges Add-on – dann per AXIOM_INGEST_URL.
  const url =
    process.env.AXIOM_INGEST_URL || `https://us-east-1.aws.edge.axiom.co/v1/ingest/${dataset}`;

  for (const level of LEVELS) {
    const original = console[level].bind(console);

    console[level] = (...args: unknown[]) => {
      original(...args);

      // Der Dev-Server spiegelt die Browser-Konsole ins Terminal (`[browser] …`) – siehe errorLog.ts.
      const first = typeof args[0] === 'string' ? args[0] : '';
      if (first.includes('[browser]')) return;

      const send = async () => {
        try {
          const error = args.find((a): a is Error => a instanceof Error);
          // Nicht-2xx bewusst ignoriert: Logging darf nie selbst Lärm machen.
          await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            // after() hält die Invocation offen, bis der Versand fertig ist – ohne Frist hinge
            // jede loggende Anfrage an einem langsamen Axiom bis zum Function-Timeout.
            signal: AbortSignal.timeout(3000),
            body: JSON.stringify([
              {
                _time: new Date().toISOString(),
                level,
                message: args.map(stringify).join(' ').slice(0, MAX_MESSAGE),
                ...(error?.stack ? { stack: error.stack } : {}),
              },
            ]),
          });
        } catch (e) {
          rawConsoleError('[LOGFORWARD] Versand nach Axiom fehlgeschlagen:', e);
        }
      };

      // Wie in errorLog.ts: ohne `after()` friert Vercel die Invocation nach der Antwort ein und
      // der Versand geht verloren. Außerhalb eines Requests wirft `after()` – dort direkt senden.
      try {
        after(send);
      } catch {
        void send();
      }
    };
  }
}
