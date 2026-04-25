import Link from 'next/link';
import { Waves } from 'lucide-react';
import UserMenu from './UserMenu';

export default function Header() {
  return (
    <header className="sticky top-0 z-30
                       bg-sand-light/90 dark:bg-[#1e2837]
                       backdrop-blur-md border-b border-grass/25 dark:border-[#374151]">
      <div className="flex items-center justify-between px-4 py-3 md:px-8">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-dusk flex items-center justify-center
                          shadow-soft group-hover:bg-dusk-dark transition-colors">
            <Waves className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <p className="font-display font-bold text-gray-900 dark:text-gray-100 text-sm tracking-tight">
              DanubeGuard
            </p>
            <p className="text-[9px] text-gray-400 tracking-widest uppercase font-medium">
              OS · v0.1
            </p>
          </div>
        </Link>

        <UserMenu />
      </div>
    </header>
  );
}
