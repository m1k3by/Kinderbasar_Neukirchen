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

/** Das Fenster, das für diese Person gilt. Zwei Rollen, zwei getrennte Zeiträume. */
function activationWindow(basar: BasarWindows, isEmployee: boolean) {
  return isEmployee
    ? { start: basar.activationEmployeeStart, end: basar.activationEmployeeEnd }
    : { start: basar.activationSellerStart, end: basar.activationSellerEnd };
}

function formatGermanDateTime(value: Date): string {
  return value.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Berlin',
  }) + ' Uhr';
}

export interface ActivationBasar extends BasarWindows {
  status: string;
  isArchived?: boolean;
}

export interface ActivationNotice {
  /** Darf sich diese Person jetzt selbst anmelden? */
  canActivate: boolean;
  /** Satz für die Karte – auch im offenen Fenster (dann das Ende). null = nichts zu sagen. */
  message: string | null;
}

/**
 * Was die Oberfläche über die Anmeldung an diesem Basar sagen soll – und ob sie den Knopf
 * überhaupt anbieten darf.
 *
 * Vorher stand auf der Karte nur „Teilnahme: INAKTIV". Man konnte klicken und bekam erst
 * danach vom Server ein rotes „Der Aktivierungszeitraum ist geschlossen" – ohne zu erfahren,
 * ab wann es denn geht. Diese Funktion nimmt dieselbe Entscheidung vorweg und benennt den
 * Termin dazu.
 *
 * Sie ersetzt die serverseitige Prüfung **nicht**: PUT /api/basars/[id]/participation prüft
 * weiter selbst. Ein ausgegrauter Knopf ist Bedienkomfort, keine Zugriffskontrolle.
 *
 * Die Ja/Nein-Entscheidung kommt aus isActivationOpen, damit Text und Knopf nicht
 * auseinanderlaufen können; nur der Text wird hier zusätzlich gebildet.
 */
export function activationNotice(
  basar: ActivationBasar,
  isEmployee: boolean,
  now: Date = new Date()
): ActivationNotice {
  if (basar.isArchived || basar.status === 'CLOSED' || basar.status === 'DRAFT') {
    return { canActivate: false, message: 'Für diesen Basar ist keine Anmeldung möglich.' };
  }

  const { start, end } = activationWindow(basar, isEmployee);
  const from = toDate(start);
  const to = toDate(end);
  const rolle = isEmployee ? 'Mitarbeiter' : 'Verkäufer';

  // Gleiche Regel wie isWindowOpen: ein unvollständig gepflegtes Fenster schränkt nicht ein.
  // Dann gibt es auch keinen Termin, den man nennen könnte.
  if (!from || !to) return { canActivate: true, message: null };

  if (now < from) {
    return {
      canActivate: false,
      message: `Anmeldung für ${rolle} ab ${formatGermanDateTime(from)}.`,
    };
  }
  if (now > to) {
    return {
      canActivate: false,
      message: `Die Anmeldung für ${rolle} endete am ${formatGermanDateTime(to)}.`,
    };
  }
  return {
    canActivate: true,
    message: `Anmeldung für ${rolle} noch bis ${formatGermanDateTime(to)}.`,
  };
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

export interface SelectableBasar {
  id: string;
  status: string;
  isArchived?: boolean;
}

/**
 * Vorgabe-Basar für die Helferlisten-Ansichten: der laufende Basar, sonst der offene,
 * sonst der erste verbleibende. Entwürfe und Archiviertes kommen nicht in Frage.
 *
 * Stand vorher wortgleich in app/admin/page.tsx, app/employee/page.tsx und
 * app/admin/list/page.tsx – bei vier Kopien wäre die erste vergessene Anpassung ein
 * Basar, in dem eine Seite andere Daten zeigt als die nächste.
 *
 * Gibt '' zurück, wenn kein Basar in Frage kommt. Die aufrufende Seite darf dann nicht
 * laden – ohne Basar gibt es keine Anmeldungen, die sie anzeigen könnte.
 */
export function pickDefaultBasarId(basars: SelectableBasar[]): string {
  const relevant = basars.filter(b => !b.isArchived && b.status !== 'DRAFT');
  return relevant.find(b => b.status === 'ACTIVE')?.id
    || relevant.find(b => b.status === 'OPEN')?.id
    || relevant[0]?.id
    || '';
}
