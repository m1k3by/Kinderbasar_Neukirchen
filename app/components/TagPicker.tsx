'use client';

import { useState } from 'react';
import { DEFAULT_TAGS, normalizeTags } from '../lib/articleInput';

/** Alle Tags, die zur Auswahl stehen: Standard-Tags zuerst, dann die selbst angelegten. */
export function allTags(items: { tags?: string[] }[]): string[] {
  const seen = new Set<string>(DEFAULT_TAGS.map(t => t.toLowerCase()));
  const custom: string[] = [];
  for (const t of items.flatMap(i => i.tags ?? [])) {
    if (seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    custom.push(t);
  }
  return [...DEFAULT_TAGS, ...custom.sort((a, b) => a.localeCompare(b, 'de'))];
}

/**
 * Mehrfachauswahl von Tags samt Feld für eigene Tags. Optional – ohne Auswahl bleibt der
 * Artikel ungetaggt. Ein eigener Tag existiert, solange ihn mindestens ein Artikel trägt.
 */
export default function TagPicker({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}) {
  const [draft, setDraft] = useState('');
  const has = (t: string) => value.some(v => v.toLowerCase() === t.toLowerCase());
  const toggle = (t: string) =>
    onChange(has(t) ? value.filter(v => v.toLowerCase() !== t.toLowerCase()) : normalizeTags([...value, t]));
  const addDraft = () => {
    if (!draft.trim()) return;
    onChange(normalizeTags([...value, draft]));
    setDraft('');
  };
  // Gewählte Tags, die (noch) nicht in den Vorschlägen stehen, trotzdem anzeigen.
  const shown = [...suggestions, ...value.filter(v => !suggestions.some(s => s.toLowerCase() === v.toLowerCase()))];

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map(t => (
          <button
            key={t}
            type="button"
            aria-pressed={has(t)}
            onClick={() => toggle(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ring-1 ring-inset transition-colors ${
              has(t)
                ? 'bg-yellow-500 ring-yellow-500 text-gray-900'
                : 'bg-white ring-gray-200 text-gray-600 hover:ring-yellow-500'
            }`}
          >
            {has(t) ? '✓ ' : ''}{t}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input
          value={draft}
          maxLength={30}
          onChange={e => setDraft(e.target.value)}
          // Enter legt den Tag an, statt das ganze Artikelformular abzuschicken.
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }}
          placeholder="Eigenen Tag anlegen, z. B. Mädchen 4 J."
          className="flex-1 min-w-0 rounded-xl border-0 bg-gray-50 px-3.5 py-2 text-sm ring-1 ring-inset ring-gray-200 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
        <button
          type="button"
          onClick={addDraft}
          disabled={!draft.trim()}
          className="px-3.5 py-2 bg-gray-900 hover:bg-gray-800 text-white! text-sm font-semibold rounded-xl disabled:opacity-30"
        >
          + Tag
        </button>
      </div>
    </div>
  );
}
