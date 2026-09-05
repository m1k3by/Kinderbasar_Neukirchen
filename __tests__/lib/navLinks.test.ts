import { describe, it, expect } from 'vitest';
import { getNavLinks, basarsAdminActiveKey } from '@/app/lib/navLinks';

const hrefs = (user: Parameters<typeof getNavLinks>[0], ...rest: [] | [Parameters<typeof getNavLinks>[1]]) =>
  getNavLinks(user, ...rest).map(l => l.href);

describe('getNavLinks – Verkäufer und Mitarbeiter', () => {
  it('zeigt dem reinen Verkäufer nur Verkäuferbereich und Logout', () => {
    expect(hrefs({ role: 'seller' })).toEqual(['/seller', '/']);
  });

  it('verlinkt für Verkäufer NICHT mehr auf die alte Basar-Liste', () => {
    // Basar-Teilnahme und Artikelerfassung sind in /seller gemerged; ein eigener
    // "Basare"-Tab würde wieder auf eine zweite Ansicht derselben Basare führen.
    for (const user of [
      { role: 'seller' as const },
      { role: 'employee' as const, isEmployee: true },
      { role: 'employee' as const, isEmployee: true, isCashier: true },
      { role: 'seller' as const, isCashier: true },
    ]) {
      expect(hrefs(user)).not.toContain('/seller/basars');
      expect(getNavLinks(user).map(l => l.label)).not.toContain('Basare');
    }
  });

  it('ergänzt für Mitarbeiter den Mitarbeiterbereich', () => {
    expect(hrefs({ role: 'employee', isEmployee: true })).toEqual(['/seller', '/employee', '/']);
  });

  it('ergänzt für Kassierer die Kasse und nutzt standardmäßig /admin/basars', () => {
    expect(hrefs({ role: 'employee', isEmployee: true, isCashier: true }))
      .toEqual(['/seller', '/employee', '/admin/basars', '/']);
  });

  it('übernimmt einen kasseHref-Override', () => {
    const links = getNavLinks({ role: 'employee', isEmployee: true, isCashier: true }, undefined, {
      kasseHref: '/admin/basars/abc/kasse',
    });
    expect(links.find(l => l.label === 'Kasse')?.href).toBe('/admin/basars/abc/kasse');
  });

  it('gibt einem Verkäufer ohne isCashier keinen Kasse-Link, auch nicht per Override', () => {
    const links = getNavLinks({ role: 'seller' }, undefined, { kasseHref: '/admin/basars/abc/kasse' });
    expect(links.map(l => l.label)).not.toContain('Kasse');
  });

  it('markiert genau einen Eintrag als aktiv', () => {
    const links = getNavLinks({ role: 'employee', isEmployee: true, isCashier: true }, 'kasse');
    expect(links.filter(l => l.active)).toHaveLength(1);
    expect(links.find(l => l.active)?.href).toBe('/admin/basars');
  });

  it('markiert nichts als aktiv, wenn kein activeKey übergeben wird', () => {
    expect(getNavLinks({ role: 'seller' }).filter(l => l.active)).toHaveLength(0);
  });
});

describe('getNavLinks – Admin', () => {
  it('behält die vollständige Admin-Navigation inklusive Basare', () => {
    expect(hrefs({ role: 'admin' })).toEqual([
      '/admin',
      '/admin/basars',
      '/admin/basars/archiv',
      '/admin/list',
      '/admin/tasks',
      '/admin/hilfe',
      '/admin/logs',
      '/',
    ]);
  });

  it('ignoriert isEmployee/isCashier beim Admin', () => {
    expect(hrefs({ role: 'admin', isEmployee: true, isCashier: true }))
      .toEqual(hrefs({ role: 'admin' }));
  });

  it('markiert Basare als aktiv', () => {
    const links = getNavLinks({ role: 'admin' }, 'basare');
    expect(links.filter(l => l.active)).toHaveLength(1);
    expect(links.find(l => l.active)?.href).toBe('/admin/basars');
  });
});

describe('basarsAdminActiveKey', () => {
  // /admin/basars/** ist laut middleware.ts für Admins UND Kassierer erreichbar, die dort
  // aber unterschiedliche Navigationen sehen. Ein festes 'basare' würde beim Kassierer auf
  // keinen Eintrag passen, seit der Seller-Zweig keinen 'basare'-Link mehr hat.
  it('ist für den Admin "basare"', () => {
    expect(basarsAdminActiveKey({ role: 'admin' })).toBe('basare');
  });

  it('ist für den Kassierer "kasse"', () => {
    expect(basarsAdminActiveKey({ role: 'employee', isEmployee: true, isCashier: true })).toBe('kasse');
  });

  it('markiert beim Kassierer auf /admin/basars tatsächlich einen Eintrag', () => {
    const user = { role: 'employee' as const, isEmployee: true, isCashier: true };
    const links = getNavLinks(user, basarsAdminActiveKey(user));
    expect(links.filter(l => l.active)).toHaveLength(1);
    expect(links.find(l => l.active)?.href).toBe('/admin/basars');
  });

  it('markiert beim Admin auf /admin/basars den Basare-Eintrag', () => {
    const user = { role: 'admin' as const };
    const links = getNavLinks(user, basarsAdminActiveKey(user));
    expect(links.find(l => l.active)?.href).toBe('/admin/basars');
  });
});
