/**
 * Validierung und Normalisierung des Basar-Formulars, geteilt von
 * POST /api/basars und PUT /api/basars/[id].
 *
 * Zuvor riefen beide Routen parseInt/parseFloat ungeprüft auf: commissionPercent
 * 500 oder entryFee -10 landeten direkt in der Abrechnung, ein leeres Zahlenfeld
 * schickte NaN an Prisma und erzeugte einen 500er.
 */

import { parseAsGermanTime } from './time';
import { deriveEventDate, type BasarDays } from './basarWindows';
import { DEFAULT_SIZES } from './sizes';

export const BASAR_DAY_FIELDS = ['dateFriday', 'dateSaturday', 'dateSunday'] as const;

export const BASAR_WINDOW_FIELDS = [
  'registrationSellerStart',
  'registrationSellerEnd',
  'registrationEmployeeStart',
  'registrationEmployeeEnd',
  'activationSellerStart',
  'activationSellerEnd',
  'activationEmployeeStart',
  'activationEmployeeEnd',
  'deliveryStart',
  'deliveryEnd',
  'deliveryStart2',
  'deliveryEnd2',
  'pickupStart',
  'pickupEnd',
  'pickupStart2',
  'pickupEnd2',
] as const;

/** Felder, die einen laufenden (ACTIVE) Basar wirtschaftlich verändern würden. */
const LOCKED_WHILE_ACTIVE = ['maxSellers', 'maxArticlesPerSeller', 'commissionPercent', 'entryFee'] as const;

const NUMERIC_FIELDS = [
  { key: 'maxSellers', label: 'Max. Verkäufer', integer: true, min: 1, max: 100000 },
  { key: 'maxArticlesPerSeller', label: 'Max. Artikel pro Verkäufer', integer: true, min: 1, max: 10000 },
  { key: 'commissionPercent', label: 'Provision', integer: false, min: 0, max: 100 },
  { key: 'entryFee', label: 'Standgebühr', integer: false, min: 0, max: 10000 },
] as const;

type Body = Record<string, unknown>;

export type BasarDataResult =
  | { ok: false; error: string }
  | { ok: true; data: Record<string, unknown> };

function emptyToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * @param existing Bestandswerte des Basars – im Update-Modus nötig, um eventDate
 *                 aus der Mischung aus alten und neuen Tagesdaten abzuleiten.
 */
export function buildBasarData(
  body: Body,
  mode: 'create' | 'update',
  existing?: BasarDays
): BasarDataResult {
  const data: Record<string, unknown> = {};

  if (mode === 'create' || body.title !== undefined) {
    const title = emptyToNull(body.title);
    if (!title) return { ok: false, error: 'Titel ist ein Pflichtfeld' };
    data.title = title;
  }

  if (body.description !== undefined) data.description = emptyToNull(body.description);
  if (body.location !== undefined) data.location = emptyToNull(body.location);

  for (const field of NUMERIC_FIELDS) {
    const raw = body[field.key];
    if (raw === undefined) continue;
    if (raw === null || raw === '') {
      return { ok: false, error: `${field.label} darf nicht leer sein` };
    }
    const value = field.integer ? parseInt(String(raw), 10) : parseFloat(String(raw));
    if (!Number.isFinite(value)) {
      return { ok: false, error: `${field.label} muss eine Zahl sein` };
    }
    if (value < field.min || value > field.max) {
      return { ok: false, error: `${field.label} muss zwischen ${field.min} und ${field.max} liegen` };
    }
    data[field.key] = value;
  }

  for (const key of [...BASAR_DAY_FIELDS, ...BASAR_WINDOW_FIELDS]) {
    const raw = body[key];
    if (raw === undefined) continue;
    if (raw === null || raw === '') {
      data[key] = null;
      continue;
    }
    if (typeof raw !== 'string') {
      return { ok: false, error: `Ungültiger Datumswert für ${key}` };
    }
    const parsed = parseAsGermanTime(raw);
    if (isNaN(parsed.getTime())) {
      return { ok: false, error: `Ungültiger Datumswert für ${key}` };
    }
    data[key] = parsed;
  }

  if (body.allowedSizes !== undefined) {
    data.allowedSizes = emptyToNull(body.allowedSizes);
  } else if (mode === 'create') {
    data.allowedSizes = DEFAULT_SIZES;
  }

  // eventDate wird nur neu abgeleitet, wenn Tagesdaten im Spiel sind. So lässt
  // sich ein Altbestand-Basar ohne gepflegte Tage weiter bearbeiten, ohne dass
  // die Bearbeitung an der neuen Pflichtangabe scheitert.
  const touchesDays = BASAR_DAY_FIELDS.some(key => key in data);
  if (mode === 'create' || touchesDays) {
    const days: BasarDays = {
      dateFriday: (('dateFriday' in data ? data.dateFriday : existing?.dateFriday) as Date | null) ?? null,
      dateSaturday: (('dateSaturday' in data ? data.dateSaturday : existing?.dateSaturday) as Date | null) ?? null,
      dateSunday: (('dateSunday' in data ? data.dateSunday : existing?.dateSunday) as Date | null) ?? null,
    };
    const eventDate = deriveEventDate(days);
    if (!eventDate) {
      return { ok: false, error: 'Mindestens ein Basartag (Freitag, Samstag oder Sonntag) muss gesetzt sein' };
    }
    data.eventDate = eventDate;
  }

  return { ok: true, data };
}

/**
 * Während ein Basar läuft, dürfen Provision, Gebühr und Limits nicht mehr
 * wandern – die Abrechnung rechnet am Ende damit. Redaktionelle Änderungen
 * (Titel, Ort, Termine, Größenliste) bleiben erlaubt.
 */
export function lockedFieldsForActiveBasar(data: Record<string, unknown>): string[] {
  return LOCKED_WHILE_ACTIVE.filter(key => key in data);
}
