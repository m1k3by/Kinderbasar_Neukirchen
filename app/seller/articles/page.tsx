'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import TagPicker, { allTags } from '../../components/TagPicker';
import { getNavLinks } from '../../lib/navLinks';
import { parseSizes, sizeGroups } from '../../lib/sizes';
import { MAX_ARTICLE_PRICE, PRICE_TOO_HIGH_MESSAGE } from '../../lib/articlePrice';
import { formatArticleLimit, maxArticlesFor } from '../../lib/articleLimits';

/**
 * Die eine Stelle, an der Verkäufer ihre Artikel pflegen – unabhängig von jedem Basar.
 *
 * Artikel werden hier jederzeit angelegt, bearbeitet, getaggt und gefiltert. Ist ein Basar
 * zur Anmeldung offen, landet ein neuer Artikel standardmäßig direkt darin
 * (POST /api/basars/[id]/articles, mit Artikellimit und Größenliste des Basars); bestehende
 * werden per Auswahl übernommen (POST /api/basars/[id]/articles/import). Die Basar-Seite hat
 * bewusst kein eigenes Formular mehr – zwei Oberflächen für dasselbe liefen auseinander.
 */

interface Item {
  id: string;
  title: string;
  sizeLabel?: string | null;
  gender?: string | null;
  price: number;
  tags: string[];
  createdAt: string;
  alreadyInBasar: boolean;
  soldPreviously: boolean;
}

interface OpenBasar {
  id: string;
  title: string;
  status: string;
  isArchived: boolean;
  isTest: boolean;
  allowedSizes?: string | null;
  maxArticlesPerSeller: number;
  maxArticlesPerEmployee?: number | null;
}

type StatusFilter = 'all' | 'available' | 'inBasar' | 'sold';
const EMPTY_FORM = { title: '', sizeLabel: '', gender: '', price: '', tags: [] as string[] };
const fmt = (n: number) => n.toFixed(2).replace('.', ',');

export default function SellerArticlesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sellerInfo, setSellerInfo] = useState<{ name: string; sellerId: number } | null>(null);
  const [isEmployee, setIsEmployee] = useState(false);
  const [isCashier, setIsCashier] = useState(false);
  const [isOrga, setIsOrga] = useState(false);
  // Stand im Ziel-Basar aus GET /api/basars/[id]/articles: zählt auch Artikel ohne
  // Archiv-Eintrag (Altbestand) und kennt das persönliche Limit (maxArticlesOverride).
  const [basarCount, setBasarCount] = useState(0);
  const [basarOverride, setBasarOverride] = useState<number | null>(null);
  const [directToBasar, setDirectToBasar] = useState(true);
  const [showSizes, setShowSizes] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [openBasars, setOpenBasars] = useState<OpenBasar[]>([]);
  const [targetBasarId, setTargetBasarId] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [isClothing, setIsClothing] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const [q, setQ] = useState('');
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [untaggedOnly, setUntaggedOnly] = useState(false);
  const [genderFilter, setGenderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!document.cookie.split(';').some(c => c.trim().startsWith('sellerId='))) { router.push('/login'); return; }
    (async () => {
      const [meRes, basarsRes] = await Promise.all([fetch('/api/me'), fetch('/api/basars')]);
      if (meRes.ok) {
        const me = await meRes.json();
        if (me.role !== 'admin') {
          setSellerInfo({ name: `${me.firstName} ${me.lastName}`, sellerId: me.sellerId });
          setIsEmployee(me.isEmployee || false);
          setIsCashier(me.isCashier || false);
          setIsOrga(me.isOrga || false);
        }
      }
      if (basarsRes.ok) {
        const data = await basarsRes.json();
        const open = (data.basars ?? []).filter((b: OpenBasar) => b.status === 'OPEN' && !b.isArchived);
        setOpenBasars(open);
        // ?basar=<id> von der Basar-Karte in /seller wählt den Ziel-Basar vor.
        const wanted = new URLSearchParams(window.location.search).get('basar');
        if (open.length > 0) setTargetBasarId(open.some((b: OpenBasar) => b.id === wanted) ? wanted! : open[0].id);
      }
      setReady(true);
    })();
  }, [router]);

  // Der Ziel-Basar bestimmt `alreadyInBasar` – deshalb bei jedem Wechsel neu laden.
  useEffect(() => {
    if (!ready) return;
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, targetBasarId]);

  async function loadItems() {
    setLoading(true);
    try {
      const [res, basarRes] = await Promise.all([
        fetch(`/api/seller-articles${targetBasarId ? `?basarId=${targetBasarId}` : ''}`),
        targetBasarId ? fetch(`/api/basars/${targetBasarId}/articles`) : Promise.resolve(null),
      ]);
      if (res.ok) setItems((await res.json()).sellerArticles ?? []);
      else showMsg('Artikel konnten nicht geladen werden', false);
      if (basarRes?.ok) {
        const data = await basarRes.json();
        setBasarCount(data.articles?.length ?? 0);
        setBasarOverride(data.basarSeller?.maxArticlesOverride ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  function showMsg(text: string, ok: boolean) {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 5000);
  }

  const tagOptions = useMemo(() => allTags(items), [items]);
  const targetBasar = openBasars.find(b => b.id === targetBasarId);
  const sizes = parseSizes(targetBasar?.allowedSizes);
  const maxArticles = targetBasar ? maxArticlesFor(targetBasar, { isEmployee, isOrga }, basarOverride) : Infinity;
  const basarFull = basarCount >= maxArticles;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter(a => {
      if (needle && !`${a.title} ${a.sizeLabel ?? ''}`.toLowerCase().includes(needle)) return false;
      if (untaggedOnly && a.tags.length > 0) return false;
      // Mehrere gewählte Tags = Schnittmenge („Sommer" und „Mädchen 4 J.").
      for (const t of tagFilter) if (!a.tags.some(x => x.toLowerCase() === t.toLowerCase())) return false;
      if (genderFilter && a.gender !== genderFilter) return false;
      if (statusFilter === 'available' && (a.soldPreviously || a.alreadyInBasar)) return false;
      if (statusFilter === 'inBasar' && !a.alreadyInBasar) return false;
      if (statusFilter === 'sold' && !a.soldPreviously) return false;
      return true;
    });
  }, [items, q, tagFilter, untaggedOnly, genderFilter, statusFilter]);

  // Übernehmbar: weder verkauft (CLAUDE.md: allein SOLD sperrt) noch schon im Ziel-Basar.
  const transferable = (a: Item) => !!targetBasarId && !a.soldPreviously && !a.alreadyInBasar;
  const selectableVisible = filtered.filter(transferable);

  function startEdit(a: Item) {
    setEditingId(a.id);
    setIsClothing(!!(a.sizeLabel || a.gender));
    setForm({ title: a.title, sizeLabel: a.sizeLabel ?? '', gender: a.gender ?? '', price: String(a.price), tags: a.tags });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetForm() {
    setEditingId(null);
    setIsClothing(true);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const priceVal = parseFloat(form.price);
    if (isNaN(priceVal) || Math.round(priceVal * 100) % 50 !== 0 || priceVal < 0.5) {
      showMsg('Der Preis muss ein Vielfaches von 0,50 € sein (z.B. 0,50 – 1,00 – 1,50 …)', false);
      return;
    }
    if (priceVal > MAX_ARTICLE_PRICE) { showMsg(PRICE_TOO_HIGH_MESSAGE, false); return; }
    const intoBasar = !editingId && !!targetBasar && directToBasar;
    const size = isClothing ? form.sizeLabel.trim() : '';
    // Größen prüft nur der Basar (seine Liste); im eigenen Bestand ist jede Größe erlaubt,
    // sonst scheiterte die spätere Übernahme in einen Basar mit anderer Liste nie – aber
    // die Anlage hier grundlos (app/lib/sizes.ts).
    if (intoBasar && size && !sizes.includes(size)) {
      showMsg(`„${size}" ist in diesem Basar keine gültige Größe. Bitte eine Größe aus der Vorschlagsliste wählen.`, false);
      return;
    }

    const payload = {
      ...(editingId ? { id: editingId } : {}),
      title: form.title.trim(),
      sizeLabel: isClothing ? form.sizeLabel.trim() || null : null,
      gender: isClothing ? form.gender || null : null,
      price: priceVal,
      tags: form.tags,
    };
    setSaving(true);
    try {
      const res = await fetch(intoBasar ? `/api/basars/${targetBasar!.id}/articles` : '/api/seller-articles', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || 'Fehler beim Speichern', false); return; }
      if (editingId) {
        showMsg(
          data.updatedBasarArticles > 0
            ? '✓ Gespeichert – auch im offenen Basar geändert. Bitte das Etikett neu drucken.'
            : '✓ Gespeichert',
          true,
        );
      } else {
        showMsg(intoBasar ? `✓ Artikel angelegt und in „${targetBasar!.title}" übernommen` : '✓ Artikel angelegt', true);
      }
      // Tags bleiben beim Neuanlegen stehen – wer zehn Wintersachen erfasst, will nicht zehnmal klicken.
      if (editingId) resetForm();
      else setForm({ ...EMPTY_FORM, tags: form.tags });
      await loadItems();
    } catch {
      showMsg('Netzwerkfehler', false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(a: Item) {
    const hint = a.alreadyInBasar ? '\n\nIm Basar bleibt der Artikel bestehen – dort bitte separat löschen.' : '';
    if (!confirm(`„${a.title}" dauerhaft aus deinen Artikeln löschen?${hint}`)) return;
    const res = await fetch('/api/seller-articles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id }),
    });
    if (res.ok) {
      setItems(prev => prev.filter(x => x.id !== a.id));
      setSelected(prev => { const n = new Set(prev); n.delete(a.id); return n; });
      if (editingId === a.id) resetForm();
      showMsg('Artikel gelöscht', true);
    } else {
      const data = await res.json().catch(() => ({}));
      showMsg(data.error || 'Fehler beim Löschen', false);
    }
  }

  async function handleTransfer() {
    const ids = [...selected].filter(id => items.some(a => a.id === id && transferable(a)));
    if (ids.length === 0) return;
    const res = await fetch(`/api/basars/${targetBasarId}/articles/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sellerArticleIds: ids }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSelected(new Set());
      showMsg(`✓ ${data.articles.length} Artikel in den Basar übernommen`, true);
      await loadItems();
    } else {
      showMsg(data.error || 'Fehler beim Übernehmen', false);
    }
  }

  const toggleSet = (set: Set<string>, v: string) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v); else n.add(v);
    return n;
  };
  const filtersActive = q || tagFilter.size > 0 || untaggedOnly || genderFilter || statusFilter !== 'all';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        links={getNavLinks({ role: isEmployee ? 'employee' : 'seller', isEmployee, isCashier }, 'verkaeufer')}
        sellerInfo={sellerInfo}
      />
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <Link href="/seller" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
          ← Zurück zum Verkäuferbereich
        </Link>

        <div className="bg-white rounded-xl shadow-sm p-5 mb-5">
          <h1 className="text-2xl font-bold text-gray-800">Meine Artikel</h1>
          <p className="text-sm text-gray-500 mt-1">
            Hier legst du deine Artikel jederzeit an – auch wenn gerade kein Basar läuft. Sobald ein
            Basar zur Anmeldung offen ist, übernimmst du sie von hier in den Basar. Erst dann können
            sie an der Kasse verkauft werden.
          </p>
        </div>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg font-medium border ${message.ok ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
            {message.text}
          </div>
        )}

        {/* Formular: anlegen oder bearbeiten */}
        <div ref={formRef} className="bg-white rounded-xl shadow-sm p-5 mb-5 scroll-mt-4">
          <h2 className="font-semibold text-gray-700 mb-3">{editingId ? 'Artikel bearbeiten' : 'Neuen Artikel anlegen'}</h2>
          <form onSubmit={handleSubmit} className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-3 flex gap-2">
              {([true, false] as const).map(c => (
                <button
                  key={String(c)}
                  type="button"
                  aria-pressed={isClothing === c}
                  onClick={() => setIsClothing(c)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${isClothing === c ? 'bg-yellow-500 text-gray-900' : 'bg-gray-100 text-gray-500 hover:text-gray-700'}`}
                >
                  {c ? '👕 Kleidung' : '🧸 Keine Kleidung'}
                </button>
              ))}
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Beschreibung * (max. 30 Zeichen)</label>
              <input
                required maxLength={30}
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder={isClothing ? 'z.B. Jeans blau, Winterjacke…' : 'z.B. Holzeisenbahn, Kindersitz…'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>
            {isClothing && (
              <div className="md:col-span-3">
                <span className="block text-xs font-medium text-gray-600 mb-1">Für wen?</span>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {(['Junge', 'Mädchen', 'Unisex'] as const).map(g => (
                    <label key={g} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="radio" name="gender" checked={form.gender === g}
                        onChange={() => setForm(f => ({ ...f, gender: g }))}
                        className="accent-yellow-500 w-4 h-4 shrink-0"
                      />
                      <span className="text-sm text-gray-700">{g}</span>
                    </label>
                  ))}
                  {form.gender && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, gender: '' }))} className="text-xs text-gray-400 hover:text-gray-600 underline">
                      Auswahl aufheben
                    </button>
                  )}
                </div>
              </div>
            )}
            {isClothing && (
              <div>
                <div className="relative flex items-center gap-1.5 mb-1">
                  <label className="block text-xs font-medium text-gray-600">Größe</label>
                  <button
                    type="button"
                    onClick={() => setShowSizes(o => !o)}
                    className="w-4 h-4 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs flex items-center justify-center leading-none"
                    title="Unterstützte Größen anzeigen"
                  >
                    i
                  </button>
                  {showSizes && (
                    <div className="absolute left-0 top-6 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-72 max-w-[calc(100vw-2rem)]">
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-semibold text-sm text-gray-800">Unterstützte Größen</span>
                        <button type="button" onClick={() => setShowSizes(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
                      </div>
                      {sizeGroups(sizes).map(group => group.sizes.length > 0 && (
                        <div key={group.label} className="mb-2 last:mb-0">
                          <p className="text-xs text-gray-700 font-semibold mb-1">{group.label}</p>
                          <div className="flex flex-wrap gap-1">
                            {group.sizes.map(sz => (
                              <button
                                key={sz} type="button"
                                onClick={() => { setForm(f => ({ ...f, sizeLabel: sz })); setShowSizes(false); }}
                                className="px-1.5 py-0.5 bg-gray-100 hover:bg-yellow-100 border border-gray-200 rounded text-xs font-mono font-bold text-gray-900"
                              >
                                {sz}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <p className="text-xs text-gray-500 mt-2 border-t pt-2">Auf eine Größe klicken, um sie einzufügen.</p>
                    </div>
                  )}
                </div>
                <input
                  list="article-size-options" maxLength={40}
                  value={form.sizeLabel}
                  onChange={e => setForm(f => ({ ...f, sizeLabel: e.target.value }))}
                  placeholder="z.B. 110, M, W32…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
                <datalist id="article-size-options">{sizes.map(s => <option key={s} value={s} />)}</datalist>
              </div>
            )}
            <div className={isClothing ? undefined : 'md:col-span-2'}>
              <label className="block text-xs font-medium text-gray-600 mb-1">Preis (€) *</label>
              {/* Preis nach dem Anlegen gesperrt – Begründung an PATCH /api/seller-articles. */}
              <input
                required type="number" min="0.50" max={MAX_ARTICLE_PRICE} step="0.50"
                value={form.price}
                disabled={!!editingId}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="0,50"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:bg-gray-100 disabled:text-gray-500"
              />
              {editingId && (
                <p className="text-xs text-gray-500 mt-1">
                  Der Preis lässt sich nicht ändern. Für einen anderen Preis den Artikel löschen und neu
                  anlegen – er bekommt dann einen neuen QR-Code und braucht ein neues Etikett.
                </p>
              )}
            </div>
            <div className="md:col-span-3">
              <span className="block text-xs font-medium text-gray-600 mb-1">Tags (optional, mehrere möglich)</span>
              <TagPicker value={form.tags} onChange={tags => setForm(f => ({ ...f, tags }))} suggestions={tagOptions} />
            </div>
            {!editingId && targetBasar && (
              <label className="md:col-span-3 flex items-start gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox" checked={directToBasar} onChange={e => setDirectToBasar(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-yellow-500 flex-shrink-0"
                />
                <span>
                  Direkt in <strong>{targetBasar.title}</strong> übernehmen
                  <span className={`ml-1 ${basarFull ? 'text-orange-600 font-semibold' : 'text-gray-400'}`}>
                    ({basarCount}/{formatArticleLimit(maxArticles)})
                  </span>
                  {directToBasar && basarFull && (
                    <span className="block text-xs text-orange-700">
                      Maximale Artikelanzahl im Basar erreicht – der Artikel kann nur ohne Übernahme angelegt werden.
                    </span>
                  )}
                </span>
              </label>
            )}
            <div className="md:col-span-3 flex gap-2 justify-end">
              {editingId && (
                <button type="button" onClick={resetForm} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium">
                  Abbrechen
                </button>
              )}
              <button type="submit" disabled={saving || (!editingId && !!targetBasar && directToBasar && basarFull)} className="px-5 py-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold text-sm rounded-lg disabled:opacity-50">
                {saving ? '…' : editingId ? 'Speichern' : '+ Anlegen'}
              </button>
            </div>
          </form>
        </div>

        {/* Filter */}
        <div className="bg-white rounded-xl shadow-sm p-5 mb-5 space-y-3">
          <input
            type="search" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Suchen (Beschreibung, Größe)…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs font-medium text-gray-500 mr-1">Tags:</span>
            {tagOptions.map(t => (
              <button
                key={t} type="button" aria-pressed={tagFilter.has(t)}
                onClick={() => { setUntaggedOnly(false); setTagFilter(s => toggleSet(s, t)); }}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${tagFilter.has(t) ? 'bg-yellow-500 border-yellow-500 text-gray-900' : 'bg-white border-gray-300 text-gray-600 hover:border-yellow-500'}`}
              >
                {t}
              </button>
            ))}
            <button
              type="button" aria-pressed={untaggedOnly}
              onClick={() => { setTagFilter(new Set()); setUntaggedOnly(u => !u); }}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${untaggedOnly ? 'bg-gray-700 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-500 hover:border-gray-500'}`}
            >
              ohne Tag
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={genderFilter} onChange={e => setGenderFilter(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="">Für alle</option>
              <option value="Junge">Junge</option>
              <option value="Mädchen">Mädchen</option>
              <option value="Unisex">Unisex</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="all">Alle Artikel</option>
              <option value="available">{targetBasar ? 'Noch nicht im Basar' : 'Nicht verkauft'}</option>
              {targetBasar && <option value="inBasar">Schon im Basar</option>}
              <option value="sold">Verkauft</option>
            </select>
            {filtersActive && (
              <button
                type="button"
                onClick={() => { setQ(''); setTagFilter(new Set()); setUntaggedOnly(false); setGenderFilter(''); setStatusFilter('all'); }}
                className="text-sm text-gray-500 hover:text-gray-800 underline"
              >
                Filter zurücksetzen
              </button>
            )}
          </div>
        </div>

        {/* In Basar übernehmen */}
        {openBasars.length > 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-gray-800">In Basar übernehmen:</span>
              {openBasars.length > 1 ? (
                <select value={targetBasarId} onChange={e => { setSelected(new Set()); setTargetBasarId(e.target.value); }} className="border border-amber-300 rounded-lg px-2 py-1 bg-white">
                  {openBasars.map(b => <option key={b.id} value={b.id}>{b.title}{b.isTest ? ' (TEST)' : ''}</option>)}
                </select>
              ) : (
                <span className="text-gray-700">{targetBasar?.title}</span>
              )}
              <span className={basarFull ? 'text-orange-600 font-semibold' : 'text-gray-500'}>
                {basarCount}/{formatArticleLimit(maxArticles)} Artikel im Basar
              </span>
            </div>
            <p className="text-xs text-amber-800">
              Artikel anhaken und übernehmen. Der QR-Code bleibt gleich – schon gedruckte Etiketten gelten weiter.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set(selectableVisible.map(a => a.id)))}
                disabled={selectableVisible.length === 0}
                className="text-xs text-amber-700 hover:underline font-medium disabled:opacity-50"
              >
                Alle angezeigten auswählen ({selectableVisible.length})
              </button>
              <button
                type="button" onClick={handleTransfer} disabled={selected.size === 0}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold text-sm rounded-lg disabled:opacity-50"
              >
                {selected.size > 0 ? `${selected.size} übernehmen` : 'Übernehmen'}
              </button>
            </div>
            {targetBasar && (
              <Link href={`/seller/basars/${targetBasar.id}`} className="inline-block text-xs text-amber-700 underline">
                Zum Basar (Etiketten drucken) →
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 mb-5 px-1">
            Gerade ist kein Basar zur Anmeldung offen. Deine Artikel bleiben hier gespeichert und lassen
            sich übernehmen, sobald der nächste Basar öffnet.
          </p>
        )}

        {/* Liste */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-700">
            {filtersActive ? `${filtered.length} von ${items.length} Artikeln` : `${items.length} Artikel`}
          </div>
          {loading ? (
            <div className="text-center py-10 text-gray-400">Laden…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              {items.length === 0 ? 'Noch keine Artikel. Leg oben deinen ersten an!' : 'Keine Artikel passen zum Filter.'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map(a => (
                <div key={a.id} className={`flex items-center gap-3 px-4 py-3 ${editingId === a.id ? 'bg-yellow-50' : ''}`}>
                  {targetBasarId && (
                    <input
                      type="checkbox"
                      aria-label={`${a.title} auswählen`}
                      disabled={!transferable(a)}
                      checked={selected.has(a.id)}
                      onChange={() => setSelected(s => toggleSet(s, a.id))}
                      className="w-5 h-5 accent-yellow-500 flex-shrink-0 disabled:opacity-30"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{a.title}</p>
                    <p className="text-xs text-gray-500">
                      {a.sizeLabel && `Größe: ${a.sizeLabel} · `}
                      {a.gender && <span className="inline-block mr-1 px-1.5 py-0.5 rounded font-semibold bg-blue-50 text-blue-600">{a.gender}</span>}
                      {fmt(a.price)} €
                    </p>
                    {(a.tags.length > 0 || a.alreadyInBasar || a.soldPreviously) && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {a.soldPreviously && <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">✓ Verkauft</span>}
                        {a.alreadyInBasar && <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">Im Basar</span>}
                        {a.tags.map(t => <span key={t} className="px-1.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{t}</span>)}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => startEdit(a)} className="px-2 py-1 text-sm text-gray-500 hover:text-gray-800 flex-shrink-0" title="Bearbeiten">
                    ✎
                  </button>
                  <button type="button" onClick={() => handleDelete(a)} className="p-1 text-red-400 hover:text-red-600 flex-shrink-0" title="Löschen">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
