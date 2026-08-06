/**
 * Zeitfenster und Termine eines Basars.
 *
 * Ersetzt die zuvor sechsfach duplizierte Fensterlogik aus den globalen
 * Settings (app/page.tsx, app/api/register, app/api/sellers/seller-status).
 * Die Werte liegen jetzt als DateTime-Spalten am Basar, die Zeitzonen-Umrechnung
 * passiert beim Schreiben (siehe parseAsGermanTime in app/lib/time.ts) statt
 * bei jedem Lesen.
 */

export type WindowBound = Date | string | null | undefined;

function toDate(value: WindowBound): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Fehlendes oder unvollständiges Fenster ⇒ offen. Das entspricht exakt dem
 * bisherigen Verhalten der Settings-Prüfungen ("Key nicht gesetzt = keine
 * Einschränkung") und verhindert, dass ein frisch angelegter Basar ohne
 * gepflegte Fenster niemanden durchlässt.
 */
export function isWindowOpen(start: WindowBound, end: WindowBound, now: Date = new Date()): boolean {
  const from = toDate(start);
  const to = toDate(end);
  if (!from || !to) return true;
  return now >= from && now <= to;
}

export interface BasarWindows {
  activationSellerStart?: WindowBound;
  activationSellerEnd?: WindowBound;
  activationEmployeeStart?: WindowBound;
  activationEmployeeEnd?: WindowBound;
}

/**
 * Darf jemand seine Teilnahme an diesem Basar aktivieren? Die Kontoregistrierung
 * selbst hat kein Zeitfenster – nur die Teilnahme an einem konkreten Basar ist
 * zeitlich begrenzt.
 */
export function isActivationOpen(basar: BasarWindows, isEmployee: boolean, now?: Date): boolean {
  return isEmployee
    ? isWindowOpen(basar.activationEmployeeStart, basar.activationEmployeeEnd, now)
    : isWindowOpen(basar.activationSellerStart, basar.activationSellerEnd, now);
}

export interface BasarDays {
  dateFriday?: WindowBound;
  dateSaturday?: WindowBound;
  dateSunday?: WindowBound;
}

/**
 * Basar.eventDate wird nicht mehr eigenständig gepflegt, sondern beim Speichern
 * aus den drei Tagesdaten abgeleitet (frühester gesetzter Tag). Die Spalte
 * bleibt als Sortierschlüssel und für Archiv-/Listenanzeigen erhalten.
 */
export function deriveEventDate(days: BasarDays): Date | null {
  const dates = [days.dateFriday, days.dateSaturday, days.dateSunday]
    .map(toDate)
    .filter((d): d is Date => d !== null);
  if (dates.length === 0) return null;
  return dates.reduce((earliest, d) => (d < earliest ? d : earliest));
}

/** Wochentag aus Task.day ("Freitag") auf das passende Basar-Datum abbilden. */
export function dateForWeekday(basar: BasarDays, day: string): Date | null {
  switch (day.trim().toLowerCase()) {
    case 'freitag':
      return toDate(basar.dateFriday);
    case 'samstag':
      return toDate(basar.dateSaturday);
    case 'sonntag':
      return toDate(basar.dateSunday);
    default:
      return null;
  }
}
