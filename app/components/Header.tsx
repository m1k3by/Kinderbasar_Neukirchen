'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { NavLink } from '../lib/navLinks';

interface HeaderProps {
  title?: string;
  links?: NavLink[];
  sellerInfo?: { name: string; sellerId: number } | null;
  noTitleLink?: boolean;
}

export default function Header({
  title = 'Kinderbasar Neukirchen',
  links = [{ href: '/', label: 'Zurück' }],
  sellerInfo = null,
  noTitleLink = false
}: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [errorCount, setErrorCount] = useState(0);

  // Nur Admin-Navigationen enthalten den Marker (app/lib/navLinks.ts). Dadurch fragt keine
  // Verkaeufer- oder Mitarbeiterseite eine Admin-Route an, die ihr ohnehin 403 antworten wuerde.
  const hasErrorBadge = links.some((link) => link.badge === 'errors');

  // ponytail: einmal beim Mounten, kein Polling. Der Admin laedt die Seite ohnehin neu;
  // ein Intervall waere eine Dauerlast fuer eine Zahl, die sich selten aendert.
  useEffect(() => {
    if (!hasErrorBadge) return;
    fetch('/api/admin/errors?count=1')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setErrorCount(data?.unresolved ?? 0))
      .catch(() => {});
  }, [hasErrorBadge]);

  const badge = (link: NavLink) =>
    link.badge === 'errors' && errorCount > 0 ? (
      <span
        className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-xs font-bold"
        aria-label={`${errorCount} offene Fehler`}
      >
        {errorCount}
      </span>
    ) : null;

  return (
    <header className="sticky top-0 z-50 bg-yellow-500 text-gray-800 shadow-md">
      <div className="max-w-6xl mx-auto px-4 py-3">
        <div className="flex justify-between items-center gap-4">

          {/* Logo + User-Info untereinander */}
          <div className="flex flex-col min-w-0">
            {noTitleLink ? (
              <span className="text-xl md:text-2xl font-bold leading-tight">{title}</span>
            ) : (
              <Link href="/" className="text-xl md:text-2xl font-bold leading-tight hover:underline">
                {title}
              </Link>
            )}
            {sellerInfo && (
              <span className="text-xs text-gray-700 leading-tight mt-0.5 truncate">
                {sellerInfo.name} &middot; Nr.&nbsp;{sellerInfo.sellerId}
              </span>
            )}
          </div>

          {/* Desktop-Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  link.active
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-800 hover:bg-yellow-600'
                }`}
              >
                {link.label}
                {badge(link)}
              </Link>
            ))}
          </nav>

          {/* Burger-Button (Mobile) */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 rounded hover:bg-yellow-600 transition-colors flex-shrink-0"
            aria-label={isMenuOpen ? 'Menü schließen' : 'Menü öffnen'}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              {isMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile-Navigation */}
        {isMenuOpen && (
          <nav className="md:hidden mt-3 pt-3 border-t border-yellow-600" id="mobile-menu">
            <div className="flex flex-col gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`text-base py-2 px-3 rounded-md transition-colors ${
                    link.active ? 'bg-gray-900 text-white font-medium' : 'hover:bg-yellow-600'
                  }`}
                >
                  {link.label}
                  {badge(link)}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
