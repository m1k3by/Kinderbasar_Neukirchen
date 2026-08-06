-- Atomic sellerId allocation counter.
--
-- Registration used to load every sellerId in 1000-9999 and scan for the first free slot,
-- redone on every retry attempt. At 2000+ concurrent registrations this is O(n) work per
-- request AND races (two requests can compute the same "next free" id and one gets a P2002
-- on create). This table replaces that with a single atomically-incremented counter:
-- allocation is one `UPDATE ... SET "nextId" = "nextId" + 1 ... RETURNING` statement, which
-- Postgres serializes at the row level, so two concurrent requests always get different ids.
--
-- CreateTable
CREATE TABLE "SellerIdCounter" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "nextId" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "SellerIdCounter_pkey" PRIMARY KEY ("id")
);

-- Seed the single counter row. nextId starts at one past the highest sellerId already in use
-- within the 1000-9999 range (or 1000 if the range is still empty), so existing installations
-- keep allocating forward from where the old gap-scanning logic left off instead of colliding
-- with already-registered sellers.
INSERT INTO "SellerIdCounter" ("id", "nextId")
SELECT 'default', GREATEST(1000, COALESCE((SELECT MAX("sellerId") FROM "Seller" WHERE "sellerId" BETWEEN 1000 AND 9999), 999) + 1)
ON CONFLICT ("id") DO NOTHING;
