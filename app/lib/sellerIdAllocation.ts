// Die Produktion vergibt per SQL in app/api/register/route.ts; diese Funktion ist die
// Spezifikation und muss mit der SQL übereinstimmen.
//
// Regel (Entscheidung Nutzer, 24.10.2026), Bereich 1000-9999 in neun Tausender-Blöcken.
// Unter den freien Nummern wird gewählt nach: ORDER BY stufe, belegt_im_block, block, nummer
//   stufe: 0 = Vielfaches von 100 (x000 zählt mit), 1 = Vielfaches von 10, 2 = übrige
//   belegt_im_block: ALLE belegten Nummern des Blocks, nicht nur die der Stufe
function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

export function pickSellerId(used: Iterable<number>): number | null {
  const usedSet = new Set(used);
  const belegt = new Array<number>(10).fill(0);
  for (const n of usedSet) if (n >= 1000 && n <= 9999) belegt[Math.floor(n / 1000)]++;

  let best: { key: number[]; n: number } | null = null;
  for (let n = 1000; n <= 9999; n++) {
    if (usedSet.has(n)) continue;
    const block = Math.floor(n / 1000);
    const stufe = n % 100 === 0 ? 0 : n % 10 === 0 ? 1 : 2;
    const key = [stufe, belegt[block], block, n];
    if (!best || lexLess(key, best.key)) best = { key, n };
  }
  return best ? best.n : null;
}
