import { prisma } from './prisma';

/**
 * Tabellen in Fremdschlüssel-Reihenfolge: Eltern vor Kindern.
 *
 * Die Reihenfolge ist kein Ordnungsdetail, sie ist der Vertrag mit dem Zurückspielen.
 * `scripts/restore-backup.mjs` liest die Reihenfolge **aus der Sicherungsdatei** und läuft
 * sie beim Einfügen von oben nach unten ab (beim Leeren rückwärts). Dadurch gibt es die
 * Liste nur einmal – das Skript kennt keine eigene Kopie, die auseinanderlaufen könnte.
 *
 * Wer ein Modell zum Schema hinzufügt, trägt es hier ein. `__tests__/lib/backup.test.ts`
 * vergleicht die Liste gegen `prisma/schema.prisma` und wird rot, wenn eines fehlt: ein
 * vergessenes Modell fehlt sonst stillschweigend in jeder Sicherung, und zwar genau so
 * unauffällig wie die Mail-Queue ohne Auslöser.
 */
export const BACKUP_TABLES = [
  { name: 'Seller', model: 'seller', orderBy: 'sellerId' },
  { name: 'Task', model: 'task', orderBy: 'id' },
  { name: 'Basar', model: 'basar', orderBy: 'id' },
  { name: 'SellerIdCounter', model: 'sellerIdCounter', orderBy: 'id' },
  { name: 'SellerArticle', model: 'sellerArticle', orderBy: 'id' },
  { name: 'BasarSeller', model: 'basarSeller', orderBy: 'id' },
  { name: 'TaskSignup', model: 'taskSignup', orderBy: 'id' },
  { name: 'Cake', model: 'cake', orderBy: 'id' },
  { name: 'Article', model: 'article', orderBy: 'id' },
  { name: 'Sale', model: 'sale', orderBy: 'id' },
  { name: 'Settlement', model: 'settlement', orderBy: 'id' },
  { name: 'MailQueue', model: 'mailQueue', orderBy: 'id' },
  { name: 'ChatLog', model: 'chatLog', orderBy: 'id' },
  { name: 'ErrorLog', model: 'errorLog', orderBy: 'id' },
] as const;

/** Zeilen pro Abfrage. Hält den Speicherbedarf konstant, unabhängig von der Tabellengröße. */
const BATCH = 500;

/**
 * Erzeugt die Sicherung stückweise als JSON-Text.
 *
 * Bewusst ein Generator und kein `JSON.stringify(allesAufEinmal)`: bei 2.000 Verkäufern
 * liegen sechsstellige Artikel- und Verkaufszahlen an, dazu `MailQueue.html` mit dem
 * kompletten Mailtext je Zeile. Eine Variante, die erst alles in den Speicher lädt, fällt
 * genau dann um, wenn die Sicherung am wichtigsten ist – und liefert im Zweifel eine
 * abgeschnittene Datei, die wie eine gültige aussieht.
 *
 * Seitenweise über einen Cursor statt `skip`: `OFFSET` wird in Postgres mit wachsendem
 * Versatz linear teurer, über alle Seiten also quadratisch.
 *
 * `Prisma.Decimal` und `Date` serialisiert `JSON.stringify` über deren `toJSON()` zu
 * Zeichenketten; beide nimmt Prisma beim Einfügen in dieser Form wieder an.
 */
export async function* backupChunks(db: typeof prisma = prisma): AsyncGenerator<string> {
  yield `{"format":1,"createdAt":${JSON.stringify(new Date().toISOString())},"tables":{`;

  for (const [index, table] of BACKUP_TABLES.entries()) {
    yield `${index ? ',' : ''}${JSON.stringify(table.name)}:[`;

    let cursor: Record<string, unknown> | undefined;
    let written = 0;

    for (;;) {
      const rows: Record<string, unknown>[] = await (db as never as Record<string, {
        findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
      }>)[table.model].findMany({
        take: BATCH,
        orderBy: { [table.orderBy]: 'asc' },
        ...(cursor ? { cursor, skip: 1 } : {}),
      });

      if (rows.length === 0) break;
      for (const row of rows) yield `${written++ ? ',' : ''}${JSON.stringify(row)}`;
      if (rows.length < BATCH) break;

      cursor = { [table.orderBy]: rows[rows.length - 1][table.orderBy] };
    }

    yield ']';
  }

  yield '}}';
}
