import './globals.css';
import { Inter } from 'next/font/google';
import LegalFooter from './components/LegalFooter';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Kinderbasar Neukirchen - Registration',
  description: 'Registrierung für Verkäufer und Mitarbeiter',
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