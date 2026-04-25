'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Map, Camera, Bot, Settings, Waves } from 'lucide-react';
import clsx from 'clsx';
import { useT } from '@/lib/useT';

type Variant = 'bottom' | 'sidebar';

export default function BottomNav({ variant }: { variant: Variant }) {
  const pathname = usePathname();
  const t = useT();

  const NAV_ITEMS = [
    { href: '/',        label: t('nav.home'),     icon: Home },
    { href: '/map',     label: t('nav.map'),      icon: Map },
    { href: '/camera',  label: t('nav.report'),   icon: Camera, central: true },
    { href: '/chatbot', label: t('nav.ai'),       icon: Bot },
    { href: '/settings',label: t('nav.settings'), icon: Settings },
  ];

  if (variant === 'sidebar') {
    return (
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 flex-col p-6 z-20
                        bg-sand-light dark:bg-[#1f2937]
                        border-r border-grass/25 dark:border-[#374151]">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-9 h-9 rounded-xl bg-dusk flex items-center justify-center shadow-soft">
            <Waves className="w-5 h-5 text-white" strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <p className="font-display font-bold text-gray-900 dark:text-gray-100 text-base">DanubeGuard</p>
            <p className="text-[9px] text-gray-400 tracking-widest uppercase font-medium">OS · v0.1</p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm font-medium',
                  active
                    ? 'bg-dusk text-white shadow-soft'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-grass/20 dark:hover:bg-[#374151] hover:text-gray-900 dark:hover:text-gray-100'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="mt-auto pt-6 border-t border-grass/20 dark:border-[#374151]">
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">
            Powered by Copernicus
          </p>
        </div>
      </aside>
    );
  }

  // Mobile bottom nav - Premium mobile UI
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[2200] pb-safe
                    bg-white/90 dark:bg-[#1f2937]/95
                    backdrop-blur-xl border-t border-grass/20 dark:border-[#374151]
                    shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <ul className="flex items-end justify-around px-1 pt-2 pb-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, central }) => {
          const active = pathname === href;

          if (central) {
            return (
              <li key={href} className="-mt-6">
                <Link
                  href={href}
                  aria-label={label}
                  className="w-16 h-16 rounded-2xl bg-gradient-to-br from-dusk to-dusk-dark flex items-center justify-center
                             shadow-[0_8px_20px_rgba(45,65,70,0.4)] active:scale-95 transition-all
                             border-4 border-white dark:border-[#1f2937]"
                >
                  <div className="relative">
                    <Icon className="w-7 h-7 text-white" strokeWidth={2.2} />
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-grens rounded-full animate-pulse"></span>
                  </div>
                </Link>
              </li>
            );
          }

          return (
            <li key={href}>
              <Link
                href={href}
                className={clsx(
                  'flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all min-w-[56px]',
                  active
                    ? 'text-dusk dark:text-dusk-light'
                    : 'text-gray-400 dark:text-gray-500 hover:text-dusk/70'
                )}
              >
                <div className={clsx(
                  'p-1.5 rounded-xl transition-all',
                  active && 'bg-dusk/10'
                )}>
                  <Icon className={clsx('w-5 h-5', active && 'stroke-[2.5]')} />
                </div>
                <span className={clsx(
                  'text-[10px] font-semibold tracking-wide transition-all',
                  active ? 'text-dusk dark:text-dusk-light' : 'text-gray-400 dark:text-gray-500'
                )}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
