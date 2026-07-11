-- Storno bricks article: Sale.articleId was @unique, so re-selling an article after its
-- previous sale was cancelled (Storno) violated the unique constraint and 500'd the whole
-- checkout batch. This migration removes that constraint and replaces it with:
--   1) a plain (non-unique) index for lookup performance, and
--   2) a partial unique index that still guarantees at most one *active*
--      (isCancelled = false) sale per article at the DB level, as a backstop for the
--      conditional-update logic in app/api/basars/[id]/sales/route.ts.
--
-- It also makes Sale.cashierId nullable, since admin checkouts have no sellerId
-- (decoded.sellerId is undefined for the admin token) and previously fell back to 0,
-- which violated the cashierId -> Seller foreign key.

-- Drop the old unique constraint/index on Sale.articleId
DROP INDEX IF EXISTS "Sale_articleId_key";

-- Plain index for lookups by articleId (queries, joins)
CREATE INDEX IF NOT EXISTS "Sale_articleId_idx" ON "Sale"("articleId");

-- DB-level backstop: at most one active (non-cancelled) sale per article
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_articleId_active_key" ON "Sale"("articleId") WHERE "isCancelled" = false;

-- Admin checkout: cashierId may be NULL (admins have no sellerId)
ALTER TABLE "Sale" ALTER COLUMN "cashierId" DROP NOT NULL;
