import { MAX_ARTICLE_PRICE, PRICE_TOO_HIGH_MESSAGE } from './articlePrice';

/** Immer angebotene Tags – es gibt einen Sommer- und einen Winterbasar. */
export const DEFAULT_TAGS = ['Sommer', 'Winter'] as const;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;

/**
 * Bereinigt eine Tag-Liste aus einem Request-Body: trimmt, kürzt, entfernt Doppelte
 * (ohne Groß-/Kleinschreibung) und schreibt Standard-Tags kanonisch („sommer" → „Sommer"),
 * damit der Filter nicht zwei Sommer kennt. Alles, was kein String ist, fällt weg.
 */
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    let tag = raw.trim().replace(/\s+/g, ' ').substring(0, MAX_TAG_LENGTH);
    if (!tag) continue;
    const key = tag.toLowerCase();
    tag = DEFAULT_TAGS.find(d => d.toLowerCase() === key) ?? tag;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export interface ArticleInput {
  title: string;
  sizeLabel: string | null;
  gender: string | null;
  price: number;
  tags: string[];
}

/**
 * Prüft die Artikelfelder eines Request-Bodys – gemeinsam für das Anlegen im Basar
 * (POST /api/basars/[id]/articles) und im eigenen Artikelbestand (/api/seller-articles).
 */
export function parseArticleInput(body: Record<string, unknown>): { data: ArticleInput } | { error: string } {
  const { title, sizeLabel, gender, price } = body ?? {};
  if (!title || !price) return { error: 'Beschreibung und Preis sind Pflichtfelder' };
  const priceNum = parseFloat(String(price));
  if (!Number.isFinite(priceNum) || priceNum <= 0) return { error: 'Preis muss größer als 0 sein' };
  if (priceNum > MAX_ARTICLE_PRICE) return { error: PRICE_TOO_HIGH_MESSAGE };
  return {
    data: {
      title: String(title).substring(0, 120),
      sizeLabel: sizeLabel ? String(sizeLabel).substring(0, 40) : null,
      gender: gender === 'Junge' || gender === 'Mädchen' || gender === 'Unisex' ? gender : null,
      price: priceNum,
      tags: normalizeTags(body.tags),
    },
  };
}
