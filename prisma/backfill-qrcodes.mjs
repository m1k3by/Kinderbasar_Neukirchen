/**
 * One-time backfill: copy the most recent Article.qrCode → SellerArticle.qrCode
 * for all archive entries that were created before stable QR codes were introduced.
 *
 * Run once after `npx prisma db push`:
 *   node prisma/backfill-qrcodes.mjs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find SellerArticles that still have no qrCode but have linked Articles
  const stale = await prisma.sellerArticle.findMany({
    where: { qrCode: null },
    include: {
      articles: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { qrCode: true },
      },
    },
  });

  console.log(`Found ${stale.length} SellerArticle(s) without a stable QR code.`);

  let updated = 0;
  let skipped = 0;

  for (const sa of stale) {
    const latestQr = sa.articles[0]?.qrCode;
    if (!latestQr) {
      // No Article row at all – generate a fresh code so it's ready for future basars
      await prisma.sellerArticle.update({
        where: { id: sa.id },
        data: { qrCode: crypto.randomUUID() },
      });
      updated++;
      continue;
    }

    // Check that this qrCode isn't already taken by another SellerArticle
    const conflict = await prisma.sellerArticle.findFirst({
      where: { qrCode: latestQr, id: { not: sa.id } },
    });

    if (conflict) {
      // Collision (shouldn't normally happen) – assign a fresh code
      await prisma.sellerArticle.update({
        where: { id: sa.id },
        data: { qrCode: crypto.randomUUID() },
      });
      skipped++;
    } else {
      await prisma.sellerArticle.update({
        where: { id: sa.id },
        data: { qrCode: latestQr },
      });
      updated++;
    }
  }

  console.log(`Done. Updated: ${updated}, collision-resolved: ${skipped}.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
