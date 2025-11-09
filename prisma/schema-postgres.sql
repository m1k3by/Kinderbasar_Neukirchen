-- PostgreSQL Schema for Vercel Postgres
-- Use this if you switch from SQLite to PostgreSQL

-- CreateTable Seller
CREATE TABLE "Seller" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "sellerId" INTEGER NOT NULL UNIQUE,
    "isEmployee" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "password" TEXT,
    "qrCode" TEXT,
    "barcode" TEXT
);

-- CreateTable Task
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable TaskSignup
CREATE TABLE "TaskSignup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskSignup_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskSignup_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskSignup_taskId_sellerId_unique" UNIQUE ("taskId", "sellerId")
);

-- CreateTable Cake
CREATE TABLE "Cake" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cakeName" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cake_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndexes
CREATE UNIQUE INDEX "Seller_email_key" ON "Seller"("email");
CREATE UNIQUE INDEX "Seller_sellerId_key" ON "Seller"("sellerId");
CREATE UNIQUE INDEX "TaskSignup_taskId_sellerId_key" ON "TaskSignup"("taskId", "sellerId");
