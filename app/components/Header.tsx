'use client';

import { useState } from 'react';
import Link from 'next/link';

interface HeaderProps {
  title?: string;
  links?: { href: string; label: string; active?: boolean }[];
  sellerInfo?: { name: string; sellerId: number } | null;
}

export default function Header({ 
  title = 'Kinderbasar Neukirchen', 
  links = [{ href: '/', label: 'Zurück' }],
  sellerInfo = null
}: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-yellow-500 text-gray-800 shadow-md">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          {/* Logo/Title */}
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl md:text-2xl font-bold hover:underline">
              {title}
            </Link>
            {sellerInfo && (
              <div className="hidden md:block bg-white/90 px-3 py-1 rounded-md text-sm">
                <span className="font-semibold">{sellerInfo.name}</span>
                <span className="text-gray-600 ml-2">ID: {sellerInfo.sellerId}</span>
              </div>
            )}
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex gap-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`hover:underline text-base ${link.active ? 'font-bold' : ''}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Mobile Burger Menu Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 rounded hover:bg-yellow-600 transition-colors"
            aria-label={isMenuOpen ? 'Menü schließen' : 'Menü öffnen'}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              {isMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Navigation Menu */}
        {isMenuOpen && (
          <nav className="md:hidden mt-4 pt-4 border-t border-yellow-600" id="mobile-menu">
            <div className="flex flex-col gap-3">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`text-lg py-2 px-3 rounded hover:bg-yellow-600 transition-colors ${
                    link.active ? 'font-bold bg-yellow-600' : ''
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
