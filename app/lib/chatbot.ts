import { faqData, suggestedQuestions } from '../data/faq';

const STOP_WORDS = new Set([
  'ich', 'mich', 'mir', 'mein', 'meine', 'meinen', 'wie', 'was', 'wann', 'wo',
  'warum', 'kann', 'kann', 'der', 'die', 'das', 'ein', 'eine', 'einen', 'einem',
  'und', 'oder', 'aber', 'für', 'mit', 'von', 'zu', 'in', 'an', 'auf', 'ist',
  'sind', 'habe', 'hat', 'haben', 'bitte', 'gibt', 'noch', 'nicht', 'kein',
  'keine', 'darf', 'soll', 'will', 'muss', 'auch', 'beim', 'beim', 'im',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[?!.,;:]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function score(queryTokens: string[], item: (typeof faqData)[0]): number {
  let total = 0;

  for (const token of queryTokens) {
    for (const keyword of item.keywords) {
      if (keyword === token) {
        total += 3;
      } else if (keyword.includes(token) || token.includes(keyword)) {
        total += 1;
      }
    }
    // Also match against question text
    if (item.question.toLowerCase().includes(token)) {
      total += 1;
    }
  }

  return total;
}

export function findAnswer(query: string, role: string): string {
  if (!query.trim()) return 'Bitte stelle mir eine Frage – ich helfe gerne!';

  const tokens = tokenize(query);
  if (tokens.length === 0) return 'Bitte stelle mir eine konkrete Frage – ich helfe gerne!';

  const validRoles = ['seller', 'employee', 'cashier'] as const;
  type Role = (typeof validRoles)[number];
  const userRole = validRoles.includes(role as Role) ? (role as Role) : 'seller';

  const relevant = faqData.filter((item) => item.roles.includes(userRole));

  const scored = relevant
    .map((item) => ({ item, points: score(tokens, item) }))
    .filter((x) => x.points > 0)
    .sort((a, b) => b.points - a.points);

  if (scored.length > 0) {
    return scored[0].item.answer;
  }

  return 'Dazu habe ich leider keine Antwort. Wende dich bitte an den Basar-Administrator.';
}

export function getSuggestedQuestions(role: string): string[] {
  return suggestedQuestions[role] ?? suggestedQuestions['seller'];
}
