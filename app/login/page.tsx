'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Loader2, Droplets } from 'lucide-react';
import { useAuth } from '@/lib/authStore';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in both fields.');
      return;
    }
    setBusy(true); setError(null);
    try {
      await login(email, password);
      router.push('/profile');
    } catch (err) {
      setError('Login failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-water flex items-center justify-center shadow-soft mb-4">
            <Droplets className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-3xl font-bold text-dusk-dark">Welcome back</h1>
          <p className="text-dusk/70 text-sm mt-1">Login to continue protecting the Danube.</p>
        </div>

        <form onSubmit={submit} className="card-eco space-y-4">
          <Field label="Email" icon={<Mail className="w-4 h-4" />}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-white rounded-xl px-3 py-3 text-sm outline-none border border-grass/40 focus:border-water-dark" />
          </Field>

          <Field label="Password" icon={<Lock className="w-4 h-4" />}>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white rounded-xl px-3 py-3 text-sm outline-none border border-grass/40 focus:border-water-dark" />
          </Field>

          {error && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}

          <button type="submit" disabled={busy}
            className="w-full bg-dusk text-sand-light py-3 rounded-2xl font-bold shadow-soft
                       hover:bg-dusk-dark active:scale-[0.98] transition flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : 'Sign in'}
          </button>

          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-grass/40" />
            <span className="text-xs text-dusk/60">or continue with</span>
            <div className="flex-1 h-px bg-grass/40" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SocialBtn provider="Google" />
            <SocialBtn provider="GitHub" />
          </div>
        </form>

        <p className="text-center text-sm text-dusk/70 mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-water-dark font-semibold hover:underline">Sign up</Link>
        </p>

        <p className="text-center text-[11px] text-dusk/50 mt-4 px-4">
          🧪 Demo mode: any email/password works — auth is mocked locally.
        </p>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold text-dusk-dark mb-1 flex items-center gap-1.5">
        {icon} {label}
      </label>
      {children}
    </div>
  );
}

function SocialBtn({ provider }: { provider: string }) {
  return (
    <button type="button"
      className="bg-white py-2.5 rounded-xl text-sm font-semibold text-dusk-dark border border-grass/40 hover:bg-grass/20 transition">
      {provider}
    </button>
  );
}
