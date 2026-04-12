const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const testSellers = [
  {
    sellerId: 9001,
    email: 'test.seller1@example.com',
    firstName: 'Anna',
    lastName: 'Testmann',
    password: 'Test1234',
    isEmployee: false,
    isCashier: false,
    sellerStatusActive: true,
  },
  {
    sellerId: 9002,
    email: 'test.seller2@example.com',
    firstName: 'Klaus',
    lastName: 'Beispiel',
    password: 'Test1234',
    isEmployee: false,
    isCashier: false,
    sellerStatusActive: true,
  },
  {
    sellerId: 9003,
    email: 'test.employee@example.com',
    firstName: 'Maria',
    lastName: 'Mitarbeiter',
    password: 'Test1234',
    isEmployee: true,
    isCashier: false,
    sellerStatusActive: true,
  },
  {
    sellerId: 9004,
    email: 'test.cashier@example.com',
    firstName: 'Hans',
    lastName: 'Kasse',
    password: 'Test1234',
    isEmployee: true,
    isCashier: true,
    sellerStatusActive: true,
  },
];

async function main() {
  console.log('Seeding test users...\n');

  for (const seller of testSellers) {
    const hashedPassword = await bcrypt.hash(seller.password, 10);

    await prisma.seller.upsert({
      where: { sellerId: seller.sellerId },
      update: {
        password: hashedPassword,
      },
      create: {
        sellerId: seller.sellerId,
        email: seller.email,
        firstName: seller.firstName,
        lastName: seller.lastName,
        password: hashedPassword,
        isEmployee: seller.isEmployee,
        isCashier: seller.isCashier,
        sellerStatusActive: seller.sellerStatusActive,
      },
    });

    const role = seller.isCashier ? 'Cashier' : seller.isEmployee ? 'Employee' : 'Seller';
    console.log(`✓ ${seller.email} (${role}) — Passwort: ${seller.password}`);
  }

  console.log('\nFertig! Alle Test-User angelegt.');
  console.log('\n--- Login-Daten ---');
  console.log('Email:    test.seller1@example.com  |  PW: Test1234  (Seller)');
  console.log('Email:    test.seller2@example.com  |  PW: Test1234  (Seller)');
  console.log('Email:    test.employee@example.com |  PW: Test1234  (Employee)');
  console.log('Email:    test.cashier@example.com  |  PW: Test1234  (Cashier)');
}

main()
  .catch((e) => {
    console.error('Fehler beim Seeden:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
