import './globals.css';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import LegalFooter from './components/LegalFooter';
import ChatWidget from './components/ChatWidget';
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

function getRoleFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  const role = token ? getRoleFromToken(token) : null;
  const showChat = role && role !== 'admin';

  return (
    <html lang="de">
      <body className={inter.className}>
        <div className="min-h-screen flex flex-col">
          <main className="flex-grow">{children}</main>
          <LegalFooter />
        </div>
        {showChat && <ChatWidget role={role} />}
      </body>
    </html>
  );
}