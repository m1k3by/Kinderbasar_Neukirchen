import Fuse from 'fuse.js';
import { faqData, suggestedQuestions, type FaqItem } from '../data/faq';

// ─── German text normalization ──────────────────────────────────────────────
// The corpus (question/keywords/answer) and every incoming query are run through
// the *same* pipeline so fuzzy matching compares like with like:
//   1. lowercase + strip punctuation
//   2. fold umlauts/eszett (ä→a, ö→o, ü→u, ß→ss) so "größe", "grösse" and
//      "groesse" all normalize to "grosse"
//   3. light suffix stripping on tokens ≥5 chars, so simple inflections land
//      closer together (e.g. "Etiketten" → "etikett", matching "etikett" in
//      "Etikett drucken")

const UMLAUT_MAP: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u', ß: 'ss' };

function foldUmlauts(text: string): string {
  return text.replace(/[äöüß]/g, (ch) => UMLAUT_MAP[ch] ?? ch);
}

// Checked longest-first, stripped at most once, only for tokens ≥5 chars, and
// only if ≥3 characters remain afterwards (avoids over-stemming short stems).
const SUFFIXES = ['ungen', 'ung', 'en', 'er', 'e', 'n', 's'];

function stripSuffix(token: string): string {
  if (token.length < 5) return token;
  for (const suffix of SUFFIXES) {
    if (token.length - suffix.length >= 3 && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

function normalizeToken(token: string): string {
  return stripSuffix(foldUmlauts(token));
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[?!.,;:'"„“()]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeToken)
    .join(' ');
}

// Common German function words – stripped from the *query* only (the corpus is
// small and specific enough that we don't need to strip it there too). Kept
// deliberately small: it only removes words that carry no topical signal.
const STOP_WORDS = new Set([
  'ich', 'mich', 'mir', 'mein', 'meine', 'meinen', 'wie', 'was', 'wann', 'wo',
  'wer', 'warum', 'kann', 'der', 'die', 'das', 'ein', 'eine', 'einen', 'einem',
  'und', 'oder', 'aber', 'für', 'mit', 'von', 'zu', 'in', 'an', 'auf', 'ist',
  'sind', 'habe', 'hat', 'haben', 'bitte', 'gibt', 'noch', 'nicht', 'kein',
  'keine', 'darf', 'soll', 'will', 'muss', 'auch', 'beim', 'im',
  'als', 'so', 'ob', 'bis', 'seit', 'mal', 'nur', 'dann', 'wenn', 'hier',
]);

function queryTokens(query: string): string[] {
  return normalizeText(query)
    .split(' ')
    .filter((tok) => tok.length > 2 && !STOP_WORDS.has(tok));
}

// ─── Fuse index ──────────────────────────────────────────────────────────────
// The FAQ is tiny (a few dozen items), so rebuilding the index per call (scoped
// to the caller's contexts) is cheap and keeps the API simple/stateless.

interface SearchableFaq {
  id: string;
  question: string;
  keywords: string[];
  answer: string;
}

function toSearchable(item: FaqItem): SearchableFaq {
  return {
    id: item.id,
    question: normalizeText(item.question),
    keywords: item.keywords.map((k) => normalizeText(k)),
    answer: normalizeText(item.answer),
  };
}

function buildFuse(items: FaqItem[]): Fuse<SearchableFaq> {
  return new Fuse(items.map(toSearchable), {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.45,
    keys: [
      { name: 'question', weight: 0.4 },
      { name: 'keywords', weight: 0.4 },
      { name: 'answer', weight: 0.2 },
    ],
  });
}

// Score bands, tuned against the acceptance queries in
// __tests__/lib/chatbot.test.ts:
//   avgScore ≤ ANSWER_SCORE       → confident direct answer
//   avgScore ≤ SUGGESTION_SCORE   → plausible but unconfident ("Meintest du…?")
//   otherwise                     → no match
// SUGGESTION_SCORE also gates which individual token matches are trusted at
// all (see rankByQuery below).
const ANSWER_SCORE = 0.3;
const SUGGESTION_SCORE = 0.45;
const MAX_ALTERNATIVES = 2;
const MAX_SUGGESTIONS = 3;

// findAnswer searches each query token separately (rather than the whole
// sentence as one Fuse pattern) and combines results per FAQ item: number of
// distinct tokens that matched it (primary – rewards items covering more of
// the question) and their average score (secondary – rewards quality). A
// single very distinctive word (e.g. "Etiketten") is still enough to win on
// its own; the token count mainly disambiguates near-duplicate items such as
// "Artikel anlegen" vs. "Artikel löschen", which both contain "Artikel".
//
// Fuse's weighted multi-key scoring can report a combined score noticeably
// above the configured `threshold` (a record is kept if ANY single key beats
// the threshold, but the *reported* score still blends in the other,
// non-matching keys). Left unfiltered, that let one generic query token rack
// up a "match" against several unrelated items at a mediocre score, which
// outranked a true two-token hit purely on token count. Re-applying
// SUGGESTION_SCORE per token here so only genuinely close matches count
// towards an item's tally fixes that.

interface RankedFaq {
  item: FaqItem;
  count: number;
  avgScore: number;
}

function rankByQuery(query: string, items: FaqItem[]): RankedFaq[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0 || items.length === 0) return [];

  const fuse = buildFuse(items);
  const byId = new Map(items.map((item) => [item.id, item]));
  const agg = new Map<string, { count: number; scores: number[] }>();

  for (const token of tokens) {
    for (const result of fuse.search(token)) {
      const score = result.score ?? 1;
      if (score > SUGGESTION_SCORE) continue;
      const entry = agg.get(result.item.id) ?? { count: 0, scores: [] };
      entry.count += 1;
      entry.scores.push(score);
      agg.set(result.item.id, entry);
    }
  }

  return [...agg.entries()]
    .map(([id, { count, scores }]) => ({
      item: byId.get(id)!,
      count,
      avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
    }))
    .sort((a, b) => b.count - a.count || a.avgScore - b.avgScore);
}

export type FindAnswerResult =
  | { type: 'answer'; item: FaqItem; alternatives: FaqItem[] }
  | { type: 'suggestions'; items: FaqItem[] }
  | { type: 'none' };

export function findAnswer(query: string, contexts: string[]): FindAnswerResult {
  if (!query.trim() || contexts.length === 0) return { type: 'none' };

  const relevant = faqData.filter((item) => item.roles.some((role) => contexts.includes(role)));
  const ranked = rankByQuery(query, relevant);

  if (ranked.length === 0 || ranked[0].avgScore > SUGGESTION_SCORE) {
    return { type: 'none' };
  }

  if (ranked[0].avgScore <= ANSWER_SCORE) {
    const alternatives = ranked
      .slice(1)
      .filter((r) => r.avgScore <= SUGGESTION_SCORE)
      .slice(0, MAX_ALTERNATIVES)
      .map((r) => r.item);
    return { type: 'answer', item: ranked[0].item, alternatives };
  }

  const items = ranked
    .filter((r) => r.avgScore <= SUGGESTION_SCORE)
    .slice(0, MAX_SUGGESTIONS)
    .map((r) => r.item);
  return { type: 'suggestions', items };
}

// ─── Suggested questions (quick-access chips) ───────────────────────────────
// Merges each relevant context's chip list round-robin (seller[0], cashier[0],
// seller[1], cashier[1], …) so multi-context users (e.g. a seller who is also
// cashier, or an admin) get a balanced mix rather than one context crowding
// out the rest, capped at 5 chips.

export function getSuggestedQuestions(contexts: string[]): string[] {
  const CAP = 5;
  const pools = contexts.map((c) => suggestedQuestions[c] ?? []).filter((p) => p.length > 0);
  if (pools.length === 0) return suggestedQuestions.seller.slice(0, CAP);

  const result: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; result.length < CAP; i++) {
    let addedAny = false;
    for (const pool of pools) {
      if (result.length >= CAP) break;
      const q = pool[i];
      if (q && !seen.has(q)) {
        result.push(q);
        seen.add(q);
        addedAny = true;
      }
    }
    if (!addedAny) break;
  }
  return result;
}
