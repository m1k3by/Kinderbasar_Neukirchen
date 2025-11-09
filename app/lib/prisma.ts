import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Helper function to get Prisma instance
// In Cloudflare Pages, you can pass the D1 binding if needed
export const getPrismaClient = () => {
  // For now, use standard PrismaClient
  // When deploying to Cloudflare with D1, you'll need to use PrismaD1 adapter
  // and pass the env.DB binding from the edge runtime context
  return new PrismaClient();
};

export const prisma = globalForPrisma.prisma || getPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Note: For Cloudflare D1 integration, you'll need to:
// 1. Install @prisma/adapter-d1
// 2. Update this file to use PrismaD1 adapter
// 3. Pass the D1 binding from the edge runtime context
// Example:
// import { PrismaD1 } from '@prisma/adapter-d1';
// const adapter = new PrismaD1(env.DB);
// const prisma = new PrismaClient({ adapter });