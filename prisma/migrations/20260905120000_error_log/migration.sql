-- Fehler-Monitoring: eine Zeile pro erfasstem Fehler, sichtbar unter /admin/logs.
-- Bis hierhin landeten Serverfehler ausschliesslich im Vercel-Log und Browserfehler
-- nirgendwo; ein Nutzer, bei dem etwas nicht klappte, musste anrufen.

CREATE TYPE "ErrorSource" AS ENUM ('SERVER', 'CLIENT');

CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "source" "ErrorSource" NOT NULL,
    "route" VARCHAR(200),
    "message" VARCHAR(500) NOT NULL,
    "stack" VARCHAR(4000),
    "sellerId" INTEGER,
    "role" TEXT,
    "userAgent" VARCHAR(300),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "alerted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- Die Adminsicht filtert auf offene Fehler, der Aufraeumlauf im taeglichen Cron auf Alter.
CREATE INDEX "ErrorLog_resolved_createdAt_idx" ON "ErrorLog"("resolved", "createdAt");
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");
