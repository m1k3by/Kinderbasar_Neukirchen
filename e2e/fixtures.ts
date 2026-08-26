// Gemeinsame Stammdaten fuer Seed und Test. Beide muessen dieselben Titel benutzen –
// stuenden sie doppelt, waere die erste Umbenennung ein gruener Test ohne Aussage.
export const BASAR_A = { id: 'e2e-basar-a', title: 'E2E Basar A' };
export const BASAR_B = { id: 'e2e-basar-b', title: 'E2E Basar B' };

export const HELFER = {
  sellerId: 90001,
  email: 'e2e.helfer@example.test',
  firstName: 'Erika',
  lastName: 'E2E',
  password: 'E2E-Test-1234',
};

// Zwei Freitagsschichten mit *verschiedenen* Zeiten – bei ueberlappenden Zeiten wuerde
// shiftsOverlap die zweite Eintragung verweigern und der Test das falsche belegen.
export const AUFBAU = { id: 'e2e-task-aufbau', title: 'E2E Aufbau', day: 'Freitag', timeFrom: '14:00', timeTo: '16:00', capacity: 8 };
export const VORSORTIEREN = { id: 'e2e-task-vorsortieren', title: 'E2E Vorsortieren', day: 'Freitag', timeFrom: '16:00', timeTo: '20:00', capacity: 6 };
export const KUCHEN = { id: 'e2e-task-kuchen', title: 'E2E Kuchenverkauf', day: 'Samstag', timeFrom: '09:00', timeTo: '12:00', capacity: 2 };

export const TASKS = [AUFBAU, VORSORTIEREN, KUCHEN];
