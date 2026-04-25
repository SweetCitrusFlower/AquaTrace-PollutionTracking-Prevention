'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, User as UserIcon, Settings, LogOut, Crown } from 'lucide-react';
import { useAuth, AVATAR_PRESETS } from '@/lib/authStore';
import { useT } from '@/lib/useT';

export default function UserMenu() {
  const { user, loading, logout } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Click-outside to close
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (loading) {
    return <div className="w-10 h-10 rounded-full bg-grass/40 animate-pulse" />;
  }

  // ---- Logged out: show Login button ----
  if (!user) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-2 bg-dusk text-sand-light px-4 py-2 rounded-2xl text-sm font-bold
                   hover:bg-dusk-dark active:scale-95 transition shadow-soft"
      >
        <LogIn className="w-4 h-4" /> {t('common.login')}
      </Link>
    );
  }

  // ---- Logged in: avatar with dropdown ----
  const preset = AVATAR_PRESETS[user.avatarPreset] ?? AVATAR_PRESETS[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="User menu"
        className="w-10 h-10 rounded-full flex items-center justify-center shadow-soft
                   hover:ring-2 hover:ring-water transition overflow-hidden"
        style={{ background: preset.bg }}
      >
        {user.avatarDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarDataUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-lg">{preset.emoji}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-64 bg-sand-light rounded-2xl shadow-2xl border border-grass/40 overflow-hidden z-50 animate-[fadeIn_0.15s_ease-out]">
          {/* Header */}
          <div className="p-4 bg-grass/30 border-b border-grass/40">
            <p className="font-display font-bold text-dusk-dark truncate">{user.username}</p>
            <p className="text-xs text-dusk/70 truncate">{user.email}</p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="bg-dusk text-sand-light px-2 py-0.5 rounded-lg font-semibold inline-flex items-center gap-1">
                <Crown className="w-3 h-3" /> {user.tokens} tokens
              </span>
              <span className="text-dusk/70">{user.reportsCount} reports</span>
            </div>
          </div>

          {/* Items */}
          <button
            onClick={() => { setOpen(false); router.push('/profile'); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-dusk-dark hover:bg-grass/30 transition text-left"
          >
            <UserIcon className="w-4 h-4" /> {t('common.myProfile')}
          </button>
          <button
            onClick={() => { setOpen(false); router.push('/settings'); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-dusk-dark hover:bg-grass/30 transition text-left"
          >
            <Settings className="w-4 h-4" /> {t('settings.title')}
          </button>
          <button
            onClick={() => { setOpen(false); logout(); router.push('/'); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-700 hover:bg-red-50 transition text-left border-t border-grass/40"
          >
            <LogOut className="w-4 h-4" /> {t('common.logout')}
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
