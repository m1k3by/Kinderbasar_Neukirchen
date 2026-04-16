'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { findAnswer, getSuggestedQuestions } from '../lib/chatbot';

interface Message {
  id: number;
  text: string;
  isUser: boolean;
}

function renderText(text: string) {
  return text.split('\n').map((line, lineIdx) => {
    const parts = line.split(/\*\*(.*?)\*\*/g);
    const rendered = parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
    );
    return lineIdx === 0 ? rendered : [<br key={`br-${lineIdx}`} />, ...rendered];
  });
}

const WELCOME = 'Hallo! Ich bin dein Hilfe-Assistent für den Kinderbasar. Wie kann ich dir helfen?';

export default function ChatWidget({ role }: { role: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, text: WELCOME, isUser: false },
  ]);
  const [input, setInput] = useState('');
  const [nextId, setNextId] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = getSuggestedQuestions(role);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const answer = findAnswer(trimmed, role);
    setMessages((prev) => [
      ...prev,
      { id: nextId, text: trimmed, isUser: true },
      { id: nextId + 1, text: answer, isUser: false },
    ]);
    setNextId((n) => n + 2);
    setInput('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') sendMessage(input);
  }

  const showSuggestions = messages.length === 1;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end">
      {isOpen && (
        <div className="mb-3 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
             style={{ height: '440px' }}>
          {/* Header */}
          <div className="bg-yellow-400 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className="font-semibold text-gray-800 text-sm">Hilfe-Assistent</span>
            </div>
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

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  msg.isUser
                    ? 'bg-yellow-400 text-gray-800 rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  {renderText(msg.text)}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested questions */}
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
