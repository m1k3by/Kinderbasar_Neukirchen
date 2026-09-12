import { prisma } from './prisma';

/**
 * Das Mitarbeiter-Kennzeichen setzen – der einzige Ort, an dem das passiert.
 *
 * Zwei Aufrufer: der Admin (app/api/admin/toggle-employee-status) und die Person selbst
 * (app/api/me/role). Die Regel „beim Zurückstufen fällt das Orga-Kennzeichen mit weg"
 * darf deshalb nicht zweimal im Code stehen. Ein Verkäufer mit stehengebliebenem
 * Orga-Kennzeichen hätte unsichtbar kein Artikellimit (app/lib/articleLimits.ts) und
 * gälte in jedem Basar als teilnehmend (app/lib/participation.ts) – unsichtbar deshalb,
 * weil die Oberfläche den Orga-Schalter ausschließlich Mitarbeitern zeigt.
 *
 * Umgekehrt wird beim Heraufstufen bewusst *nichts* mitgesetzt: Orga vergibt allein der
 * Admin, und niemand soll sich das über den Umweg „abgeben und neu holen" selbst geben
 * können.
 */
export function setEmployeeStatus(sellerId: number, isEmployee: boolean) {
  return prisma.seller.update({
    where: { sellerId },
    data: { isEmployee, ...(isEmployee ? {} : { isOrga: false }) },
  });
}
