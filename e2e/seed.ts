import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { BASAR_A, BASAR_B, HELFER, TASKS } from './fixtures';

/**
 * globalSetup fuer den E2E-Lauf: leert die Testdatenbank und legt zwei Basare, drei
 * Aufgaben und einen Mitarbeiter an.
 *
 * Dieses Skript loescht Daten. Es laeuft deshalb nur mit E2E_ALLOW_RESET=1 und bricht ab,
 * sobald die Datenbank Verkaeufer enthaelt, die nicht aus diesem Seed stammen – ein
 * versehentlich geladenes Produktiv-.env fuehrt damit zu einem Abbruch statt zu einem
 * Totalverlust. Die Pruefung ist bewusst die erste Aktion, vor jedem Schreibzugriff.
 */
export default async function globalSetup() {
  if (process.env.E2E_ALLOW_RESET !== '1') {
    throw new Error(
      'E2E_ALLOW_RESET=1 fehlt. Der Seed leert Tabellen und laeuft nur gegen eine ' +
      'ausdruecklich freigegebene Testdatenbank (.env.test).'
    );
  }

  const prisma = new PrismaClient();
  try {
    // Schema herstellen, bevor irgendetwas gezaehlt wird – auf einer frischen Datenbank
    // gibt es die Tabellen sonst gar nicht.
    //
    // `db push` statt `migrate deploy`, und das ist hier ausnahmsweise richtig: die
    // Migrationskette laesst sich auf einer leeren Datenbank *nicht* abspielen. Sie beginnt
    // mit 20260105142219_use_sellerid_as_primary_key, das Tabellen aendert, die keine
    // Migration je anlegt – die Produktivdatenbank wurde damals per `db push` eingerichtet.
    // `migrate deploy` scheitert deshalb sofort mit 42P01 "relation Cake does not exist".
    //
    // Der uebliche Einwand gegen `db push` (CLAUDE.md) ist, dass von Migrationen angelegte
    // Daten fehlen. Konkret betrifft das genau eine Zeile: SellerIdCounter.default. Die saet
    // allocateSellerId() inzwischen selbst nach, wenn sie fehlt – der Testlauf haengt also
    // nicht daran.
    //
    // Sobald es eine Baseline-Migration gibt, gehoert hier wieder `migrate deploy` hin:
    // dann testet der Lauf auch, dass die Kette selbst funktioniert.
    execSync('npx prisma db push --skip-generate --accept-data-loss', { stdio: 'inherit' });

    const foreign = await prisma.seller.count({ where: { email: { not: HELFER.email } } });
    if (foreign > 0) {
      throw new Error(
        `Abbruch: ${foreign} fremde Verkaeufer in der Zieldatenbank. Das sieht nicht nach ` +
        'einer leeren Testdatenbank aus – POSTGRES_PRISMA_URL in .env.test pruefen.'
      );
    }

    // Reihenfolge nach Fremdschluesseln: erst die Blaetter.
    await prisma.taskSignup.deleteMany({});
    await prisma.cake.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.basarSeller.deleteMany({});
    await prisma.basar.deleteMany({});
    await prisma.seller.deleteMany({});

    // Feste Daten, kein Rechnen: Task.day ("Freitag") wird ueber dateForWeekday auf diese
    // Spalten abgebildet, die Werte muessen nur echte Freitage/Samstage/Sonntage sein.
    await prisma.basar.create({
      data: {
        id: BASAR_A.id, title: BASAR_A.title, status: 'ACTIVE',
        eventDate: new Date('2026-09-18T00:00:00Z'),
        dateFriday: new Date('2026-09-18T00:00:00Z'),
        dateSaturday: new Date('2026-09-19T00:00:00Z'),
        dateSunday: new Date('2026-09-20T00:00:00Z'),
      },
    });
    await prisma.basar.create({
      data: {
        id: BASAR_B.id, title: BASAR_B.title, status: 'OPEN',
        eventDate: new Date('2027-03-19T00:00:00Z'),
        dateFriday: new Date('2027-03-19T00:00:00Z'),
        dateSaturday: new Date('2027-03-20T00:00:00Z'),
        dateSunday: new Date('2027-03-21T00:00:00Z'),
      },
    });

    // Aufgaben sind basaruebergreifend – genau eine Liste, in beiden Basaren dieselbe.
    for (const t of TASKS) await prisma.task.create({ data: t });

    await prisma.seller.create({
      data: {
        sellerId: HELFER.sellerId,
        email: HELFER.email,
        firstName: HELFER.firstName,
        lastName: HELFER.lastName,
        password: await bcrypt.hash(HELFER.password, 10),
        isEmployee: true,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
