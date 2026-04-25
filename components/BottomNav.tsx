'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Map, Camera, Bot, Settings } from 'lucide-react';
import clsx from 'clsx';

type Variant = 'bottom' | 'sidebar';

const NAV_ITEMS = [
  { href: '/',        label: 'Home',    icon: Home },
  { href: '/map',     label: 'Map',     icon: Map },
  { href: '/camera',  label: 'Report',  icon: Camera, central: true },
  { href: '/chatbot', label: 'AI',      icon: Bot },
  { href: '/settings',label: 'Premium', icon: Settings },
];

export default function BottomNav({ variant }: { variant: Variant }) {
  const pathname = usePathname();

  if (variant === 'sidebar') {
    // Desktop sidebar — fixed left, full-height
    return (
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-sand-light border-r border-grass/40 flex-col p-6 z-20">
        <div className="font-display font-bold text-2xl text-dusk-dark mb-10">
          🌊 DanubeGuard
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-2xl transition font-medium',
                  active
                    ? 'bg-water text-white shadow-soft'
                    : 'text-dusk-dark hover:bg-grass/40'
                )}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    );
  }

  // Mobile bottom nav — fixed bottom, with central elevated FAB
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-sand-light/95 backdrop-blur-lg
                 border-t border-grass/50 pb-safe"
    >
      <ul className="flex items-end justify-around px-2 pt-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon, central }) => {
          const active = pathname === href;

          if (central) {
            // Elevated FAB-style camera button — pops above the nav bar
            return (
              <li key={href} className="-mt-8">
                <Link
                  href={href}
                  aria-label={label}
                  className="w-16 h-16 rounded-full bg-dusk flex items-center justify-center shadow-fab
                             active:scale-95 transition border-4 border-sand-light"
                >
                  <Icon className="w-7 h-7 text-sand-light" strokeWidth={2.2} />
                </Link>
              </li>
            );
          }

          return (
            <li key={href}>
              <Link
                href={href}
                className={clsx(
                  'flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition min-w-[60px]',
                  active ? 'text-water-dark' : 'text-dusk/60'
                )}
              >
                <Icon className={clsx('w-5 h-5', active && 'stroke-[2.5]')} />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
