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
  /** Jeder Verkauf dieses Eintrags – nicht leer = verkauft, gehört auf /seller/articles/sold. */
  soldIn: { basarId: string; basarTitle: string; eventDate: string; soldAt: string | null }[];
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

type StatusFilter = 'all' | 'available' | 'inBasar';
const EMPTY_FORM = { title: '', sizeLabel: '', gender: '', price: '', tags: [] as string[] };
const fmt = (n: number) => n.toFixed(2).replace('.', ',');
const EDIT_HINT =
  'Beschreibung, Größe und Geschlecht lassen sich jederzeit anpassen – der QR-Code bleibt dabei gleich.\nDer Preis lässt sich nicht ändern: dafür den Artikel löschen und neu anlegen.';

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
  // Formular eingeklappt, solange es Artikel gibt – die Liste ist der Hauptinhalt der Seite.
  const [showForm, setShowForm] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  // Verkaufte Einträge: hier nur gezählt (Link zur eigenen Seite) und als Tag-Vorschläge genutzt.
  const [soldItems, setSoldItems] = useState<Item[]>([]);
  const [openBasars, setOpenBasars] = useState<OpenBasar[]>([]);
  const [targetBasarId, setTargetBasarId] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [isClothing, setIsClothing] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [transferring, setTransferring] = useState(false);
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
      if (res.ok) {
        // Verkaufte Artikel blenden wir hier immer aus (Wunsch Nutzer, 11.11.2026): sie lassen
        // sich weder übernehmen noch sinnvoll bearbeiten und verwirrten in der Liste nur.
        // Sie stehen auf der eigenen Seite /seller/articles/sold, mit Basar und Datum.
        const all: Item[] = (await res.json()).sellerArticles ?? [];
        setItems(all.filter(a => (a.soldIn ?? []).length === 0));
        setSoldItems(all.filter(a => (a.soldIn ?? []).length > 0));
      }
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

  // Formular: Tags aus dem ganzen Bestand vorschlagen; Filter-Chips nur, was hier sichtbar sein kann.
  const tagSuggestions = useMemo(() => allTags([...items, ...soldItems]), [items, soldItems]);
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
      if (statusFilter === 'available' && a.alreadyInBasar) return false;
      if (statusFilter === 'inBasar' && !a.alreadyInBasar) return false;
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
    setShowForm(true);
    // Erst nach dem Aufklappen scrollen, sonst zielt scrollIntoView ins Leere.
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function resetForm() {
    if (editingId) setShowForm(false);
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
    // Doppeltipp: der zweite Request käme nach der Sperre der Route mit „bereits im Basar" zurück.
    if (ids.length === 0 || transferring) return;
    setTransferring(true);
    try {
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
    } catch {
      showMsg('Netzwerkfehler', false);
    } finally {
      setTransferring(false);
    }
  }

  const toggleSet = (set: Set<string>, v: string) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v); else n.add(v);
    return n;
  };
  const filtersActive = q || tagFilter.size > 0 || untaggedOnly || genderFilter || statusFilter !== 'all';
  const soldTotal = soldItems.length;
  const inBasarTotal = items.filter(a => a.alreadyInBasar).length;
  // Ohne Artikel ist das Formular der einzige sinnvolle Inhalt – dann immer offen.
  const formOpen = showForm || !!editingId || (!loading && items.length === 0);
  const statusTabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'Alle', count: items.length },
    { key: 'available', label: 'Nicht im Basar', count: items.filter(a => !a.alreadyInBasar).length },
    ...(targetBasar ? [{ key: 'inBasar' as const, label: 'Im Basar', count: inBasarTotal }] : []),
  ];
  const inputCls =
    'w-full rounded-xl border-0 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-200 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:bg-gray-100 disabled:text-gray-500';
  const labelCls = 'block text-xs font-semibold text-gray-500 mb-1.5';
  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
      // `!`: app/globals.css erzwingt auf Handys schwarze Schrift für jeden <button> (!important).
      active ? 'bg-gray-900 text-white!' : 'bg-white text-gray-600 ring-1 ring-gray-900/5 hover:bg-gray-100'
    }`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100/60">
      <Header
        links={getNavLinks({ role: isEmployee ? 'employee' : 'seller', isEmployee, isCashier }, 'verkaeufer')}
        sellerInfo={sellerInfo}
      />
      <div className="max-w-4xl mx-auto px-4 py-5 md:px-6 md:py-8 pb-32">
        <Link href="/seller" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-5">
          <IconChevronLeft /> Verkäuferbereich
        </Link>

        {/* Kopf */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900">Meine Artikel</h1>
            <p className="text-sm text-gray-500 mt-1.5 max-w-xl">
              Jederzeit anlegen und ordnen. Verkauft werden kann ein Artikel erst, wenn er in einem Basar ist.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {/* Kennzahlen sind zugleich Filter – dieselben wie die Status-Reiter unten.
                  Ein zweiter Klick auf die aktive Zahl hebt den Filter wieder auf. */}
              <Stat value={items.length} label="Artikel" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
              {targetBasar && (
                <Stat
                  value={inBasarTotal} label="im Basar" tone="amber" active={statusFilter === 'inBasar'}
                  onClick={() => setStatusFilter(f => (f === 'inBasar' ? 'all' : 'inBasar'))}
                />
              )}
              {soldTotal > 0 && (
                <Link
                  href="/seller/articles/sold"
                  className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm text-green-800 shadow-sm ring-1 ring-gray-900/5 hover:ring-green-700/30 transition"
                >
                  <strong className="tabular-nums">{soldTotal}</strong> verkauft <IconChevronRight />
                </Link>
              )}
            </div>
          </div>
          {!formOpen && (
            <button
              type="button"
              onClick={() => { setShowForm(true); setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0); }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-yellow-500 px-5 py-3 font-bold text-gray-900 shadow-lg shadow-yellow-500/25 hover:bg-yellow-400 active:scale-[0.98] transition"
            >
              <IconPlus /> Neuer Artikel
            </button>
          )}
        </div>

        {/* Formular: anlegen oder bearbeiten */}
        {formOpen && (
          <div ref={formRef} className="scroll-mt-24 bg-white rounded-3xl shadow-sm ring-1 ring-gray-900/5 p-5 md:p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Artikel bearbeiten' : 'Neuer Artikel'}</h2>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => { resetForm(); setShowForm(false); }}
                  className="p-2 -m-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                  aria-label="Formular schließen"
                >
                  <IconX />
                </button>
              )}
            </div>
            <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <div className="inline-flex rounded-xl bg-gray-100 p-1">
                  {([true, false] as const).map(c => (
                    <button
                      key={String(c)}
                      type="button"
                      aria-pressed={isClothing === c}
                      onClick={() => setIsClothing(c)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${isClothing === c ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      {c ? '👕 Kleidung' : '🧸 Keine Kleidung'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>
                  Beschreibung <span className="font-normal text-gray-400">· {form.title.length}/30</span>
                </label>
                <input
                  required maxLength={30}
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={isClothing ? 'z.B. Jeans blau, Winterjacke…' : 'z.B. Holzeisenbahn, Kindersitz…'}
                  className={inputCls}
                />
              </div>
              {isClothing && (
                <div className="md:col-span-2">
                  <span className={labelCls}>Für wen?</span>
                  <div className="flex flex-wrap gap-2">
                    {(['Junge', 'Mädchen', 'Unisex'] as const).map(g => (
                      <button
                        key={g} type="button" aria-pressed={form.gender === g}
                        // Erneutes Tippen hebt die Auswahl auf – „Für wen?" ist optional.
                        onClick={() => setForm(f => ({ ...f, gender: f.gender === g ? '' : g }))}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold ring-1 ring-inset transition ${
                          form.gender === g ? `${GENDER_STYLE[g]} ring-transparent` : 'bg-white text-gray-600 ring-gray-200 hover:ring-gray-300'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {isClothing && (
                <div>
                  <div className="relative flex items-center gap-1.5 mb-1.5">
                    <label className="text-xs font-semibold text-gray-500">Größe</label>
                    <button
                      type="button"
                      onClick={() => setShowSizes(o => !o)}
                      className="w-4 h-4 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 text-[10px] font-bold flex items-center justify-center leading-none"
                      title="Unterstützte Größen anzeigen"
                    >
                      i
                    </button>
                    {showSizes && (
                      <div className="absolute left-0 top-6 z-50 bg-white rounded-2xl shadow-2xl ring-1 ring-gray-900/10 p-4 w-72 max-w-[calc(100vw-2rem)]">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-semibold text-sm text-gray-800">Unterstützte Größen</span>
                          <button type="button" onClick={() => setShowSizes(false)} className="text-gray-400 hover:text-gray-600" aria-label="Schließen"><IconX /></button>
                        </div>
                        {sizeGroups(sizes).map(group => group.sizes.length > 0 && (
                          <div key={group.label} className="mb-2 last:mb-0">
                            <p className="text-xs text-gray-700 font-semibold mb-1">{group.label}</p>
                            <div className="flex flex-wrap gap-1">
                              {group.sizes.map(sz => (
                                <button
                                  key={sz} type="button"
                                  onClick={() => { setForm(f => ({ ...f, sizeLabel: sz })); setShowSizes(false); }}
                                  className="px-1.5 py-0.5 bg-gray-100 hover:bg-yellow-100 rounded-md text-xs font-mono font-bold text-gray-900"
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
                    className={inputCls}
                  />
                  <datalist id="article-size-options">{sizes.map(s => <option key={s} value={s} />)}</datalist>
                </div>
              )}
              <div className={isClothing ? undefined : 'md:col-span-2'}>
                <label className={labelCls}>Preis (€)</label>
                {/* Preis nach dem Anlegen gesperrt – Begründung an PATCH /api/seller-articles. */}
                <input
                  required type="number" min="0.50" max={MAX_ARTICLE_PRICE} step="0.50"
                  value={form.price}
                  disabled={!!editingId}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="0,50"
                  className={inputCls}
                />
                {editingId && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    Der Preis lässt sich nicht ändern. Für einen anderen Preis den Artikel löschen und neu
                    anlegen – er bekommt dann einen neuen QR-Code und braucht ein neues Etikett.
                  </p>
                )}
              </div>
              <div className="md:col-span-2">
                <span className={labelCls}>Tags <span className="font-normal text-gray-400">· optional, mehrere möglich</span></span>
                <TagPicker value={form.tags} onChange={tags => setForm(f => ({ ...f, tags }))} suggestions={tagSuggestions} />
              </div>
              {!editingId && targetBasar && (
                <label className="md:col-span-2 flex items-start gap-3 rounded-2xl bg-amber-50 ring-1 ring-inset ring-amber-200/70 p-3.5 text-sm text-gray-700 cursor-pointer select-none">
                  <input
                    type="checkbox" checked={directToBasar} onChange={e => setDirectToBasar(e.target.checked)}
                    className="w-5 h-5 mt-0.5 accent-yellow-500 flex-shrink-0"
                  />
                  <span>
                    Direkt in <strong>{targetBasar.title}</strong> übernehmen
                    <span className={`ml-1.5 tabular-nums ${basarFull ? 'text-orange-600 font-semibold' : 'text-gray-400'}`}>
                      {basarCount}/{formatArticleLimit(maxArticles)}
                    </span>
                    {directToBasar && basarFull && (
                      <span className="block text-xs text-orange-700 mt-0.5">
                        Maximale Artikelanzahl im Basar erreicht – der Artikel kann nur ohne Übernahme angelegt werden.
                      </span>
                    )}
                  </span>
                </label>
              )}
              <div className="md:col-span-2 flex gap-2 justify-end pt-1">
                {editingId && (
                  <button type="button" onClick={resetForm} className="px-4 py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 text-sm font-semibold">
                    Abbrechen
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving || (!editingId && !!targetBasar && directToBasar && basarFull)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold text-sm shadow-md shadow-yellow-500/20 disabled:opacity-50 disabled:shadow-none transition"
                >
                  {saving ? '…' : editingId ? 'Speichern' : <><IconPlus /> Anlegen</>}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Ziel-Basar */}
        {targetBasar ? (
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-yellow-400 to-amber-500 p-5 md:p-6 mb-6 text-gray-900 shadow-lg shadow-amber-500/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-900/60">Anmeldung offen</p>
                {openBasars.length > 1 ? (
                  <select
                    value={targetBasarId}
                    onChange={e => { setSelected(new Set()); setTargetBasarId(e.target.value); }}
                    className="mt-1 max-w-full rounded-xl border-0 bg-white/70 px-3 py-1.5 text-lg font-bold focus:ring-2 focus:ring-gray-900"
                  >
                    {openBasars.map(b => <option key={b.id} value={b.id}>{b.title}{b.isTest ? ' (TEST)' : ''}</option>)}
                  </select>
                ) : (
                  <p className="text-xl font-extrabold truncate">{targetBasar.title}</p>
                )}
              </div>
              <Link
                href={`/seller/basars/${targetBasar.id}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 shrink-0"
              >
                Etiketten drucken <IconChevronRight />
              </Link>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs font-semibold text-gray-900/70 mb-1.5">
                <span>Artikel im Basar</span>
                <span className="tabular-nums">{basarCount} / {formatArticleLimit(maxArticles)}</span>
              </div>
              <div className="h-2 rounded-full bg-white/40 overflow-hidden">
                <div
                  className={`h-full rounded-full ${basarFull ? 'bg-orange-700' : 'bg-gray-900'}`}
                  style={{ width: `${Number.isFinite(maxArticles) ? Math.min(100, (basarCount / maxArticles) * 100) : 0}%` }}
                />
              </div>
              <p className="text-xs text-gray-900/70 mt-2.5">
                Artikel unten anhaken und übernehmen. Der QR-Code bleibt gleich – gedruckte Etiketten gelten weiter.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl bg-white/70 ring-1 ring-gray-900/5 px-4 py-3 mb-6 text-sm text-gray-500">
            <span aria-hidden="true">🗓️</span>
            <span>
              Gerade ist kein Basar zur Anmeldung offen. Deine Artikel bleiben hier und lassen sich übernehmen,
              sobald der nächste Basar öffnet.
            </span>
          </div>
        )}

        {/* Filter */}
        <div className="mb-4 space-y-3">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-gray-400"><IconSearch /></span>
            <input
              type="search" value={q} onChange={e => setQ(e.target.value)}
              placeholder="Suchen nach Beschreibung oder Größe"
              className="w-full rounded-2xl border-0 bg-white py-3 pl-11 pr-4 text-sm shadow-sm ring-1 ring-gray-900/5 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
          {/* Reiter nur mit offenem Basar – ohne ihn gibt es nichts zu unterscheiden.
              Am Handy steht die Zahl unter der Beschriftung, sonst passen drei Reiter nicht auf 375 px. */}
          {targetBasar && (
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-gray-900/5">
            {statusTabs.map(t => (
              <button
                key={t.key} type="button" aria-pressed={statusFilter === t.key}
                onClick={() => setStatusFilter(t.key)}
                className={`flex flex-col sm:flex-row items-center justify-center gap-x-1.5 rounded-xl px-2 py-2 text-sm font-semibold leading-tight text-center transition ${
                  statusFilter === t.key ? 'bg-gray-900 text-white! shadow' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.label}
                <span className={`tabular-nums text-xs ${statusFilter === t.key ? 'text-white/60' : 'text-gray-400'}`}>{t.count}</span>
              </button>
            ))}
          </div>
          )}
          {/* Am Handy eine waagerecht wischbare Zeile statt drei umbrechender Reihen. */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap [scrollbar-width:none]">
            {(['Mädchen', 'Junge', 'Unisex'] as const).map(g => (
              <button key={g} type="button" aria-pressed={genderFilter === g} onClick={() => setGenderFilter(v => (v === g ? '' : g))} className={chip(genderFilter === g)}>
                {g}
              </button>
            ))}
            <span className="w-px shrink-0 bg-gray-200 mx-1" aria-hidden="true" />
            {tagOptions.map(t => (
              <button
                key={t} type="button" aria-pressed={tagFilter.has(t)}
                onClick={() => { setUntaggedOnly(false); setTagFilter(s => toggleSet(s, t)); }}
                className={chip(tagFilter.has(t))}
              >
                #{t}
              </button>
            ))}
            <button
              type="button" aria-pressed={untaggedOnly}
              onClick={() => { setTagFilter(new Set()); setUntaggedOnly(u => !u); }}
              className={chip(untaggedOnly)}
            >
              ohne Tag
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-sm">
            <span className="text-gray-500">
              {filtersActive
                ? <><strong className="text-gray-900">{filtered.length}</strong> von {items.length} Artikeln</>
                : <><strong className="text-gray-900">{items.length}</strong> Artikel</>}
            </span>
            <div className="flex items-center gap-4">
              {targetBasar && selectableVisible.length > 0 && (
                <button type="button" onClick={() => setSelected(new Set(selectableVisible.map(a => a.id)))} className="font-semibold text-amber-700! hover:text-amber-900! whitespace-nowrap">
                  Alle {selectableVisible.length} auswählen
                </button>
              )}
              {filtersActive && (
                <button
                  type="button"
                  onClick={() => { setQ(''); setTagFilter(new Set()); setUntaggedOnly(false); setGenderFilter(''); setStatusFilter('all'); }}
                  className="font-semibold text-gray-500! hover:text-gray-900! whitespace-nowrap"
                >
                  Zurücksetzen
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Liste */}
        {loading ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-white/70 ring-1 ring-gray-900/5 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl bg-white ring-1 ring-gray-900/5 py-14 text-center">
            <div className="text-4xl mb-2" aria-hidden="true">{items.length === 0 ? '🧺' : '🔍'}</div>
            <p className="font-semibold text-gray-800">{items.length === 0 ? 'Noch keine Artikel' : 'Nichts gefunden'}</p>
            <p className="text-sm text-gray-500 mt-1">{items.length === 0 ? 'Leg oben deinen ersten Artikel an.' : 'Kein Artikel passt zu diesem Filter.'}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {filtered.map(a => {
              const canPick = transferable(a);
              const isSel = selected.has(a.id);
              return (
                <div
                  key={a.id}
                  className={`relative flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 transition ${
                    editingId === a.id ? 'ring-2 ring-yellow-500' : isSel ? 'ring-2 ring-amber-500 bg-amber-50/40' : 'ring-gray-900/5 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {targetBasar && (
                      <input
                        type="checkbox"
                        aria-label={`${a.title} auswählen`}
                        disabled={!canPick}
                        checked={isSel}
                        onChange={() => setSelected(s => toggleSet(s, a.id))}
                        className="mt-1 w-5 h-5 accent-amber-500 flex-shrink-0 disabled:opacity-25"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 leading-snug break-words">{a.title}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {a.sizeLabel && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-mono font-bold text-gray-700">{a.sizeLabel}</span>}
                        {a.gender && <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${GENDER_STYLE[a.gender] ?? 'bg-gray-100 text-gray-600'}`}>{a.gender}</span>}
                      </div>
                    </div>
                    <span className="text-lg font-extrabold tabular-nums text-gray-900 whitespace-nowrap">{fmt(a.price)} €</span>
                  </div>
                  <div className="flex items-end justify-between gap-2 mt-3">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      {a.alreadyInBasar && <Badge tone="amber">Im Basar</Badge>}
                      {a.tags.map(t => <span key={t} className="text-xs font-medium text-gray-400">#{t}</span>)}
                    </div>
                    <div className="flex shrink-0 -mr-1.5 -mb-1.5">
                      {/* Der title-Tooltip am Stift erscheint nur bei Mausbedienung; auf dem Handy
                          trägt dieses ⓘ denselben Text. <details> öffnet und schließt per Tippen
                          ohne eigenen State. */}
                      <details className="relative md:hidden">
                        <summary className="list-none [&::-webkit-details-marker]:hidden p-2 rounded-full text-gray-400 hover:text-gray-900 hover:bg-gray-100 cursor-pointer leading-none" aria-label="Hinweis zum Bearbeiten">
                          ⓘ
                        </summary>
                        <p className="absolute right-0 bottom-full mb-1 z-10 w-64 rounded-xl bg-gray-900 px-3 py-2 text-xs text-white shadow-lg whitespace-pre-line">
                          {EDIT_HINT}
                        </p>
                      </details>
                      <button type="button" onClick={() => startEdit(a)} className="p-2 rounded-full text-gray-400 hover:text-gray-900 hover:bg-gray-100" title={`Bearbeiten\n${EDIT_HINT}`} aria-label="Bearbeiten">
                        <IconPencil />
                      </button>
                      <button type="button" onClick={() => handleDelete(a)} className="p-2 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50" title="Löschen" aria-label="Löschen">
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Schwebende Auswahl-Leiste. Rechts Platz für den Chat-Knopf (ChatWidget, bottom-4 right-4). */}
      {targetBasar && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 px-4 pr-24 sm:pr-4 flex justify-center pointer-events-none">
          <div className="pointer-events-auto flex w-full max-w-lg items-center gap-2 rounded-2xl bg-gray-900 p-2 text-white shadow-2xl">
            <button
              type="button" onClick={() => setSelected(new Set())}
              className="shrink-0 rounded-xl px-2.5 text-white/60! hover:text-white! hover:bg-white/10"
              aria-label="Auswahl aufheben" title="Auswahl aufheben"
            >
              <IconX />
            </button>
            <button
              type="button" onClick={handleTransfer} disabled={transferring}
              className="flex-1 rounded-xl bg-yellow-500 px-4 py-2 text-sm font-bold text-gray-900 hover:bg-yellow-400 whitespace-nowrap tabular-nums disabled:opacity-50"
            >
              {transferring ? '…' : `${selected.size} übernehmen`}
            </button>
          </div>
        </div>
      )}

      {/* Rückmeldung als Toast, damit sie auch weit unten in der Liste sichtbar ist. */}
      {message && (
        <div
          role="status"
          className={`fixed left-1/2 top-24 z-50 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md rounded-2xl px-4 py-3 text-sm font-semibold shadow-2xl ${
            message.ok ? 'bg-gray-900 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}

const GENDER_STYLE: Record<string, string> = {
  Mädchen: 'bg-pink-50 text-pink-700',
  Junge: 'bg-sky-50 text-sky-700',
  Unisex: 'bg-violet-50 text-violet-700',
};

function Stat({ value, label, tone = 'gray', active, onClick }: {
  value: number; label: string; tone?: 'gray' | 'amber' | 'green'; active: boolean; onClick: () => void;
}) {
  const cls = { gray: 'bg-white text-gray-700', amber: 'bg-amber-100 text-amber-800', green: 'bg-green-100 text-green-800' }[tone];
  return (
    <button
      type="button" aria-pressed={active} onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm shadow-sm transition hover:shadow ${cls} ${
        active ? 'ring-2 ring-gray-900' : 'ring-1 ring-gray-900/5 hover:ring-gray-900/20'
      }`}
    >
      <strong className="tabular-nums">{value}</strong> {label}
    </button>
  );
}

function Badge({ tone, children }: { tone: 'green' | 'amber'; children: React.ReactNode }) {
  const cls = tone === 'green' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

const svg = {
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
};
const IconSearch = () => <svg {...svg}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
const IconPlus = () => <svg {...svg}><path d="M12 5v14M5 12h14" /></svg>;
const IconX = () => <svg {...svg}><path d="M18 6 6 18M6 6l12 12" /></svg>;
const IconPencil = () => <svg {...svg}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
const IconTrash = () => <svg {...svg}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>;
const IconChevronLeft = () => <svg {...svg} width={16} height={16}><path d="m15 18-6-6 6-6" /></svg>;
const IconChevronRight = () => <svg {...svg} width={16} height={16}><path d="m9 18 6-6-6-6" /></svg>;
