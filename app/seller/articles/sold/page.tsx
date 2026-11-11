'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../../components/Header';
import { getNavLinks } from '../../../lib/navLinks';

/**
 * Verkaufte Artikel, nach Basar gruppiert. Getrennt von „Meine Artikel", weil verkaufte
 * Einträge dort nur verwirrten: sie lassen sich weder übernehmen (CLAUDE.md: SOLD sperrt
 * dauerhaft) noch sinnvoll bearbeiten. Reine Ansicht – Geld steht in der Abrechnung je Basar.
 */

interface SoldIn { basarId: string; basarTitle: string; eventDate: string; soldAt: string | null; salePrice: number | null }
interface Item {
  id: string;
  title: string;
  sizeLabel?: string | null;
  gender?: string | null;
  price: number;
  tags: string[];
  soldIn: SoldIn[];
}
interface Group { basarId: string; title: string; eventDate: string; rows: { item: Item; soldAt: string | null; salePrice: number | null }[] }

const fmt = (n: number) => n.toFixed(2).replace('.', ',');
const GENDER_STYLE: Record<string, string> = {
  Mädchen: 'bg-pink-50 text-pink-700',
  Junge: 'bg-sky-50 text-sky-700',
  Unisex: 'bg-violet-50 text-violet-700',
};

export default function SoldArticlesPage() {
  const router = useRouter();
  const [sellerInfo, setSellerInfo] = useState<{ name: string; sellerId: number } | null>(null);
  const [isEmployee, setIsEmployee] = useState(false);
  const [isCashier, setIsCashier] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!document.cookie.split(';').some(c => c.trim().startsWith('sellerId='))) { router.push('/login'); return; }
    (async () => {
      try {
        const [meRes, res] = await Promise.all([fetch('/api/me'), fetch('/api/seller-articles')]);
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.role !== 'admin') {
            setSellerInfo({ name: `${me.firstName} ${me.lastName}`, sellerId: me.sellerId });
            setIsEmployee(me.isEmployee || false);
            setIsCashier(me.isCashier || false);
          }
        }
        if (res.ok) setItems(((await res.json()).sellerArticles ?? []).filter((a: Item) => (a.soldIn ?? []).length > 0));
        else setError(true);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // Ein Eintrag steht in jedem Basar, in dem er verkauft wurde (in der Regel genau einer).
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const item of items) {
      for (const s of item.soldIn) {
        const g = map.get(s.basarId) ?? { basarId: s.basarId, title: s.basarTitle, eventDate: s.eventDate, rows: [] };
        g.rows.push({ item, soldAt: s.soldAt, salePrice: s.salePrice });
        map.set(s.basarId, g);
      }
    }
    const list = [...map.values()].sort((a, b) => b.eventDate.localeCompare(a.eventDate));
    for (const g of list) g.rows.sort((a, b) => (b.soldAt ?? '').localeCompare(a.soldAt ?? ''));
    return list;
  }, [items]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100/60">
      <Header
        links={getNavLinks({ role: isEmployee ? 'employee' : 'seller', isEmployee, isCashier }, 'verkaeufer')}
        sellerInfo={sellerInfo}
      />
      <div className="max-w-4xl mx-auto px-4 py-5 md:px-6 md:py-8 pb-24">
        <Link href="/seller/articles" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-5">
          ‹ Meine Artikel
        </Link>

        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900">Verkaufte Artikel</h1>
        <p className="text-sm text-gray-500 mt-1.5 mb-6 max-w-xl">
          Was du in welchem Basar verkauft hast. Den ausgezahlten Betrag findest du in der Abrechnung des jeweiligen Basars.
        </p>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-2xl bg-white/70 ring-1 ring-gray-900/5 animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-red-50 ring-1 ring-red-200 px-4 py-3 text-sm text-red-800">
            Artikel konnten nicht geladen werden.
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-3xl bg-white ring-1 ring-gray-900/5 py-14 text-center">
            <div className="text-4xl mb-2" aria-hidden="true">🛍️</div>
            <p className="font-semibold text-gray-800">Noch nichts verkauft</p>
            <p className="text-sm text-gray-500 mt-1">Sobald an der Kasse etwas von dir verkauft wird, steht es hier.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map(g => (
              <section key={g.basarId}>
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 mb-3 px-1">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{g.title}</h2>
                    <p className="text-sm text-gray-500">
                      {new Date(g.eventDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      {' · '}<strong className="text-gray-700 tabular-nums">{g.rows.length}</strong> verkauft
                    </p>
                  </div>
                  <Link href={`/seller/basars/${g.basarId}`} className="text-sm font-semibold text-amber-700 hover:text-amber-900">
                    Abrechnung ›
                  </Link>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {g.rows.map(({ item: a, soldAt, salePrice }) => (
                    <div key={a.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-900/5">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 leading-snug break-words">{a.title}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {a.sizeLabel && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-mono font-bold text-gray-700">{a.sizeLabel}</span>}
                            {a.gender && <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${GENDER_STYLE[a.gender] ?? 'bg-gray-100 text-gray-600'}`}>{a.gender}</span>}
                          </div>
                        </div>
                        {/* Verkaufspreis; weicht er vom Etikett ab (an der Kasse geändert), steht der Etikettenpreis durchgestrichen daneben. */}
                        <div className="text-right whitespace-nowrap">
                          <span className="text-lg font-extrabold tabular-nums text-gray-900">{fmt(salePrice ?? a.price)} €</span>
                          {salePrice !== null && Math.round(salePrice * 100) !== Math.round(a.price * 100) && (
                            <span className="block text-xs text-gray-400 line-through tabular-nums" title="Preis auf dem Etikett">{fmt(a.price)} €</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-3">
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                          ✓ Verkauft
                          {soldAt && ` ${new Date(soldAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} Uhr`}
                        </span>
                        {a.tags.map(t => <span key={t} className="text-xs font-medium text-gray-400">#{t}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
