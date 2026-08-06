-- CreateTable
CREATE TABLE "ChatLog" (
    "id" TEXT NOT NULL,
    "sellerId" INTEGER,
    "role" TEXT NOT NULL,
    "question" VARCHAR(300) NOT NULL,
    "matchedFaqId" TEXT,
    "resultType" TEXT NOT NULL,
    "helpful" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatLog_createdAt_idx" ON "ChatLog"("createdAt");
