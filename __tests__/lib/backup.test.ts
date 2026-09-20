import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dec } from '../helpers/decimal';

vi.mock('@/app/lib/prisma', () => ({ prisma: {} }));

import { BACKUP_TABLES, backupChunks } from '@/app/lib/backup';

/** Prisma-Cursor-Semantik: `cursor` zeigt auf eine Zeile, `skip: 1` überspringt sie. */
function fakeDb(rowsByTable: Record<string, Record<string, unknown>[]>) {
  const db: Record<string, unknown> = {};
  for (const table of BACKUP_TABLES) {
    const all = rowsByTable[table.name] ?? [];
    db[table.model] = {
      findMany: vi.fn(async ({ take, cursor, skip }: {
        take: number;
        cursor?: Record<string, unknown>;
        skip?: number;
      }) => {
        const start = cursor
          ? all.findIndex((row) => row[table.orderBy] === cursor[table.orderBy]) + (skip ?? 0)
          : 0;
        return all.slice(start, start + take);
      }),
    };
  }
  return db as never;
}

async function collect(db: never) {
  let out = '';
  for await (const chunk of backupChunks(db)) out += chunk;
  return out;
}

describe('backupChunks', () => {
  it('erfasst jedes Modell aus prisma/schema.prisma', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    const inSchema = [...schema.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]).sort();
    const inBackup = BACKUP_TABLES.map((t) => t.name).sort();

    // Schlägt fehl, sobald ein neues Modell im Schema steht, das die Sicherung nicht kennt.
    // Ohne diesen Test fehlt die Tabelle stillschweigend in jeder Sicherung – auffallen
    // würde es erst beim Zurückspielen, also im Ernstfall.
    expect(inBackup).toEqual(inSchema);
  });

  it('führt Eltern vor Kindern auf, sonst scheitert das Zurückspielen an den Fremdschlüsseln', () => {
    const order = Object.fromEntries(BACKUP_TABLES.map((t, i) => [t.name, i]));
    const fremdschluessel: [child: string, parent: string][] = [
      ['TaskSignup', 'Task'], ['TaskSignup', 'Seller'], ['TaskSignup', 'Basar'],
      ['Cake', 'Seller'], ['Cake', 'Basar'],
      ['BasarSeller', 'Basar'], ['BasarSeller', 'Seller'],
      ['SellerArticle', 'Seller'],
      ['Article', 'BasarSeller'], ['Article', 'SellerArticle'],
      ['Sale', 'Basar'], ['Sale', 'Article'], ['Sale', 'Seller'],
      ['Settlement', 'BasarSeller'],
    ];

    for (const [child, parent] of fremdschluessel) {
      expect(order[parent], `${parent} muss vor ${child} stehen`).toBeLessThan(order[child]);
    }
  });

  it('liefert gültiges JSON mit allen Tabellen, auch den leeren', async () => {
    const json = JSON.parse(await collect(fakeDb({})));

    expect(json.format).toBe(1);
    expect(Object.keys(json.tables)).toEqual(BACKUP_TABLES.map((t) => t.name));
    for (const table of BACKUP_TABLES) expect(json.tables[table.name]).toEqual([]);
  });

  it('serialisiert Decimal und Date so, wie Prisma sie beim Einfügen wieder annimmt', async () => {
    const soldAt = new Date('2026-03-14T10:30:00.000Z');
    const json = JSON.parse(await collect(fakeDb({
      Sale: [{ id: 's1', salePrice: dec('12.50'), soldAt, isCancelled: false }],
      Article: [{ id: 'a1', price: dec('3.00'), title: 'Jacke' }],
    })));

    // Decimal als Zeichenkette, nicht als Gleitkommazahl: 12.50 darf nicht zu 12.5
    // gerundet oder zu einer Zahl werden, an der später Cent fehlen.
    expect(json.tables.Sale[0].salePrice).toBe('12.5');
    expect(json.tables.Article[0].price).toBe('3');
    expect(json.tables.Sale[0].soldAt).toBe('2026-03-14T10:30:00.000Z');
    expect(json.tables.Sale[0].isCancelled).toBe(false);
  });

  it('holt Tabellen über den Cursor seitenweise und schreibt jede Zeile genau einmal', async () => {
    // Mehr als eine Seite (BATCH = 500), damit die Schleife tatsächlich blättert.
    const articles = Array.from({ length: 1201 }, (_, i) => ({ id: `a${i}`, title: `Artikel ${i}` }));
    const db = fakeDb({ Article: articles });

    const json = JSON.parse(await collect(db));

    expect(json.tables.Article).toHaveLength(1201);
    expect(json.tables.Article[0].id).toBe('a0');
    expect(json.tables.Article[1200].id).toBe('a1200');
    expect(new Set(json.tables.Article.map((a: { id: string }) => a.id)).size).toBe(1201);

    // 3 volle Seiten + eine angebrochene: die letzte beendet die Schleife.
    const findMany = (db as unknown as Record<string, { findMany: { mock: { calls: unknown[] } } }>).article.findMany;
    expect(findMany.mock.calls).toHaveLength(3);
  });
});
