// PreToolUse-Wächter: blockiert die Fehlerklassen, die maschinell erkennbar sind.
// Exit 2 = Befehl wird nicht ausgeführt, stderr geht an Claude zurück.
const fs = require('fs');

let raw = '';
process.stdin.on('data', d => (raw += d)).on('end', () => {
  let cmd = '';
  try { cmd = JSON.parse(raw).tool_input?.command ?? ''; } catch { process.exit(0); }

  // Heredoc-Rumpf ist Daten, kein Befehl - sonst blockiert Doku ueber blockierte Befehle.
  cmd = cmd.split(/<<-?['"]?\w+/)[0];

  // 1. Exit-Code hinter einer Pipe gehört dem letzten Glied, nicht dem Linter.
  // Nur innerhalb desselben Befehlssegments: eine Pipe hinter `;` oder `&&` gehoert
  // einem anderen Befehl und verdeckt den Exit-Code des Linters nicht.
  const segments = cmd.split(/;|&&|\n/);
  if (segments.some(s => /\b(npm run (lint|test|test:run|build)|npx (eslint|vitest|tsc))\b[^|]*\|(?!\|)/.test(s))) {
    fail('Pipeline verdeckt den Exit-Code (er stammt vom letzten Glied, nicht vom Linter/Test).\n' +
         'Stattdessen: Befehl ohne Pipe, Ausgabe nach $SCRATCHPAD/out.txt umleiten, danach die Datei lesen.');
  }

  // 2. Setzt auf HEAD zurueck, nicht auf den Arbeitsstand. Hat hier schon Arbeit vernichtet.
  if (/\bgit\s+(restore\b|stash\b(?!\s+(list|show))|checkout\s+--)/.test(cmd)) {
    fail('Zerstoert nicht committete Arbeit (setzt auf HEAD, nicht auf den Arbeitsstand).\n' +
         'Fuer einen Vergleich mit HEAD reicht: git show HEAD:<datei>');
  }

  // 3. db push fuehrt die Migrations-SQL nicht aus - produktiv fehlen Seeds und Backfills.
  if (/prisma\s+db\s+push|npm run db:push/.test(cmd)) {
    const url = ['.env.local', '.env'].map(readUrl).find(Boolean) || '';
    if (url && !/localhost|127\.0\.0\.1/.test(url)) {
      fail('Ziel ist keine lokale Datenbank: ' + url.replace(/:[^:@/]*@/, ':***@') + '\n' +
           '`db push` gleicht nur das Schema ab und fuehrt die Migrations-SQL nicht aus.\n' +
           'Produktiv gilt `prisma migrate deploy`. Siehe CLAUDE.md.');
    }
  }
});

function readUrl(f) {
  try {
    const m = fs.readFileSync(f, 'utf8').match(/^\s*(?:POSTGRES_PRISMA_URL|DATABASE_URL)\s*=\s*"?([^"\r\n]+)/m);
    return m && m[1];
  } catch { return null; }
}

function fail(msg) { console.error(msg); process.exit(2); }
