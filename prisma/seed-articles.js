/**
 * Zufällige Beispielartikel für einen Verkäufer anlegen – zum Testen von Etiketten,
 * Kasse und Statistik.
 *
 *   node prisma/seed-articles.js <sellerId> [anzahl] [--basar=<id>] --yes
 *   node prisma/seed-articles.js <sellerId> --undo [--basar=<id>] --yes
 *
 * Beispiel: node prisma/seed-articles.js 9001 20 --yes
 *
 * Legt dieselben Daten an wie POST /api/basars/[id]/articles: Article UND
 * SellerArticle (Archiv) in einer Transaktion, mit gemeinsamem QR-Code.
 *
 * Alle so erzeugten Artikel bekommen einen QR-Code mit Präfix "sample-" und sind
 * dadurch eindeutig als Testdaten erkennbar – `--undo` löscht genau diese wieder.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const SAMPLE_PREFIX = 'sample-';

// Titel + passende Größenart. sizeKind null = kein Kleidungsstück (weder Größe
// noch Geschlecht) – genau die Regel, die auch das Artikelformular verwendet.
const CATALOG = [
  { title: 'Jeans blau', sizeKind: 'w' },
  { title: 'Jeans schwarz', sizeKind: 'w' },
  { title: 'Cargohose', sizeKind: 'w' },
  { title: 'T-Shirt gestreift', sizeKind: 'cm' },
  { title: 'Langarmshirt', sizeKind: 'cm' },
  { title: 'Winterjacke', sizeKind: 'cm' },
  { title: 'Regenjacke', sizeKind: 'cm' },
  { title: 'Strickpullover', sizeKind: 'cm' },
  { title: 'Sommerkleid', sizeKind: 'cm' },
  { title: 'Schlafanzug', sizeKind: 'cm' },
  { title: 'Fleecejacke', sizeKind: 'letter' },
  { title: 'Kapuzenpulli', sizeKind: 'letter' },
  { title: 'Turnschuhe', sizeKind: 'shoe' },
  { title: 'Gummistiefel', sizeKind: 'shoe' },
  { title: 'Winterstiefel', sizeKind: 'shoe' },
  { title: 'Hausschuhe', sizeKind: 'shoe' },
  { title: 'Holzeisenbahn', sizeKind: null },
  { title: 'Puzzle 100 Teile', sizeKind: null },
  { title: 'Bausteine Kiste', sizeKind: null },
  { title: 'Kindersitz', sizeKind: null },
  { title: 'Bobbycar', sizeKind: null },
  { title: 'Puppenwagen', sizeKind: null },
  { title: 'Bilderbuch-Set', sizeKind: null },
  { title: 'Brettspiel', sizeKind: null },
  { title: 'Kuscheltier gross', sizeKind: null },
  { title: 'Laufrad', sizeKind: null },
];

const GENDERS = ['Junge', 'Mädchen', 'Unisex'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Preis als Vielfaches von 0,50 €, klein gewichtet – so sieht die Preisverteilung
 *  realistisch aus statt gleichverteilt. */
function randomPrice() {
  const r = Math.random();
  const euros = r < 0.55 ? 0.5 + Math.random() * 4      // 0,50 – 4,50
    : r < 0.85 ? 4.5 + Math.random() * 6                 // 4,50 – 10,50
      : 10.5 + Math.random() * 14;                       // 10,50 – 24,50
  return Math.max(0.5, Math.round(euros * 2) / 2);
}

const SIZE_FILTERS = {
  letter: (s) => /^(XXS|XS|S|M|L|XL|XXL|3XL|4XL|5XL)$/.test(s),
  cm: (s) => /^\d+$/.test(s) && +s >= 50 && +s <= 176,
  w: (s) => /^W\d+$/.test(s),
  shoe: (s) => /^\d+$/.test(s) && +s >= 18 && +s <= 49,
};

// parseSizes aus app/lib/sizes.ts – hier bewusst dupliziert, weil dieses Script
// CommonJS ist und die App-Datei TypeScript. 3 Zeilen statt einer Build-Kette.
function parseSizes(raw) {
  const DEFAULT = 'XXS,XS,S,M,L,XL,XXL,3XL,4XL,5XL,50,56,62,68,74,80,86,92,98,104,110,116,122,128,134,140,146,152,158,164,170,176,W24,W25,W26,W27,W28,W29,W30,W31,W32,W33,W34,W36,W38,W40,W42,W44,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49';
  return [...new Set((raw && raw.trim() ? raw : DEFAULT).split(',').map((s) => s.trim()).filter(Boolean))];
}

function parseArgs(argv) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const flag = (name) => argv.some((a) => a === `--${name}`);
  const value = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  return {
    sellerId: parseInt(positional[0], 10),
    count: positional[1] ? parseInt(positional[1], 10) : 15,
    basarId: value('basar'),
    undo: flag('undo'),
    yes: flag('yes'),
  };
}

async function main() {
  const { sellerId, count, basarId, undo, yes } = parseArgs(process.argv.slice(2));

  if (!Number.isInteger(sellerId)) {
    console.error('Verkäufernummer fehlt.\n  node prisma/seed-articles.js <sellerId> [anzahl] [--basar=<id>] --yes');
    process.exit(1);
  }

  const seller = await prisma.seller.findUnique({ where: { sellerId } });
  if (!seller) {
    console.error(`Verkäufer #${sellerId} existiert nicht.`);
    process.exit(1);
  }

  const basar = basarId
    ? await prisma.basar.findUnique({ where: { id: basarId } })
    : await prisma.basar.findFirst({ where: { status: 'OPEN', isArchived: false }, orderBy: { eventDate: 'desc' } });
  if (!basar) {
    console.error('Kein Basar gefunden. Mit --basar=<id> einen angeben (nur OPEN-Basare werden automatisch gewählt).');
    process.exit(1);
  }

  // Schreibt in die Datenbank aus .env – im Zweifel die Produktivdatenbank. Prisma lädt
  // .env intern, ohne process.env zu füllen; deshalb hier selbst nachsehen. Ohne diese
  // Zeile sieht man nicht, ob man gerade Produktivdaten anfasst.
  const host = (() => {
    try {
      const env = require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8');
      const url = (env.match(/^\s*(?:POSTGRES_PRISMA_URL|DATABASE_URL)\s*=\s*"?([^"\n\r]+)"?/m) || [])[1] || '';
      return url.replace(/\/\/[^@]*@/, '//***@') || '(unbekannt)';
    } catch { return '(unbekannt)'; }
  })();
  console.log(`Ziel:      ${host}`);
  console.log(`Basar:     ${basar.title} (${basar.id}, Status ${basar.status})`);
  console.log(`Verkäufer: ${seller.firstName} ${seller.lastName} #${sellerId}`);
  console.log(undo ? 'Aktion:    Beispielartikel LÖSCHEN' : `Aktion:    ${count} Beispielartikel anlegen`);
  if (!yes) {
    console.error('\nAbgebrochen: zum Ausführen --yes anhängen.');
    process.exit(1);
  }

  const basarSeller = await prisma.basarSeller.upsert({
    where: { basarId_sellerId: { basarId: basar.id, sellerId } },
    update: {},
    // Inaktiv wie in POST /api/basars/[id]/articles – Artikel anlegen ist von der
    // Teilnahme entkoppelt und darf keinen Teilnehmerplatz belegen.
    create: { basarId: basar.id, sellerId, isActive: false, activatedAt: null },
  });

  if (undo) {
    const { count: removed } = await prisma.article.deleteMany({
      where: { basarSellerId: basarSeller.id, qrCode: { startsWith: SAMPLE_PREFIX } },
    });
    const { count: removedArchive } = await prisma.sellerArticle.deleteMany({
      where: { sellerId, qrCode: { startsWith: SAMPLE_PREFIX } },
    });
    console.log(`\n${removed} Artikel und ${removedArchive} Archiv-Einträge gelöscht.`);
    return;
  }

  const existing = await prisma.article.count({ where: { basarSellerId: basarSeller.id } });
  const max = basarSeller.maxArticlesOverride ?? basar.maxArticlesPerSeller;
  const toCreate = Math.min(count, Math.max(0, max - existing));
  if (toCreate < count) {
    console.log(`\nHinweis: Limit ${max}, bereits ${existing} vorhanden → nur ${toCreate} werden angelegt.`);
  }

  const sizes = parseSizes(basar.allowedSizes);
  let clothing = 0;

  for (let i = 0; i < toCreate; i++) {
    const item = pick(CATALOG);
    const pool = item.sizeKind ? sizes.filter(SIZE_FILTERS[item.sizeKind]) : [];
    const isClothing = item.sizeKind !== null && pool.length > 0;
    if (isClothing) clothing++;

    const data = {
      title: item.title.slice(0, 30),
      sizeLabel: isClothing ? pick(pool) : null,
      gender: isClothing ? pick(GENDERS) : null,
      price: randomPrice(),
      qrCode: SAMPLE_PREFIX + crypto.randomUUID(),
    };

    await prisma.$transaction(async (tx) => {
      const archive = await tx.sellerArticle.create({ data: { sellerId, ...data } });
      await tx.article.create({
        data: { basarSellerId: basarSeller.id, sellerArticleId: archive.id, ...data },
      });
    });
  }

  console.log(`\n${toCreate} Artikel angelegt: ${clothing} Kleidung, ${toCreate - clothing} keine Kleidung.`);
  console.log(`Rückgängig: node prisma/seed-articles.js ${sellerId} --undo --basar=${basar.id} --yes`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
