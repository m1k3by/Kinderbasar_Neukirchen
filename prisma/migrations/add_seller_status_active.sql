-- Migration: Add sellerStatusActive field to Seller table
-- This migration adds a new boolean field to track whether employees have activated their seller status

ALTER TABLE "Seller" ADD COLUMN "sellerStatusActive" BOOLEAN NOT NULL DEFAULT false;

-- Comment: Default is false, employees must manually activate to become sellers
