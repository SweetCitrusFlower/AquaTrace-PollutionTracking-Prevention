'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Camera, Edit3, Check, X, MapPin, Calendar, Award,
  TrendingUp, Lock, Globe, LogIn,
} from 'lucide-react';
import Link from 'next/link';
import { useAuth, AVATAR_PRESETS, RO_REGIONS } from '@/lib/authStore';

export default function ProfilePage() {
  const { user, loading, updateUser } = useAuth();
  const router = useRouter();

  // Local edit state — not persisted until "Save"
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<typeof user>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Loading skeleton
  if (loading) {
    return (
      <div className="px-4 py-6 max-w-3xl mx-auto">
        <div className="h-40 bg-grass/40 rounded-3xl animate-pulse" />
      </div>
    );
  }

  // Not logged in — show CTA
  if (!user) {
    return (
      <div className="px-4 py-12 max-w-md mx-auto text-center">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-grass/50 flex items-center justify-center mb-4">
          <LogIn className="w-10 h-10 text-dusk-dark" />
        </div>
        <h1 className="font-display text-2xl font-bold text-dusk-dark mb-2">Sign in to view your profile</h1>
        <p className="text-dusk/70 mb-6 text-sm">Track your reports, tokens, and badges.</p>
        <Link href="/login" className="btn-primary inline-block">Login</Link>
        <p className="text-sm text-dusk/70 mt-4">
          New here? <Link href="/signup" className="text-water-dark font-semibold hover:underline">Create account</Link>
        </p>
      </div>
    );
  }

  // Start editing — clone current user into draft
  const startEdit = () => {
    setDraft({ ...user });
    setEditing(true);
  };
  const cancelEdit = () => {
    setDraft(null);
    setEditing(false);
  };
  const save = () => {
    if (draft) updateUser(draft);
    setEditing(false);
  };

  // Handle avatar upload
  const onAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !draft) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setDraft({ ...draft, avatarDataUrl: ev.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  const display = editing && draft ? draft : user;
  const preset  = AVATAR_PRESETS[display.avatarPreset] ?? AVATAR_PRESETS[0];

  return (
    <div className="px-4 md:px-10 py-6 max-w-3xl mx-auto space-y-6">
      {/* === HERO CARD === */}
      <section className="bg-gradient-to-br from-water/40 via-grass/30 to-sand-light rounded-4xl p-6 md:p-8 shadow-soft relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-dusk/10 blur-3xl" />

        <div className="relative flex flex-col md:flex-row md:items-center gap-5">
          {/* Avatar */}
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-4xl shadow-soft overflow-hidden border-4 border-sand-light"
              style={{ background: preset.bg }}>
              {display.avatarDataUrl
                ? // eslint-disable-next-line @next/next/no-img-element
                  <img src={display.avatarDataUrl} alt="" className="w-full h-full object-cover" />
                : <span>{preset.emoji}</span>}
            </div>
            {editing && (
              <>
                <button onClick={() => fileRef.current?.click()} aria-label="Upload photo"
                  className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-dusk text-sand-light flex items-center justify-center shadow-fab hover:bg-dusk-dark transition">
                  <Camera className="w-4 h-4" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" onChange={onAvatarUpload} className="hidden" />
              </>
            )}
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0">
            {editing && draft ? (
              <input value={draft.username} onChange={e => setDraft({ ...draft, username: e.target.value })}
                className="font-display text-2xl font-bold text-dusk-dark bg-white/70 rounded-xl px-3 py-1 w-full max-w-xs outline-none border border-grass/40 focus:border-water-dark" />
            ) : (
              <h1 className="font-display text-2xl md:text-3xl font-bold text-dusk-dark truncate">{user.username}</h1>
            )}
            <p className="text-sm text-dusk/70 truncate">{user.email}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-dusk-dark">
              <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {display.region}</span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Joined {new Date(user.joinedAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Action button */}
          <div>
            {editing ? (
              <div className="flex gap-2">
                <button onClick={save} className="bg-water-dark text-white px-4 py-2 rounded-xl font-bold inline-flex items-center gap-1 shadow-soft hover:bg-water transition">
                  <Check className="w-4 h-4" /> Save
                </button>
                <button onClick={cancelEdit} className="bg-white text-dusk-dark px-4 py-2 rounded-xl font-bold inline-flex items-center gap-1 hover:bg-grass/20 transition">
                  <X className="w-4 h-4" /> Cancel
                </button>
              </div>
            ) : (
              <button onClick={startEdit} className="btn-ghost inline-flex items-center gap-2">
                <Edit3 className="w-4 h-4" /> Edit profile
              </button>
            )}
          </div>
        </div>
      </section>

      {/* === STATS === */}
      <section className="grid grid-cols-3 gap-3">
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Reports" value={user.reportsCount} accent="water" />
        <StatCard icon={<Award className="w-4 h-4" />}      label="Tokens"  value={user.tokens}        accent="dusk"  />
        <StatCard icon={<Award className="w-4 h-4" />}      label="Badges"  value={user.badges.length} accent="grass" />
      </section>

      {/* === ABOUT (bio) === */}
      <section className="card-eco">
        <h2 className="font-display font-bold text-dusk-dark mb-2">About</h2>
        {editing && draft ? (
          <textarea
            value={draft.bio}
            onChange={e => setDraft({ ...draft, bio: e.target.value })}
            placeholder="Tell others why you care about the Danube…"
            rows={3}
            className="w-full bg-white rounded-xl px-3 py-2 text-sm outline-none border border-grass/40 focus:border-water-dark"
          />
        ) : (
          <p className="text-sm text-dusk/80 italic">
            {user.bio || 'No bio yet — tap "Edit profile" to add one.'}
          </p>
        )}
      </section>

      {/* === CUSTOMIZATION (only when editing) === */}
      {editing && draft && (
        <>
          <section className="card-eco">
            <h2 className="font-display font-bold text-dusk-dark mb-3">Pick an avatar</h2>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {AVATAR_PRESETS.map((p, i) => {
                const active = draft.avatarPreset === i && !draft.avatarDataUrl;
                return (
                  <button key={i}
                    onClick={() => setDraft({ ...draft, avatarPreset: i, avatarDataUrl: undefined })}
                    className={`aspect-square rounded-2xl flex items-center justify-center text-2xl transition
                      ${active ? 'ring-4 ring-dusk scale-105' : 'hover:scale-105'}`}
                    style={{ background: p.bg }}>
                    {p.emoji}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card-eco">
            <h2 className="font-display font-bold text-dusk-dark mb-3">Region</h2>
            <select value={draft.region} onChange={e => setDraft({ ...draft, region: e.target.value })}
              className="w-full bg-white rounded-xl px-3 py-3 text-sm outline-none border border-grass/40 focus:border-water-dark">
              {RO_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </section>

          <section className="card-eco">
            <h2 className="font-display font-bold text-dusk-dark mb-3">Profile visibility</h2>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setDraft({ ...draft, prefs: { ...draft.prefs, profilePublic: true } })}
                className={`p-3 rounded-xl border-2 text-sm font-semibold inline-flex items-center justify-center gap-2 transition
                  ${draft.prefs.profilePublic ? 'border-dusk bg-dusk text-sand-light' : 'border-grass/40 bg-white text-dusk-dark'}`}>
                <Globe className="w-4 h-4" /> Public
              </button>
              <button onClick={() => setDraft({ ...draft, prefs: { ...draft.prefs, profilePublic: false } })}
                className={`p-3 rounded-xl border-2 text-sm font-semibold inline-flex items-center justify-center gap-2 transition
                  ${!draft.prefs.profilePublic ? 'border-dusk bg-dusk text-sand-light' : 'border-grass/40 bg-white text-dusk-dark'}`}>
                <Lock className="w-4 h-4" /> Private
              </button>
            </div>
          </section>
        </>
      )}

      {/* === BADGES === */}
      <section className="card-eco">
        <h2 className="font-display font-bold text-dusk-dark mb-3">Badges</h2>
        {user.badges.length === 0 ? (
          <p className="text-sm text-dusk/70">No badges yet — keep reporting to earn some!</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {user.badges.map(b => (
              <div key={b.id} className="bg-white/70 rounded-2xl p-3 text-center">
                <div className="text-3xl mb-1">{b.emoji}</div>
                <p className="text-xs font-bold text-dusk-dark">{b.label}</p>
              </div>
            ))}
            {/* Locked teaser badges */}
            <LockedBadge emoji="🔍" label="Pollution Hunter" req="10 reports" />
            <LockedBadge emoji="🐟" label="Delta Defender" req="Tulcea report" />
            <LockedBadge emoji="⚡" label="Fast Responder" req="Within 1h" />
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, accent }:
  { icon: React.ReactNode; label: string; value: number; accent: 'water' | 'dusk' | 'grass' }) {
  const accentMap = {
    water: 'bg-water/30 text-water-dark',
    dusk:  'bg-dusk/20 text-dusk',
    grass: 'bg-grass/50 text-dusk-dark',
  };
  return (
    <div className="bg-white/70 rounded-2xl p-4 text-center shadow-soft">
      <div className={`w-8 h-8 mx-auto rounded-xl flex items-center justify-center mb-1 ${accentMap[accent]}`}>
        {icon}
      </div>
      <p className="font-display text-2xl font-bold text-dusk-dark">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-dusk/60 font-bold">{label}</p>
    </div>
  );
}

function LockedBadge({ emoji, label, req }: { emoji: string; label: string; req: string }) {
  return (
    <div className="bg-white/40 rounded-2xl p-3 text-center opacity-50 border border-dashed border-dusk/30">
      <div className="text-3xl mb-1 grayscale">{emoji}</div>
      <p className="text-xs font-bold text-dusk-dark">{label}</p>
      <p className="text-[10px] text-dusk/60">{req}</p>
    </div>
  );
}
