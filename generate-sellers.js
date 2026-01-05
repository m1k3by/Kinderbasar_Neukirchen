const bcrypt = require('bcrypt');

// Deine Verkäufer-Daten hier einfügen
const sellers = [
  { sellerId: 1001, email: 'max@test.de', firstName: 'Max', lastName: 'Mustermann', password: 'test123', isEmployee: false },
  { sellerId: 1002, email: 'anna@test.de', firstName: 'Anna', lastName: 'Schmidt', password: 'test123', isEmployee: false },
  { sellerId: 1003, email: 'peter@test.de', firstName: 'Peter', lastName: 'Meyer', password: 'admin123', isEmployee: true },
];

async function generateSQL() {
  console.log('-- SQL INSERT Statements für Seller\n');
  
  for (const seller of sellers) {
    const hashedPassword = await bcrypt.hash(seller.password, 10);
    
    console.log(`INSERT INTO "Seller" ("sellerId", "email", "firstName", "lastName", "password", "isEmployee", "sellerStatusActive", "createdAt")`);
    console.log(`VALUES (${seller.sellerId}, '${seller.email}', '${seller.firstName}', '${seller.lastName}', '${hashedPassword}', ${seller.isEmployee}, false, NOW());\n`);
  }
}

generateSQL();
