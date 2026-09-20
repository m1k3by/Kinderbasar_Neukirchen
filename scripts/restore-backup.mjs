#!/usr/bin/env node
/**
 * Spielt eine Sicherung aus `GET /api/admin/backup` zurück.
 *
 *   node scripts/restore-backup.mjs sicherung.json
 *
 * Läuft bewusst **lokal und nicht aus der Oberfläche**. Eine Schaltfläche, die die
 * Produktivdatenbank leert, ist genau die Art nicht umkehrbarer Handlung, gegen die
 * `.claude/guard.js` existiert – ein Fehlklick am Basartag wäre nicht reparierbar.
 *
 * Zwei Riegel, beide über Umgebungsvariablen und nicht im Skript abschaltbar:
 *   RESTORE_ALLOW_WIPE=1     – bestätigt, dass die Zieltabellen geleert werden dürfen.
 *   RESTORE_ALLOW_REMOTE=1   – zusätzlich nötig, wenn das Ziel nicht localhost ist.
 *
 * Der zweite Riegel ist eine Schwelle, keine Mauer: im Ernstfall *ist* das Ziel die
 * entfernte Datenbank. Er soll nur verhindern, dass ein Übungslauf versehentlich
 * dorthin geht.
 *
 * Bekannte Abweichung: Spalten mit `@updatedAt` (`Basar.updatedAt`,
 * `SellerArticle.updatedAt`) setzt Prisma beim Einfügen auf „jetzt". Der ursprüngliche
 * Zeitstempel geht verloren, alle fachlich genutzten Daten bleiben erhalten.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const file = process.argv[2];
if (!file) {
  console.error('Aufruf: node scripts/restore-backup.mjs <sicherung.json>');
  process.exit(1);
}

const target = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_PRISMA_URL ?? '';
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(target);

if (process.env.RESTORE_ALLOW_WIPE !== '1') {
  console.error('Abbruch: Dieses Skript LEERT alle Tabellen, bevor es einfügt.');
  console.error('Wenn das gewollt ist: RESTORE_ALLOW_WIPE=1 setzen.');
  process.exit(1);
}
if (!isLocal && process.env.RESTORE_ALLOW_REMOTE !== '1') {
  console.error(`Abbruch: Ziel ist nicht localhost (${target.replace(/:[^:@]*@/, ':***@') || 'keine URL gesetzt'}).`);
  console.error('Für eine entfernte Datenbank zusätzlich RESTORE_ALLOW_REMOTE=1 setzen.');
  process.exit(1);
}

// Komplett einlesen und parsen, bevor irgendetwas geleert wird. Eine abgebrochene
// Sicherung endet ohne das schließende `}}` – dann scheitert JSON.parse hier, und die
// Zieldatenbank ist noch unberührt. Erst prüfen, dann löschen.
const backup = JSON.parse(readFileSync(file, 'utf8'));
if (backup.format !== 1 || !backup.tables) {
  console.error('Abbruch: Datei sieht nicht wie eine Sicherung dieses Systems aus.');
  process.exit(1);
}

// Die Fremdschlüssel-Reihenfolge steht in der Datei (Eltern vor Kindern, siehe
// app/lib/backup.ts). Sie wird hier nicht noch einmal aufgeschrieben, damit es keine
// zweite Liste gibt, die auseinanderlaufen kann.
const tableNames = Object.keys(backup.tables);
const modelOf = (name) => name[0].toLowerCase() + name.slice(1);
const CHUNK = 1000;

const prisma = new PrismaClient();

try {
  console.log(`Sicherung vom ${backup.createdAt}`);
  for (const name of tableNames) console.log(`  ${name}: ${backup.tables[name].length}`);

  // Leeren in umgekehrter Reihenfolge: Kinder vor Eltern.
  for (const name of [...tableNames].reverse()) {
    const { count } = await prisma[modelOf(name)].deleteMany({});
    if (count) console.log(`geleert  ${name}: ${count}`);
  }

  // Einfügen in Dateireihenfolge: Eltern vor Kindern.
  for (const name of tableNames) {
    const rows = backup.tables[name];
    for (let i = 0; i < rows.length; i += CHUNK) {
      await prisma[modelOf(name)].createMany({ data: rows.slice(i, i + CHUNK) });
    }
    if (rows.length) console.log(`geladen  ${name}: ${rows.length}`);
  }

  console.log('Fertig.');
} finally {
  await prisma.$disconnect();
}
