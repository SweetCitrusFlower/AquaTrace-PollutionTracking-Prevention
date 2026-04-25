import Link from 'next/link';
import { Droplets } from 'lucide-react';
import UserMenu from './UserMenu';

export default function Header() {
  return (
    <header className="sticky top-0 z-30 bg-sand/85 backdrop-blur-md border-b border-grass/40">
      <div className="flex items-center justify-between px-4 py-3 md:px-8">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-2xl bg-water flex items-center justify-center shadow-soft group-active:scale-95 transition">
            <Droplets className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <p className="font-display font-bold text-dusk-dark text-lg">DanubeGuard</p>
            <p className="text-[10px] text-dusk/70 tracking-widest uppercase">OS · v0.1</p>
          </div>
        </Link>

        <UserMenu />
      </div>
    </header>
  );
}
