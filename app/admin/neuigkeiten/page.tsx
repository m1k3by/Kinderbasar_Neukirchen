'use client';

import { useState, useEffect } from 'react';
import Header from '../../components/Header';
import { getNavLinks } from '../../lib/navLinks';

interface PostRow {
  id: string;
  title: string;
  body: string;
  fileName: string | null;
  hasFile: boolean;
  isPublished: boolean;
  publishedAt: string | null;
}

export default function NeuigkeitenPage() {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [publish, setPublish] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setError('');
      const res = await fetch('/api/admin/posts');
      if (!res.ok) throw new Error('Fehler beim Laden der Beiträge');
      setPosts((await res.json()).posts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden der Beiträge');
    } finally {
      setLoading(false);
    }
  }

  async function send(url: string, method: string, form?: FormData) {
    setError('');
    const res = await fetch(url, { method, body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Aktion fehlgeschlagen');
      return false;
    }
    await load();
    return true;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const form = new FormData();
    form.set('title', title);
    form.set('body', body);
    form.set('isPublished', String(publish));
    if (file) form.set('file', file);
    if (await send('/api/admin/posts', 'POST', form)) {
      setTitle('');
      setBody('');
      setPublish(false);
      setFile(null);
      setFileKey(k => k + 1);
    }
  }

  function patch(id: string, fields: Record<string, string | File>) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return send(`/api/admin/posts/${id}`, 'PATCH', form);
  }

  async function saveEdit(id: string) {
    if (await patch(id, { title: editTitle, body: editBody })) setEditId(null);
  }

  async function remove(p: PostRow) {
    if (!confirm(`Beitrag „${p.title}“ wirklich löschen?`)) return;
    await send(`/api/admin/posts/${p.id}`, 'DELETE');
  }

  const input = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm';
  const btn = 'px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50';

  return (
    <div className="min-h-screen bg-gray-100">
      <Header links={getNavLinks({ role: 'admin' }, 'neuigkeiten')} />

      <div className="max-w-4xl mx-auto p-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Neuigkeiten</h1>
        <p className="text-gray-600 mb-6">
          Veröffentlichte Beiträge erscheinen ohne Login auf der Startseite und im{' '}
          <a href="/feed.xml" target="_blank" rel="noopener" className="text-blue-700 hover:underline">RSS-Feed</a>.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>
        )}

        <form onSubmit={create} className="bg-white/90 rounded-lg shadow p-6 mb-6 space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">Neuer Beitrag</h2>
          <input className={input} placeholder="Titel" maxLength={200} required value={title} onChange={e => setTitle(e.target.value)} />
          <textarea className={input} placeholder="Text" rows={5} maxLength={5000} value={body} onChange={e => setBody(e.target.value)} />
          <div>
            <label className="block text-sm text-gray-600 mb-1">PDF-Datei (optional, höchstens 4 MB)</label>
            <input key={fileKey} type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={publish} onChange={e => setPublish(e.target.checked)} />
            Sofort veröffentlichen
          </label>
          <button type="submit" className="px-4 py-2 rounded-md bg-yellow-500 hover:bg-yellow-600 text-gray-800 text-sm font-medium">
            Beitrag speichern
          </button>
        </form>

        {loading ? (
          <p className="text-gray-600">Lade …</p>
        ) : posts.length === 0 ? (
          <p className="text-gray-600">Noch keine Beiträge.</p>
        ) : (
          <div className="space-y-4">
            {posts.map(p => (
              <div key={p.id} className="bg-white/90 rounded-lg shadow p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-800">{p.title}</h3>
                    <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded ${p.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                      {p.isPublished ? 'Veröffentlicht' : 'Entwurf'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button className={btn} onClick={() => patch(p.id, { isPublished: String(!p.isPublished) })}>
                      {p.isPublished ? 'Zurückziehen' : 'Veröffentlichen'}
                    </button>
                    <button className={btn} onClick={() => { setEditId(p.id); setEditTitle(p.title); setEditBody(p.body); }}>
                      Bearbeiten
                    </button>
                    <button className={`${btn} text-red-700`} onClick={() => remove(p)}>Löschen</button>
                  </div>
                </div>

                {editId === p.id ? (
                  <div className="mt-3 space-y-2">
                    <input className={input} maxLength={200} value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                    <textarea className={input} rows={5} maxLength={5000} value={editBody} onChange={e => setEditBody(e.target.value)} />
                    <div className="flex gap-2">
                      <button className={btn} onClick={() => saveEdit(p.id)}>Speichern</button>
                      <button className={btn} onClick={() => setEditId(null)}>Abbrechen</button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-gray-700 whitespace-pre-line">{p.body}</p>
                )}

                <div className="mt-3 text-sm text-gray-700 flex flex-wrap items-center gap-3">
                  {p.hasFile ? (
                    <>
                      {p.isPublished ? (
                        <a href={`/api/posts/${p.id}/datei`} target="_blank" rel="noopener" className="text-blue-700 hover:underline">
                          {p.fileName} (PDF)
                        </a>
                      ) : (
                        <span>{p.fileName} (PDF)</span>
                      )}
                      <button className={btn} onClick={() => patch(p.id, { removeFile: 'true' })}>PDF entfernen</button>
                    </>
                  ) : (
                    <span className="text-gray-500">Kein PDF</span>
                  )}
                  <label className={`${btn} cursor-pointer`}>
                    PDF {p.hasFile ? 'ersetzen' : 'hinzufügen'}
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) patch(p.id, { file: f });
                      }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
