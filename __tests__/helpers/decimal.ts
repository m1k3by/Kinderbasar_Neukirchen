import { Prisma } from '@prisma/client';

/**
 * Erzeugt einen Wert so, wie Prisma ihn für `@db.Decimal`-Spalten zurückgibt.
 *
 * Prisma liefert für Decimal-Spalten **kein** `number`, sondern ein `Prisma.Decimal`.
 * Dessen `valueOf()` gibt einen String zurück – `0 + decimal` ergibt deshalb keine Summe,
 * sondern eine Zeichenkette:
 *
 * ```
 * [2.50, 3.00, 10.00].reduce((s, x) => s + x, 0)                  → 15.5
 * [Dec('2.50'), Dec('3.00'), Dec('10.00')].reduce((s,x) => s+x,0) → "02.5310"
 * ```
 *
 * Fixtures, die Decimal-Spalten als `price: 2.5` mocken, verhalten sich also anders als die
 * echte Datenbank und würden eine fehlende `Number()`-Klammer im Produktivcode nicht
 * bemerken. Genau diese Lücke hatte am 11.08.2026 schon einmal zugeschlagen (leere
 * `SellerIdCounter`-Tabelle, siehe register.test.ts): Ein Mock, der sich anders verhält als
 * das echte System, bestätigt die falsche Annahme, statt sie zu widerlegen.
 *
 * Deshalb gilt: **Alles, was aus einer Prisma-Abfrage kommt und im Schema `Decimal` ist,
 * wird im Test mit `dec()` gemockt.** Nur Werte aus JSON-Request-Bodys bleiben `number` –
 * die kommen tatsächlich als Zahl herein.
 *
 * Decimal-Spalten laut `prisma/schema.prisma`:
 * `Article.price`, `SellerArticle.price`, `Sale.salePrice`, `Basar.commissionPercent`,
 * `Basar.entryFee`, `BasarSeller.commissionOverride`, `Settlement.grossRevenue`,
 * `Settlement.commissionAmount`, `Settlement.entryFeeAmount`, `Settlement.netPayout`.
 */
export const dec = (value: number | string) => new Prisma.Decimal(value);

/**
 * Wie eine Decimal-Spalte nach `NextResponse.json()` beim Client ankommt: als String.
 * `Prisma.Decimal.toJSON()` serialisiert zur Zeichenkette, nicht zur Zahl – Oberflächen
 * müssen deshalb `Number(...)` verwenden.
 */
export const decJson = (value: number | string) => new Prisma.Decimal(value).toString();
