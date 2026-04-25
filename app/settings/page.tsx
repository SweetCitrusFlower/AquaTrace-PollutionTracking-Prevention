'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  User as UserIcon, Bell, Shield, Globe, Crown, KeyRound, Trash2,
  Download, Mail, Sun, Moon, Monitor, ChevronRight, Check, LogOut, LogIn,
} from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';
import { useAuth } from '@/lib/authStore';
import PlanToggle from '@/components/PlanToggle';

type Section = 'account' | 'preferences' | 'notifications' | 'privacy' | 'plan';

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'account',       label: 'Account',       icon: UserIcon },
  { id: 'preferences',   label: 'Preferences',   icon: Globe },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'privacy',       label: 'Privacy & Data',icon: Shield },
  { id: 'plan',          label: 'Plan & Billing',icon: Crown },
];

export default function SettingsPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [section, setSection] = useState<Section>('account');

  if (loading) {
    return <div className="px-4 py-6"><div className="h-40 bg-grass/40 rounded-3xl animate-pulse" /></div>;
  }

  // Not logged in — show CTA but ALSO allow viewing Plan section (public-friendly)
  if (!user) {
    return (
      <div className="px-4 py-12 max-w-md mx-auto text-center">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-grass/50 flex items-center justify-center mb-4">
          <LogIn className="w-10 h-10 text-dusk-dark" />
        </div>
        <h1 className="font-display text-2xl font-bold text-dusk-dark mb-2">Sign in to manage settings</h1>
        <Link href="/login" className="btn-primary inline-block">Login</Link>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-10 py-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-dusk-dark">Settings</h1>
        <p className="text-dusk/70 text-sm">Manage your account, preferences, and subscription.</p>
      </div>

      <div className="grid md:grid-cols-[220px,1fr] gap-6">
        {/* === SIDEBAR (mobile: horizontal scroll, desktop: vertical) === */}
        <nav className="md:sticky md:top-24 md:self-start">
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-2 md:pb-0">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setSection(id)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold whitespace-nowrap transition flex-shrink-0',
                  section === id
                    ? 'bg-dusk text-sand-light shadow-soft'
                    : 'bg-white/60 text-dusk-dark hover:bg-grass/30 md:bg-transparent'
                )}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
            <button onClick={() => { logout(); router.push('/'); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold text-red-700 hover:bg-red-50 transition mt-2 md:mt-4">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </nav>

        {/* === CONTENT === */}
        <div className="space-y-4">
          {section === 'account'       && <AccountSection />}
          {section === 'preferences'   && <PreferencesSection />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'privacy'       && <PrivacySection />}
          {section === 'plan'          && <PlanSection />}
        </div>
      </div>
    </div>
  );
}

/* ========== ACCOUNT ========== */
function AccountSection() {
  const { user, updateUser } = useAuth();
  if (!user) return null;
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState(user.email);
  const [pwOpen, setPwOpen] = useState(false);

  return (
    <>
      <Card title="Email">
        {editingEmail ? (
          <div className="flex gap-2">
            <input type="email" value={emailDraft} onChange={e => setEmailDraft(e.target.value)}
              className="flex-1 bg-white rounded-xl px-3 py-2 text-sm outline-none border border-grass/40 focus:border-water-dark" />
            <button onClick={() => { updateUser({ email: emailDraft }); setEditingEmail(false); }}
              className="bg-water-dark text-white px-3 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1">
              <Check className="w-4 h-4" /> Save
            </button>
          </div>
        ) : (
          <Row icon={<Mail className="w-4 h-4" />} label={user.email} action="Change" onClick={() => setEditingEmail(true)} />
        )}
      </Card>

      <Card title="Password">
        {pwOpen ? (
          <div className="space-y-2">
            <input type="password" placeholder="Current password" className="w-full bg-white rounded-xl px-3 py-2 text-sm outline-none border border-grass/40" />
            <input type="password" placeholder="New password" className="w-full bg-white rounded-xl px-3 py-2 text-sm outline-none border border-grass/40" />
            <input type="password" placeholder="Confirm new password" className="w-full bg-white rounded-xl px-3 py-2 text-sm outline-none border border-grass/40" />
            <div className="flex gap-2">
              <button onClick={() => { alert('Password updated (mock)'); setPwOpen(false); }}
                className="bg-dusk text-sand-light px-4 py-2 rounded-xl text-sm font-bold">Update</button>
              <button onClick={() => setPwOpen(false)} className="bg-white px-4 py-2 rounded-xl text-sm font-bold">Cancel</button>
            </div>
          </div>
        ) : (
          <Row icon={<KeyRound className="w-4 h-4" />} label="••••••••••" action="Change" onClick={() => setPwOpen(true)} />
        )}
      </Card>

      <Card title="Username">
        <Row icon={<UserIcon className="w-4 h-4" />} label={user.username} action="Edit profile" onClick={() => location.href = '/profile'} />
      </Card>
    </>
  );
}

/* ========== PREFERENCES ========== */
function PreferencesSection() {
  const { user, updatePrefs } = useAuth();
  if (!user) return null;
  const p = user.prefs;

  return (
    <>
      <Card title="Theme" subtitle="Choose how DanubeGuard looks.">
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: 'light' as const,  label: 'Light',  icon: <Sun     className="w-4 h-4" /> },
            { v: 'dark' as const,   label: 'Dark',   icon: <Moon    className="w-4 h-4" /> },
            { v: 'system' as const, label: 'System', icon: <Monitor className="w-4 h-4" /> },
          ].map(({ v, label, icon }) => (
            <button key={v} onClick={() => updatePrefs({ theme: v })}
              className={clsx(
                'p-3 rounded-xl border-2 text-sm font-semibold inline-flex items-center justify-center gap-2 transition',
                p.theme === v ? 'border-dusk bg-dusk text-sand-light' : 'border-grass/40 bg-white text-dusk-dark'
              )}>
              {icon} {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-dusk/60 mt-2">🧪 Theme switching wired up — full dark mode is coming in the alt build.</p>
      </Card>

      <Card title="Language">
        <select value={p.language} onChange={e => updatePrefs({ language: e.target.value as typeof p.language })}
          className="w-full bg-white rounded-xl px-3 py-3 text-sm outline-none border border-grass/40 focus:border-water-dark">
          <option value="ro">🇷🇴 Română</option>
          <option value="en">🇬🇧 English</option>
          <option value="hu">🇭🇺 Magyar</option>
          <option value="de">🇩🇪 Deutsch</option>
          <option value="sr">🇷🇸 Srpski</option>
          <option value="bg">🇧🇬 Български</option>
        </select>
      </Card>

      <Card title="Units">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => updatePrefs({ units: 'metric' })}
            className={clsx('p-3 rounded-xl border-2 text-sm font-semibold transition',
              p.units === 'metric' ? 'border-dusk bg-dusk text-sand-light' : 'border-grass/40 bg-white text-dusk-dark')}>
            Metric (°C, km)
          </button>
          <button onClick={() => updatePrefs({ units: 'imperial' })}
            className={clsx('p-3 rounded-xl border-2 text-sm font-semibold transition',
              p.units === 'imperial' ? 'border-dusk bg-dusk text-sand-light' : 'border-grass/40 bg-white text-dusk-dark')}>
            Imperial (°F, mi)
          </button>
        </div>
      </Card>
    </>
  );
}

/* ========== NOTIFICATIONS ========== */
function NotificationsSection() {
  const { user, updatePrefs } = useAuth();
  if (!user) return null;
  const n = user.prefs.notifications;
  const set = (patch: Partial<typeof n>) =>
    updatePrefs({ notifications: { ...n, ...patch } });

  return (
    <>
      <Card title="Push notifications">
        <Toggle label="Enable on this device" on={n.pushEnabled} onChange={v => set({ pushEnabled: v })} />
        <p className="text-[11px] text-dusk/60 mt-2">
          {n.pushEnabled
            ? '🧪 Mock toggle. Real push needs a service worker — coming with the PWA build.'
            : 'Get instant alerts when pollution is detected near you.'}
        </p>
      </Card>

      <Card title="What to notify me about">
        <Toggle label="Pollution alerts in my region"     on={n.pollutionAlerts} onChange={v => set({ pollutionAlerts: v })} />
        <Toggle label="Updates from NGOs I follow"        on={n.ngoUpdates}      onChange={v => set({ ngoUpdates:      v })} />
        <Toggle label="Achievements & badges earned"      on={n.achievements}    onChange={v => set({ achievements:    v })} />
        <Toggle label="Weekly digest email"               on={n.weeklyDigest}    onChange={v => set({ weeklyDigest:    v })} />
      </Card>
    </>
  );
}

/* ========== PRIVACY ========== */
function PrivacySection() {
  const { user, updatePrefs, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;

  const exportData = () => {
    const blob = new Blob([JSON.stringify(user, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'danubeguard-data.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const deleteAccount = () => {
    if (confirm('Delete your account permanently? This cannot be undone.')) {
      logout();
      router.push('/');
    }
  };

  return (
    <>
      <Card title="Profile visibility">
        <Toggle
          label={user.prefs.profilePublic ? 'Profile is public' : 'Profile is private'}
          on={user.prefs.profilePublic}
          onChange={v => updatePrefs({ profilePublic: v })}
        />
        <p className="text-[11px] text-dusk/60 mt-2">
          When public, other guardians can see your reports count, badges, and region.
        </p>
      </Card>

      <Card title="Your data" subtitle="GDPR-compliant data control.">
        <button onClick={exportData}
          className="w-full bg-white rounded-xl px-4 py-3 text-sm font-semibold text-dusk-dark border border-grass/40 hover:bg-grass/20 transition inline-flex items-center justify-between">
          <span className="inline-flex items-center gap-2"><Download className="w-4 h-4" /> Download my data (JSON)</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </Card>

      <Card title="Danger zone">
        <button onClick={deleteAccount}
          className="w-full bg-red-50 rounded-xl px-4 py-3 text-sm font-semibold text-red-700 border border-red-200 hover:bg-red-100 transition inline-flex items-center justify-between">
          <span className="inline-flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete account</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </Card>
    </>
  );
}

/* ========== PLAN ========== */
function PlanSection() {
  return (
    <>
      <div className="bg-gradient-to-br from-dusk to-dusk-dark text-sand-light rounded-3xl p-6 shadow-fab">
        <div className="flex items-center gap-2 mb-2">
          <Crown className="w-5 h-5" />
          <span className="text-xs font-bold tracking-widest uppercase opacity-90">Premium</span>
        </div>
        <h2 className="font-display text-2xl font-bold mb-1">Unlock 7+ day forecasts</h2>
        <p className="text-sm opacity-80 mb-5">For farmers, fish breeders, and water authorities.</p>
        <button className="bg-sand-light text-dusk-dark px-5 py-3 rounded-2xl font-bold shadow-soft active:scale-95 transition">
          Upgrade — €9.99/mo
        </button>
      </div>

      <Card title="Compare plans">
        <PlanToggle />
      </Card>
    </>
  );
}

/* ========== Reusable atoms ========== */
function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card-eco">
      <h3 className="font-display font-bold text-dusk-dark">{title}</h3>
      {subtitle && <p className="text-xs text-dusk/70 mb-3">{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

function Row({ icon, label, action, onClick }:
  { icon: React.ReactNode; label: string; action: string; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between bg-white/70 rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-dusk-dark min-w-0">
        <span className="text-dusk/70 flex-shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <button onClick={onClick} className="text-sm font-semibold text-water-dark hover:underline flex-shrink-0 ml-2">
        {action}
      </button>
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)}
      className="w-full flex items-center justify-between bg-white/70 rounded-xl px-4 py-3 hover:bg-white transition">
      <span className="text-sm text-dusk-dark text-left">{label}</span>
      <div className={clsx(
        'w-11 h-6 rounded-full transition relative flex-shrink-0',
        on ? 'bg-water-dark' : 'bg-grass/60'
      )}>
        <div className={clsx(
          'w-5 h-5 rounded-full bg-white absolute top-0.5 transition shadow-soft',
          on ? 'left-[22px]' : 'left-0.5'
        )} />
      </div>
    </button>
  );
}
