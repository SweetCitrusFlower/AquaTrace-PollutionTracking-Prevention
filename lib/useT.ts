'use client';
// lib/useT.ts
// Tiny hook: reads language from authStore and returns a t() function.

import { useAuth } from '@/lib/authStore';
import { t, type Lang } from '@/lib/i18n';

export function useT() {
  const { user } = useAuth();
  const lang = (user?.prefs?.language ?? 'en') as Lang;
  return (key: string) => t(lang, key);
}
