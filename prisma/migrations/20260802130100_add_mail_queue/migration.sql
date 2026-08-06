-- Outbound mail queue. Registration (and other flows going forward) enqueue a row here
-- instead of calling the SMTP transport synchronously in the request path. A processor route
-- (app/api/admin/mail-queue/route.ts) drains PENDING rows in batches with retry/backoff.
--
-- CreateEnum
CREATE TYPE "MailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "MailQueue" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "attachmentsJson" TEXT,
    "status" "MailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "MailQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailQueue_status_createdAt_idx" ON "MailQueue"("status", "createdAt");
