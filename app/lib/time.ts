/**
 * German timezone (Europe/Berlin) helpers.
 * MESZ (Sommerzeit): last Sunday in March 02:00 to last Sunday in October 03:00
 * MEZ  (Winterzeit): rest of the year
 */

export function isDST(date: Date): boolean {
  const year = date.getFullYear();

  const marchLastDay = new Date(Date.UTC(year, 2, 31, 1, 0, 0));
  const marchLastSunday = new Date(marchLastDay);
  marchLastSunday.setUTCDate(31 - ((marchLastDay.getUTCDay() || 7) - 1));

  const octoberLastDay = new Date(Date.UTC(year, 9, 31, 1, 0, 0));
  const octoberLastSunday = new Date(octoberLastDay);
  octoberLastSunday.setUTCDate(31 - ((octoberLastDay.getUTCDay() || 7) - 1));

  return date >= marchLastSunday && date < octoberLastSunday;
}

/** Parse a datetime string (e.g. "2025-11-01T10:00") as Europe/Berlin local time. */
export function parseAsGermanTime(dateTimeStr: string): Date {
  if (!dateTimeStr) return new Date(0);

  if (!dateTimeStr.includes('T')) {
    dateTimeStr = dateTimeStr + 'T00:00:00';
  }

  // Already has timezone info — use as-is
  if (dateTimeStr.includes('+') || dateTimeStr.includes('Z')) {
    return new Date(dateTimeStr);
  }

  const parts = dateTimeStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!parts) return new Date(dateTimeStr);

  const [, year, month, day, hour, minute] = parts;
  const testDate = new Date(
    Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute))
  );

  const offset = isDST(testDate) ? '+02:00' : '+01:00';
  return new Date(dateTimeStr + offset);
}

/**
 * Umkehrung von parseAsGermanTime: Date → "YYYY-MM-DDTHH:mm" in deutscher Zeit,
 * direkt verwendbar als Wert eines <input type="datetime-local">.
 *
 * Ohne diese Umrechnung würde ein Formular die gespeicherte UTC-Zeit in der
 * Browser-Zeitzone rendern und beim Speichern verschieben.
 */
export function formatAsGermanDateTimeLocal(value: Date | string | null | undefined): string {
  const shifted = shiftToGermanTime(value);
  return shifted ? shifted.toISOString().slice(0, 16) : '';
}

/** Date → "YYYY-MM-DD" in deutscher Zeit, für <input type="date">. */
export function formatAsGermanDate(value: Date | string | null | undefined): string {
  const shifted = shiftToGermanTime(value);
  return shifted ? shifted.toISOString().slice(0, 10) : '';
}

/** "HH:MM" → Minuten seit Mitternacht. null, wenn der Wert keine Uhrzeit ist. */
export function parseHhMm(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Kulanz beim Eintragen in Helferschichten: so viele Minuten Überschneidung bleiben erlaubt.
 * Wer zwei Minuten früher an der nächsten Station steht, soll sich nicht aussperren.
 */
export const SHIFT_OVERLAP_TOLERANCE_MIN = 3;

export interface Shift {
  timeFrom?: string | null;
  timeTo?: string | null;
}

/**
 * Überschneiden sich zwei Schichten *mehr* als die erlaubte Kulanz?
 *
 * Gerechnet wird in Minuten, nicht auf den rohen Zeichenketten: "9:00" < "10:00" ist als
 * Zeichenkettenvergleich falsch, und nur mit Minuten lässt sich die Dauer der Überschneidung
 * überhaupt bestimmen. Aneinandergrenzende Schichten (16–18 Uhr und 18–20 Uhr) ergeben eine
 * Überschneidung von 0 Minuten und sind damit erlaubt.
 *
 * Fehlt eine Zeitangabe oder ist sie unlesbar, wird nicht blockiert – die Schichtzeit ist
 * dann unbekannt, und eine Sperre auf Verdacht wäre für die Helfer schlimmer als eine
 * Doppelbuchung. Gleiches gilt für über Mitternacht laufende Schichten, die es hier nicht gibt.
 */
export function shiftsOverlap(a: Shift, b: Shift, toleranceMin = SHIFT_OVERLAP_TOLERANCE_MIN): boolean {
  const aFrom = parseHhMm(a.timeFrom);
  const aTo = parseHhMm(a.timeTo);
  const bFrom = parseHhMm(b.timeFrom);
  const bTo = parseHhMm(b.timeTo);
  if (aFrom === null || aTo === null || bFrom === null || bTo === null) return false;

  const overlapMinutes = Math.min(aTo, bTo) - Math.max(aFrom, bFrom);
  return overlapMinutes > toleranceMin;
}

function shiftToGermanTime(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return null;
  const offsetMinutes = isDST(date) ? 120 : 60;
  return new Date(date.getTime() + offsetMinutes * 60_000);
}
