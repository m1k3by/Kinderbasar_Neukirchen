import './globals.css';
import { Inter } from 'next/font/google';
import LegalFooter from './components/LegalFooter';
import type { Metadata, Viewport } from 'next';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  themeColor: '#EAB308',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Kinderbasar Neukirchen',
  description: 'Kasse, Artikel und Abrechnung für den Kinderbasar',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Kinderbasar',
  },
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className={inter.className}>
        <div className="min-h-screen flex flex-col">
          <main className="flex-grow">{children}</main>
          <LegalFooter />
        </div>
      </body>
    </html>
  );
}