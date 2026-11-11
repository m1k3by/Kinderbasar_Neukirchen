-- Neuigkeiten (Post) für Startseite und RSS-Feed, optional mit PDF als BYTEA.
-- Erzeugt mit `prisma migrate diff` aus altem gegen neues Schema, nicht von Hand geschrieben.
-- Rein additiv: neue Tabelle samt Index, bestehende Tabellen bleiben unverändert.

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(5000) NOT NULL,
    "fileName" VARCHAR(200),
    "fileData" BYTEA,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Post_isPublished_publishedAt_idx" ON "Post"("isPublished", "publishedAt");

