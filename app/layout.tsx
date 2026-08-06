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

interface DecodedTokenPayload {
  role?: 'admin' | 'seller' | 'employee';
  isEmployee?: boolean;
  isCashier?: boolean;
}

function decodeToken(token: string): DecodedTokenPayload | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload ?? null;
  } catch {
    return null;
  }
}

/**
 * Maps the JWT payload to the set of FAQ "contexts" the help assistant should
 * draw from. Note that `role` is never 'cashier' – being a cashier is the
 * `isCashier` boolean, layered on top of a seller or employee role. Admins
 * get every context so they can see (and answer) the full FAQ set.
 */
function computeContexts(payload: DecodedTokenPayload | null): string[] {
  if (!payload?.role) return [];
  if (payload.role === 'admin') return ['seller', 'employee', 'cashier'];

  const contexts: string[] = [payload.role];
  if (payload.isCashier) contexts.push('cashier');
  return contexts;
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  const payload = token ? decodeToken(token) : null;
  const contexts = computeContexts(payload);

  return (
    <html lang="de">
      <body className={inter.className}>
        <div className="min-h-screen flex flex-col">
          <main className="flex-grow">{children}</main>
          <LegalFooter />
        </div>
        {contexts.length > 0 && <ChatWidget contexts={contexts} />}
      </body>
    </html>
  );
}