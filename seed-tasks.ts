import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Delete existing tasks
  await prisma.task.deleteMany();

  // Create tasks
  const tasks = [
    { title: 'Tische holen', day: 'FR', capacity: 2 },
    { title: 'Tische stellen', day: 'FR', capacity: 8 },
    { title: 'Annahme 16–18 Uhr', day: 'FR', capacity: 2 },
    { title: 'Vorsortieren 16:00–20:00 Uhr', day: 'FR', capacity: 6 },
    { title: 'Küchenunterstützung', day: 'SA', capacity: 4 },
    { title: 'Kuchenverkauf', day: 'SA', capacity: 4 },
    { title: 'Tische holen', day: 'SO', capacity: 2 },
    { title: 'Tische stellen', day: 'SO', capacity: 8 },
    { title: 'Annahme 16–18 Uhr', day: 'SO', capacity: 2 },
    { title: 'Küchenunterstützung', day: 'SO', capacity: 4 },
    { title: 'Vorsortieren 16:00–20:00 Uhr', day: 'SO', capacity: 6 },
    { title: 'Küchenunterstützung', day: 'SO', capacity: 4 },
    { title: 'Kuchenverkauf', day: 'SO', capacity: 4 },
  ];

  for (const task of tasks) {
    await prisma.task.create({ data: task });
  }

  console.log('Tasks created successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
