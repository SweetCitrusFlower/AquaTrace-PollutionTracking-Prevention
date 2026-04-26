// lib/authStore.ts
// Mock auth — uses localStorage. Swap with NextAuth or Clerk post-hackathon.
// Keep the public API stable: useAuth(), login(), logout(), updateProfile().

'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Badge = {
  id: string;
  emoji: string;
  label: string;
  earnedAt?: string;
};

export type User = {
  id: string;
  email: string;
  username: string;
  bio: string;
  region: string;          // județ / oraș
  avatarPreset: number;    // 0..7 — index into AVATAR_PRESETS
  avatarDataUrl?: string;  // optional uploaded photo (base64)
  joinedAt: string;
  // Stats
  reportsCount: number;
  tokens: number;
  badges: Badge[];
  // Preferences
  prefs: {
    language: 'ro' | 'en' | 'hu' | 'de' | 'sr' | 'bg';
    theme: 'light' | 'dark' | 'system';
    units: 'metric' | 'imperial';
    profilePublic: boolean;
    notifications: {
      pollutionAlerts: boolean;
      ngoUpdates: boolean;
      achievements: boolean;
      weeklyDigest: boolean;
      pushEnabled: boolean;
    };
  };
};

export const AVATAR_PRESETS = [
  { bg: '#84C5B1', emoji: '🌊' },
  { bg: '#ACCFA3', emoji: '🌱' },
  { bg: '#744577', emoji: '🐟' },
  { bg: '#F0E9B6', emoji: '🦆' },
  { bg: '#9468a0', emoji: '🌿' },
  { bg: '#5fa691', emoji: '💧' },
  { bg: '#88b07e', emoji: '🪷' },
  { bg: '#d8cf86', emoji: '🦢' },
];

export const RO_REGIONS = [
  'București', 'Tulcea', 'Galați', 'Brăila', 'Constanța', 'Călărași',
  'Giurgiu', 'Teleorman', 'Olt', 'Dolj', 'Mehedinți', 'Caraș-Severin',
  'Cluj', 'Timiș', 'Iași', 'Brașov', 'Sibiu', 'Other',
];

const STORAGE_KEY = 'danubeguard_user';

function defaultUser(email: string, username: string): User {
  return {
    id: `u_${Date.now()}`,
    email,
    username,
    bio: '',
    region: 'București',
    avatarPreset: 0,
    joinedAt: new Date().toISOString(),
    reportsCount: 1, // Demo: pretend they already filed one via camera flow
    tokens: 50,
    badges: [
      { id: 'first-report', emoji: '🌱', label: 'First Report', earnedAt: new Date().toISOString() },
    ],
    prefs: {
      language: 'ro',
      theme: 'light',
      units: 'metric',
      profilePublic: true,
      notifications: {
        pollutionAlerts: true,
        ngoUpdates: true,
        achievements: true,
        weeklyDigest: false,
        pushEnabled: false,
      },
    },
  };
}

// --- React Context ---
type AuthState = {
  user: User | null;
  loading: boolean;
  login:  (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, username: string) => Promise<void>;
  logout: () => void;
  updateUser: (patch: Partial<User>) => void;
  updatePrefs: (patch: Partial<User['prefs']>) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    setLoading(false);
  }, []);

  // Persist on every change
  useEffect(() => {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }, [user]);

  const login = async (email: string, _password: string) => {
    // Mock: any email/password works. Username from email local-part.
    await new Promise(r => setTimeout(r, 400)); // fake network delay
    const username = email.split('@')[0] || 'user';
    setUser(defaultUser(email, username));
  };

  const signup = async (email: string, _password: string, username: string) => {
    await new Promise(r => setTimeout(r, 400));
    setUser(defaultUser(email, username));
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  const updateUser = (patch: Partial<User>) => {
    setUser(u => (u ? { ...u, ...patch } : u));
  };

  const updatePrefs = (patch: Partial<User['prefs']>) => {
    setUser(u => (u ? { ...u, prefs: { ...u.prefs, ...patch } } : u));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, updateUser, updatePrefs }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
