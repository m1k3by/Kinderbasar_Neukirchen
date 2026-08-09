'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { findAnswer, getSuggestedQuestions } from '../lib/chatbot';
import { faqData, type FaqItem, type FaqCategory } from '../data/faq';

const CATEGORY_ORDER: FaqCategory[] = [
  'Artikel & Etiketten',
  'Abrechnung & Geld',
  'Helfer & Kuchen',
  'Kasse',
  'Konto & Login',
];

const CATEGORY_ICON: Record<FaqCategory, string> = {
  'Artikel & Etiketten': '🏷️',
  'Abrechnung & Geld': '💰',
  'Helfer & Kuchen': '🧁',
  'Kasse': '💳',
  'Konto & Login': '🔑',
};

type ChatMessage =
  | { id: number; kind: 'text'; text: string }
  | { id: number; kind: 'answer'; item: FaqItem; alternatives: FaqItem[]; logId: string | null; feedback: 'up' | 'down' | null }
  | { id: number; kind: 'suggestions'; items: FaqItem[] }
  | { id: number; kind: 'none' }
  | { id: number; kind: 'user'; text: string };

type ResultType = 'answer' | 'suggestions' | 'none';

function renderText(text: string) {
  return text.split('\n').map((line, lineIdx) => {
    const parts = line.split(/\*\*(.*?)\*\*/g);
    const rendered = parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
    );
    return lineIdx === 0 ? rendered : [<br key={`br-${lineIdx}`} />, ...rendered];
  });
}

async function logChat(question: string, matchedFaqId: string | undefined, resultType: ResultType): Promise<string | null> {
  try {
    const res = await fetch('/api/chat-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, matchedFaqId, resultType }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.id ?? null;
  } catch {
    return null;
  }
}

function sendFeedback(logId: string, helpful: boolean) {
  fetch('/api/chat-feedback', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logId, helpful }),
  }).catch(() => { /* fire-and-forget – ignore errors */ });
}

const WELCOME = 'Hallo! Ich bin dein Hilfe-Assistent für den Kinderbasar. Wie kann ich dir helfen?';
const NONE_MESSAGE = 'Dazu habe ich leider keine passende Antwort gefunden. Frag gern anders, oder schau in den Themen nach:';

const PANEL_HEIGHT = 560;
// bottom-4 (16px) + toggle button (56px) + mb-3 gap (12px) + a little breathing room.
const RESERVED_BELOW_PANEL = 16 + 56 + 12 + 8;
const TOP_CLEARANCE = 16;

export default function ChatWidget({ contexts }: { contexts: string[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [openCategory, setOpenCategory] = useState<FaqCategory | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 0, kind: 'text', text: WELCOME }]);
  const [input, setInput] = useState('');
  const [panelHeight, setPanelHeight] = useState(PANEL_HEIGHT);
  // A ref, not state: several messages are appended within a single event handler, and a
  // state counter would hand out the same id to all of them (the new value is only visible
  // after a re-render) – producing duplicate React keys.
  const nextIdRef = useRef(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const relevantFaqs = faqData.filter((item) => item.roles.some((r) => contexts.includes(r)));
  const categories = CATEGORY_ORDER.filter((cat) => relevantFaqs.some((item) => item.category === cat));
  const suggestions = getSuggestedQuestions(contexts);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, browsing]);

  useEffect(() => {
    if (isOpen && !browsing) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, browsing]);

  // The panel is anchored to the viewport bottom with a fixed target height, but on short
  // viewports (small windows, phones, landscape) that pushes its top edge above the sticky
  // header – which sits at a higher z-index and paints over it. Cap the height to whatever
  // space is actually free above the header so it never gets clipped.
  useEffect(() => {
    function updatePanelHeight() {
      const headerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
      const available = window.innerHeight - headerHeight - RESERVED_BELOW_PANEL - TOP_CLEARANCE;
      setPanelHeight(Math.max(280, Math.min(PANEL_HEIGHT, available)));
    }
    updatePanelHeight();
    window.addEventListener('resize', updatePanelHeight);
    return () => window.removeEventListener('resize', updatePanelHeight);
  }, [isOpen]);

  function takeId(): number {
    return nextIdRef.current++;
  }

  function appendAnswer(item: FaqItem, alternatives: FaqItem[], questionText: string) {
    const id = takeId();
    setMessages((prev) => [...prev, { id, kind: 'answer', item, alternatives, logId: null, feedback: null }]);
    logChat(questionText, item.id, 'answer').then((logId) => {
      if (!logId) return;
      setMessages((prev) => prev.map((m) => (m.id === id && m.kind === 'answer' ? { ...m, logId } : m)));
    });
  }

  function selectFaqItem(item: FaqItem) {
    appendAnswer(item, [], item.question);
    setBrowsing(false);
  }

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    // ids are taken outside the setMessages updater – React re-runs updaters in StrictMode,
    // which would otherwise burn two ids per message.
    const userId = takeId();
    setMessages((prev) => [...prev, { id: userId, kind: 'user', text: trimmed }]);
    setInput('');

    const result = findAnswer(trimmed, contexts);
    if (result.type === 'answer') {
      appendAnswer(result.item, result.alternatives, trimmed);
    } else if (result.type === 'suggestions') {
      const id = takeId();
      setMessages((prev) => [...prev, { id, kind: 'suggestions', items: result.items }]);
      logChat(trimmed, undefined, 'suggestions');
    } else {
      const id = takeId();
      setMessages((prev) => [...prev, { id, kind: 'none' }]);
      logChat(trimmed, undefined, 'none');
    }
  }

  function handleFeedback(messageId: number, helpful: boolean) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || m.kind !== 'answer' || m.feedback) return m;
        if (m.logId) sendFeedback(m.logId, helpful);
        return { ...m, feedback: helpful ? 'up' : 'down' };
      })
    );
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') sendMessage(input);
  }

  function openBrowser(cat?: FaqCategory) {
    setBrowsing(true);
    setOpenCategory(cat ?? null);
  }

  const showSuggestions = messages.length === 1;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end">
      {isOpen && (
        <div
          className="mb-3 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          style={{ height: `${panelHeight}px` }}
        >
          {/* Header */}
          <div className="bg-yellow-400 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-700 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className="font-semibold text-gray-800 text-sm truncate">Hilfe-Assistent</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => (browsing ? setBrowsing(false) : openBrowser())}
                className={`text-xs font-medium px-2 py-1 rounded-full transition-colors ${
                  browsing ? 'bg-gray-800 text-white' : 'text-gray-700 hover:bg-yellow-500'
                }`}
                title="Alle Themen"
              >
                📖 Themen
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-700 hover:text-gray-900 w-6 h-6 flex items-center justify-center rounded-full hover:bg-yellow-500 transition-colors"
                aria-label="Schließen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {browsing ? (
            <div className="flex-1 overflow-y-auto p-3">
              <p className="text-xs text-gray-400 mb-2">Wähle ein Thema, dann eine Frage:</p>
              <div className="space-y-1.5">
                {categories.map((cat) => {
                  const items = relevantFaqs.filter((i) => i.category === cat);
                  const open = openCategory === cat;
                  return (
                    <div key={cat} className="border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setOpenCategory(open ? null : cat)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                      >
                        <span className="text-sm font-medium text-gray-700">
                          {CATEGORY_ICON[cat]} {cat}
                        </span>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {open && (
                        <div className="flex flex-col divide-y divide-gray-100">
                          {items.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => selectFaqItem(item)}
                              className="text-left text-xs px-3 py-2 text-gray-600 hover:bg-yellow-50 transition-colors"
                            >
                              {item.question}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.map((msg) => {
                  if (msg.kind === 'user') {
                    return (
                      <div key={msg.id} className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed bg-yellow-400 text-gray-800 rounded-br-sm">
                          {renderText(msg.text)}
                        </div>
                      </div>
                    );
                  }

                  if (msg.kind === 'text') {
                    return (
                      <div key={msg.id} className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed bg-gray-100 text-gray-800 rounded-bl-sm">
                          {renderText(msg.text)}
                        </div>
                      </div>
                    );
                  }

                  if (msg.kind === 'answer') {
                    return (
                      <div key={msg.id} className="flex justify-start">
                        <div className="max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed bg-gray-100 text-gray-800 rounded-bl-sm">
                          {renderText(msg.item.answer)}

                          {msg.alternatives.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <p className="text-xs text-gray-400 mb-1">Ähnliche Fragen:</p>
                              <div className="flex flex-col gap-1">
                                {msg.alternatives.map((alt) => (
                                  <button
                                    key={alt.id}
                                    onClick={() => selectFaqItem(alt)}
                                    className="text-left text-xs bg-white hover:bg-yellow-50 border border-gray-200 rounded-lg px-2 py-1 text-gray-600 transition-colors"
                                  >
                                    {alt.question}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="mt-2 pt-1.5 border-t border-gray-200 flex items-center gap-2">
                            {msg.feedback ? (
                              <span className="text-xs text-gray-400">Danke für dein Feedback!</span>
                            ) : msg.logId ? (
                              <>
                                <span className="text-xs text-gray-400">Hilfreich?</span>
                                <button
                                  onClick={() => handleFeedback(msg.id, true)}
                                  className="text-sm hover:scale-110 transition-transform"
                                  aria-label="Hilfreich"
                                >
                                  👍
                                </button>
                                <button
                                  onClick={() => handleFeedback(msg.id, false)}
                                  className="text-sm hover:scale-110 transition-transform"
                                  aria-label="Nicht hilfreich"
                                >
                                  👎
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (msg.kind === 'suggestions') {
                    return (
                      <div key={msg.id} className="flex justify-start">
                        <div className="max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed bg-gray-100 text-gray-800 rounded-bl-sm">
                          <p>Meintest du eine dieser Fragen?</p>
                          <div className="flex flex-col gap-1 mt-2">
                            {msg.items.map((item) => (
                              <button
                                key={item.id}
                                onClick={() => selectFaqItem(item)}
                                className="text-left text-xs bg-white hover:bg-yellow-50 border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 transition-colors"
                              >
                                {item.question}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // kind === 'none'
                  return (
                    <div key={msg.id} className="flex justify-start">
                      <div className="max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed bg-gray-100 text-gray-800 rounded-bl-sm">
                        <p>{NONE_MESSAGE}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {categories.map((cat) => (
                            <button
                              key={cat}
                              onClick={() => openBrowser(cat)}
                              className="text-xs bg-white hover:bg-yellow-50 border border-gray-200 rounded-full px-2 py-1 text-gray-600 transition-colors"
                            >
                              {CATEGORY_ICON[cat]} {cat}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Suggested questions – shown before the first question is asked */}
              {showSuggestions && (
                <div className="px-3 py-2 border-t border-gray-100 flex-shrink-0">
                  <p className="text-xs text-gray-400 mb-1.5">Schnellhilfe:</p>
                  <div className="flex flex-col gap-1">
                    {suggestions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(q)}
                        className="text-left text-xs bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-lg px-2 py-1.5 text-gray-700 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="border-t border-gray-200 p-2 flex gap-2 flex-shrink-0">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Frage eingeben..."
                  className="flex-1 text-sm border border-gray-200 rounded-full px-3 py-1.5 focus:outline-none focus:border-yellow-400 bg-gray-50"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim()}
                  className="bg-yellow-400 hover:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed text-gray-800 rounded-full w-8 h-8 flex items-center justify-center transition-colors flex-shrink-0"
                  aria-label="Senden"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 rounded-full w-14 h-14 flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95"
        aria-label={isOpen ? 'Hilfe schließen' : 'Hilfe öffnen'}
      >
        {isOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>
    </div>
  );
}
