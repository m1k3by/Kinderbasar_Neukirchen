import Link from 'next/link';

export default function LegalFooter() {
  return (
    <footer className="mt-12 pt-6 pb-4 border-t border-gray-300">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-600">
          <p className="text-center md:text-left">
            © {new Date().getFullYear()} Kinderbasar Neukirchen
          </p>
          <nav className="flex gap-6">
            <Link 
              href="/impressum" 
              className="hover:text-gray-900 hover:underline transition-colors"
            >
              Impressum
            </Link>
            <Link 
              href="/datenschutz" 
              className="hover:text-gray-900 hover:underline transition-colors"
            >
              Datenschutz
            </Link>
            <Link 
              href="/agb" 
              className="hover:text-gray-900 hover:underline transition-colors"
            >
              AGB
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
