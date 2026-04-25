'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/authStore';

/**
 * Reads user prefs from authStore and applies:
 *  - dark/light class on <html> for Tailwind darkMode:'class'
 *  - lang attribute on <html> for screen-readers and browser UI
 * Must be rendered inside <AuthProvider>.
 */
export default function ThemeApplicator() {
  const { user } = useAuth();

  useEffect(() => {
    const html = document.documentElement;

    // --- Theme ---
    const theme = user?.prefs?.theme ?? 'light';
    if (theme === 'dark') {
      html.classList.add('dark');
    } else if (theme === 'light') {
      html.classList.remove('dark');
    } else {
      // System preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.classList.toggle('dark', prefersDark);
    }

    // --- Language ---
    const lang = user?.prefs?.language ?? 'en';
    html.setAttribute('lang', lang);
  }, [user?.prefs?.theme, user?.prefs?.language]);

  return null;
}
