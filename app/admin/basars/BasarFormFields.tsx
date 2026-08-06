'use client';

/**
 * Gemeinsame Felder für das Anlege- und das Bearbeiten-Formular eines Basars.
 *
 * Zuvor hatten beide Formulare eigene, auseinandergelaufene Feldlisten – im
 * Bearbeiten-Formular fehlten Beschreibung, Max. Verkäufer und Termin komplett,
 * sodass der Termin nach dem Anlegen nicht mehr änderbar war.
 *
 * Alle Werte werden als Strings gehalten: Die API parst Datumsangaben ohnehin
 * als deutsche Ortszeit (parseAsGermanTime), und leere Strings bedeuten dort
 * "Feld leeren".
 */

import { DEFAULT_SIZES, parseSizes, sizeGroups } from '../../lib/sizes';
import { formatAsGermanDate, formatAsGermanDateTimeLocal } from '../../lib/time';

export interface BasarFormState {
  title: string;
  description: string;
  location: string;
  maxSellers: string;
  maxArticlesPerSeller: string;
  commissionPercent: string;
  entryFee: string;
  dateFriday: string;
  dateSaturday: string;
  dateSunday: string;
  activationSellerStart: string;
  activationSellerEnd: string;
  activationEmployeeStart: string;
  activationEmployeeEnd: string;
  deliveryStart: string;
  deliveryEnd: string;
  deliveryStart2: string;
  deliveryEnd2: string;
  pickupStart: string;
  pickupEnd: string;
  pickupStart2: string;
  pickupEnd2: string;
  allowedSizes: string;
}

export const EMPTY_BASAR_FORM: BasarFormState = {
  title: '', description: '', location: '',
  maxSellers: '100', maxArticlesPerSeller: '50',
  commissionPercent: '20', entryFee: '0',
  dateFriday: '', dateSaturday: '', dateSunday: '',
  activationSellerStart: '', activationSellerEnd: '',
  activationEmployeeStart: '', activationEmployeeEnd: '',
  deliveryStart: '', deliveryEnd: '', deliveryStart2: '', deliveryEnd2: '',
  pickupStart: '', pickupEnd: '', pickupStart2: '', pickupEnd2: '',
  allowedSizes: DEFAULT_SIZES,
};

const DATETIME_KEYS = [
  'activationSellerStart', 'activationSellerEnd',
  'activationEmployeeStart', 'activationEmployeeEnd',
  'deliveryStart', 'deliveryEnd', 'deliveryStart2', 'deliveryEnd2',
  'pickupStart', 'pickupEnd', 'pickupStart2', 'pickupEnd2',
] as const;

/** API-Antwort → Formularzustand, mit Zeitzonen-korrekter Anzeige. */
export function basarFormFromApi(data: Record<string, unknown>): BasarFormState {
  const form: BasarFormState = { ...EMPTY_BASAR_FORM };

  form.title = (data.title as string) ?? '';
  form.description = (data.description as string) ?? '';
  form.location = (data.location as string) ?? '';
  form.maxSellers = String(data.maxSellers ?? EMPTY_BASAR_FORM.maxSellers);
  form.maxArticlesPerSeller = String(data.maxArticlesPerSeller ?? EMPTY_BASAR_FORM.maxArticlesPerSeller);
  form.commissionPercent = String(data.commissionPercent ?? EMPTY_BASAR_FORM.commissionPercent);
  form.entryFee = String(data.entryFee ?? EMPTY_BASAR_FORM.entryFee);

  form.dateFriday = formatAsGermanDate(data.dateFriday as string | null);
  form.dateSaturday = formatAsGermanDate(data.dateSaturday as string | null);
  form.dateSunday = formatAsGermanDate(data.dateSunday as string | null);

  for (const key of DATETIME_KEYS) {
    form[key] = formatAsGermanDateTimeLocal(data[key] as string | null);
  }

  form.allowedSizes = (data.allowedSizes as string) || DEFAULT_SIZES;
  return form;
}

interface Props {
  form: BasarFormState;
  setForm: React.Dispatch<React.SetStateAction<BasarFormState>>;
  /** Bei laufendem Basar sperrt die API Provision, Gebühr und Limits. */
  economicsLocked?: boolean;
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:bg-gray-100 disabled:text-gray-400';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const sectionClass = 'md:col-span-2 mt-2 pt-4 border-t border-gray-200 first:mt-0 first:pt-0 first:border-t-0';

export default function BasarFormFields({ form, setForm, economicsLocked = false }: Props) {
  const set = (key: keyof BasarFormState) => (value: string) =>
    setForm(f => ({ ...f, [key]: value }));

  const field = (
    key: keyof BasarFormState,
    label: string,
    type: string,
    opts?: { min?: string; max?: string; step?: string; disabled?: boolean }
  ) => (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => set(key)(e.target.value)}
        className={inputClass}
        min={opts?.min}
        max={opts?.max}
        step={opts?.step}
        disabled={opts?.disabled}
      />
    </div>
  );

  const windowPair = (startKey: keyof BasarFormState, endKey: keyof BasarFormState, label: string) => (
    <>
      {field(startKey, `${label} – von`, 'datetime-local')}
      {field(endKey, `${label} – bis`, 'datetime-local')}
    </>
  );

  const enabledSizes = new Set(parseSizes(form.allowedSizes));
  const allSizes = parseSizes(DEFAULT_SIZES);
  const writeSizes = (next: Set<string>) =>
    set('allowedSizes')(allSizes.filter(s => next.has(s)).join(','));

  return (
    <>
      <div className={sectionClass}>
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Grunddaten</h3>
      </div>
      <div className="md:col-span-2">
        <label className={labelClass}>Titel</label>
        <input
          required
          value={form.title}
          onChange={e => set('title')(e.target.value)}
          className={inputClass}
        />
      </div>
      {field('location', 'Ort', 'text')}
      {field('description', 'Beschreibung', 'text')}

      <div className={sectionClass}>
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Basartage</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Mindestens ein Tag ist nötig. Der früheste Tag gilt als Beginn des Basars.
        </p>
      </div>
      {field('dateFriday', 'Freitag', 'date')}
      {field('dateSaturday', 'Samstag', 'date')}
      {field('dateSunday', 'Sonntag', 'date')}
      <div />

      <div className={sectionClass}>
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Teilnahme-Aktivierung</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Zeitraum, in dem bestehende Konten ihre Teilnahme an diesem Basar an- und abmelden können.
          Leer lassen = jederzeit möglich. Die Kontoregistrierung selbst hat kein Zeitfenster.
        </p>
      </div>
      {windowPair('activationSellerStart', 'activationSellerEnd', 'Verkäufer')}
      {windowPair('activationEmployeeStart', 'activationEmployeeEnd', 'Mitarbeiter')}

      <div className={sectionClass}>
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Anlieferung &amp; Abholung</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Diese Zeiten stehen in der Bestätigungs-E-Mail an die Verkäufer.
        </p>
      </div>
      {windowPair('deliveryStart', 'deliveryEnd', 'Anlieferung 1')}
      {windowPair('deliveryStart2', 'deliveryEnd2', 'Anlieferung 2')}
      {windowPair('pickupStart', 'pickupEnd', 'Abholung 1')}
      {windowPair('pickupStart2', 'pickupEnd2', 'Abholung 2')}

      <div className={sectionClass}>
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Grenzen &amp; Kosten</h3>
        {economicsLocked && (
          <p className="text-xs text-amber-700 mt-0.5">
            Der Basar läuft – Provision, Gebühr und Limits sind gesperrt, weil die Abrechnung damit rechnet.
          </p>
        )}
      </div>
      {field('maxSellers', 'Max. Verkäufer', 'number', { min: '1', disabled: economicsLocked })}
      {field('maxArticlesPerSeller', 'Max. Artikel/Verkäufer', 'number', { min: '1', disabled: economicsLocked })}
      {field('commissionPercent', 'Provision (%)', 'number', { min: '0', max: '100', step: '0.5', disabled: economicsLocked })}
      {field('entryFee', 'Teilnahmegebühr (€)', 'number', { min: '0', step: '0.50', disabled: economicsLocked })}

      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Erlaubte Größen</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {enabledSizes.size} von {allSizes.length} Größen aktiv · gilt nur für diesen Basar
            </p>
          </div>
          <button
            type="button"
            onClick={() => writeSizes(new Set(allSizes))}
            className="text-xs text-gray-500 hover:text-gray-700 underline flex-shrink-0 ml-4"
          >
            ↺ Standard
          </button>
        </div>
        <div className="mt-3 space-y-4">
          {sizeGroups(allSizes).map(group => (
            <div key={group.label}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{group.label}</p>
                <div className="flex gap-3">
                  <button type="button" className="text-xs text-green-700 hover:underline"
                    onClick={() => { const next = new Set(enabledSizes); group.sizes.forEach(s => next.add(s)); writeSizes(next); }}>
                    Alle an
                  </button>
                  <button type="button" className="text-xs text-red-600 hover:underline"
                    onClick={() => { const next = new Set(enabledSizes); group.sizes.forEach(s => next.delete(s)); writeSizes(next); }}>
                    Alle ab
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.sizes.map(s => {
                  const active = enabledSizes.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        const next = new Set(enabledSizes);
                        if (active) next.delete(s); else next.add(s);
                        writeSizes(next);
                      }}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold transition-colors ${
                        active
                          ? 'bg-green-100 border-green-400 text-green-900 hover:bg-green-200'
                          : 'bg-gray-100 border-gray-300 text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
