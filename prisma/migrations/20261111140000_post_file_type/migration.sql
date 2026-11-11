-- Neuigkeiten: Typ des Anhangs (bisher nur PDF, jetzt auch Bilder und Office-Dokumente).
-- Erzeugt mit `prisma migrate diff` aus altem gegen neues Schema, nicht von Hand geschrieben.
-- Rein additiv, kein Backfill: Zeilen mit Datei und fileType NULL sind PDFs (vorher war nur PDF
-- erlaubt); der Code behandelt NULL überall als application/pdf (fileTypeOrPdf in app/lib/posts.ts).

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "fileType" VARCHAR(100);
