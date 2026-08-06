/**
 * Zentrale Quelle für die Header-Navigation. Vorher baute jede Seite ihr eigenes
 * `links`-Array von Hand zusammen – dadurch liefen Admin-Seiten auseinander (Archiv
 * z.B. nur auf 2 von 8 Seiten verlinkt) und Seller/Employee-Seiten prüften `isEmployee`
 * inkonsistent (teils gar nicht).
 *
 * Wichtiger als Kosmetik: /admin/basars/** ist laut middleware.ts sowohl für
 * role==='admin' ALS AUCH für isCashier===true erreichbar. Eine rein rollenbasierte
 * (nicht pfadbasierte) Auswahl stellt sicher, dass ein Cashier auf genau diesen Seiten
 * nie Links zu admin-only Zielen sieht, die ihn die Middleware sofort wieder aussperren
 * würde – und ein Admin dort immer die volle Admin-Navigation behält, unabhängig davon,
 * auf welcher /admin/basars/**-Unterseite er gerade steht.
 */

export interface NavUser {
  role: 'admin' | 'seller' | 'employee';
  isEmployee?: boolean;
  isCashier?: boolean;
}

export interface NavLink {
  href: string;
  label: string;
  active?: boolean;
}

export type AdminNavKey = 'basarliste' | 'basare' | 'archiv' | 'helferliste' | 'aufgaben' | 'hilfe';
export type SellerNavKey = 'verkaeufer' | 'mitarbeiter' | 'basare' | 'kasse';
export type NavKey = AdminNavKey | SellerNavKey;

interface NavLinkDef {
  key: NavKey;
  href: string;
  label: string;
}

const ADMIN_LINKS: NavLinkDef[] = [
  { key: 'basarliste', href: '/admin', label: 'Basarliste' },
  { key: 'basare', href: '/admin/basars', label: 'Basare' },
  { key: 'archiv', href: '/admin/basars/archiv', label: 'Archiv' },
  { key: 'helferliste', href: '/admin/list', label: 'Helferliste' },
  { key: 'aufgaben', href: '/admin/tasks', label: 'Aufgaben' },
  { key: 'hilfe', href: '/admin/hilfe', label: 'Hilfe-Statistik' },
];

/**
 * @param activeKey Welcher Eintrag als "aktiv" markiert wird. Bewusst ein logischer
 *   Schlüssel statt eines Pfadvergleichs, da z.B. /admin/basars/[id] als "Basare"
 *   markiert sein soll, nicht als eigener, unbekannter Pfad.
 * @param opts.kasseHref Ziel des Kasse-Links für Cashier. Standard `/admin/basars`
 *   (Basar-Auswahl). Seiten, die den aktuell laufenden Basar schon kennen (z.B.
 *   app/employee/page.tsx), können direkt auf dessen Kasse verlinken.
 */
export function getNavLinks(user: NavUser, activeKey?: NavKey, opts?: { kasseHref?: string }): NavLink[] {
  const defs: NavLinkDef[] = [];

  if (user.role === 'admin') {
    defs.push(...ADMIN_LINKS);
  } else {
    defs.push({ key: 'verkaeufer', href: '/seller', label: 'Verkäuferbereich' });
    if (user.isEmployee) {
      defs.push({ key: 'mitarbeiter', href: '/employee', label: 'Mitarbeiterbereich' });
    }
    defs.push({ key: 'basare', href: '/seller/basars', label: 'Basare' });
    if (user.isCashier) {
      defs.push({ key: 'kasse', href: opts?.kasseHref ?? '/admin/basars', label: 'Kasse' });
    }
  }

  const links: NavLink[] = defs.map(({ key, href, label }) => ({ href, label, active: key === activeKey }));
  links.push({ href: '/', label: 'Logout' });
  return links;
}
