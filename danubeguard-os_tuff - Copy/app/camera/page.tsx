'use client';

import { useState, useRef, useEffect } from 'react';
import { Camera, RotateCcw, Award, Check, ChevronRight, Crown, MapPin, Navigation, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import {
  ODOR_OPTIONS, COLOR_OPTIONS, FLOW_OPTIONS, ACTIVITY_OPTIONS,
  chatbotContext, type CitizenReport,
} from '@/lib/mockData';
import { useAuth } from '@/lib/authStore';

type Stage = 'capture' | 'location' | 'form' | 'success';

interface LocationData {
  lat: number;
  lng: number;
  accuracy: number;
  address?: string;
}

export default function CameraPage() {
  const { user, updateUser } = useAuth();
  const [stage, setStage] = useState<Stage>('capture');
  const [photo, setPhoto] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [report, setReport] = useState<CitizenReport>({
    odor: null, color: null, flow: null, activity: [],
  });
  const fileRef = useRef<HTMLInputElement>(null);

  // --- Geolocation handler ---
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported');
      return;
    }
    
    setIsLoadingLocation(true);
    setLocationError(null);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const locData: LocationData = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        
        // Try to get address from coordinates (reverse geocoding)
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${locData.lat}&lon=${locData.lng}`
          );
          const data = await response.json();
          if (data.display_name) {
            locData.address = data.display_name.split(',').slice(0, 3).join(',');
          }
        } catch (e) {
          // Ignore geocoding errors
        }
        
        setLocation(locData);
        setIsLoadingLocation(false);
        setStage('location');
      },
      (error) => {
        setLocationError(error.message);
        setIsLoadingLocation(false);
        // Still proceed to location stage with null location
        setLocation(null);
        setStage('location');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // --- Stage handlers ---
  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setPhoto(ev.target?.result as string);
      // After photo, request location automatically
      requestLocation();
    };
    reader.readAsDataURL(file);
  };

  const confirmLocation = () => {
    setLocationConfirmed(true);
    setStage('form');
  };

  const skipLocation = () => {
    setLocationConfirmed(false);
    setStage('form');
  };

  const handleSubmit = () => {
    const finalReport: CitizenReport = {
      ...report,
      photoDataUrl: photo ?? undefined,
      submittedAt: new Date().toISOString(),
    };
    // Mock: write to chatbot context so /chatbot greeting becomes context-aware.
    chatbotContext.lastReport = finalReport;
    // If user is logged in, award them tokens + bump report count for real stats on profile.
    if (user) {
      updateUser({
        tokens: user.tokens + 50,
        reportsCount: user.reportsCount + 1,
      });
    }
    setStage('success');
  };

  const reset = () => {
    setStage('capture'); setPhoto(null);
    setLocation(null);
    setLocationConfirmed(false);
    setLocationError(null);
    setReport({ odor: null, color: null, flow: null, activity: [] });
  };

  // --- Render per stage ---
  return (
    <div className="px-4 md:px-10 py-6 max-w-2xl mx-auto">
      {stage === 'capture' && (
        <CaptureStage onOpen={() => fileRef.current?.click()} fileRef={fileRef} onChange={handlePhoto} />
      )}
      {stage === 'location' && (
        <LocationStage 
          location={location} 
          isLoading={isLoadingLocation} 
          error={locationError}
          onConfirm={confirmLocation}
          onSkip={skipLocation}
          onRetry={requestLocation}
        />
      )}
      {stage === 'form' && photo && (
        <FormStage 
          photo={photo} 
          report={report} 
          setReport={setReport}
          location={location}
          onSubmit={handleSubmit} 
          onRetake={reset} 
        />
      )}
      {stage === 'success' && <SuccessStage onReset={reset} />}
    </div>
  );
}

/* ========== LOCATION CONFIRMATION STAGE ========== */
function LocationStage({
  location,
  isLoading,
  error,
  onConfirm,
  onSkip,
  onRetry,
}: {
  location: LocationData | null;
  isLoading: boolean;
  error: string | null;
  onConfirm: () => void;
  onSkip: () => void;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <div className="text-center py-10">
        <div className="w-32 h-32 mx-auto rounded-full bg-water/30 flex items-center justify-center mb-6">
          <Loader2 className="w-14 h-14 text-water-dark animate-spin" strokeWidth={1.8} />
        </div>
        <h1 className="font-display text-2xl font-bold text-dusk-dark mb-2">Getting your location...</h1>
        <p className="text-dusk/70">Please allow location access to tag your report</p>
      </div>
    );
  }

  return (
    <div className="text-center py-6">
      <div className="w-24 h-24 mx-auto rounded-full bg-water/30 flex items-center justify-center mb-6">
        <MapPin className="w-12 h-12 text-water-dark" strokeWidth={1.8} />
      </div>
      <h1 className="font-display text-2xl font-bold text-dusk-dark mb-2">Confirm Location</h1>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}
      
      {location ? (
        <div className="card-eco mb-6 text-left">
          <div className="flex items-start gap-3">
            <Navigation className="w-5 h-5 text-water-dark mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-dusk-dark mb-1">Your current location</p>
              <p className="text-sm text-dusk/70 mb-2">
                {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              </p>
              {location.address && (
                <p className="text-sm text-dusk/60 bg-sand-light rounded-xl p-2">
                  📍 {location.address}
                </p>
              )}
              <p className="text-xs text-dusk/50 mt-2">
                Accuracy: ±{Math.round(location.accuracy)}m
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-4">
          <p className="text-yellow-700 text-sm">⚠️ Could not get location. You can still submit without location.</p>
        </div>
      )}
      
      <div className="flex flex-col gap-3">
        <button onClick={onConfirm} className="btn-primary flex items-center justify-center gap-2">
          <Check className="w-5 h-5" /> Confirm Location
        </button>
        <div className="flex gap-3">
          <button onClick={onSkip} className="btn-ghost flex-1">
            Skip
          </button>
          <button onClick={onRetry} className="btn-ghost flex-1">
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========== STAGE 1: CAPTURE ========== */
function CaptureStage({
  onOpen, fileRef, onChange,
}: {
  onOpen: () => void;
  fileRef: React.RefObject<HTMLInputElement>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="text-center py-10">
      <div className="w-32 h-32 mx-auto rounded-full bg-water/30 flex items-center justify-center mb-6">
        <Camera className="w-14 h-14 text-water-dark" strokeWidth={1.8} />
      </div>
      <h1 className="font-display text-3xl font-bold text-dusk-dark mb-2">Document the Danube</h1>
      <p className="text-dusk/70 mb-8 max-w-md mx-auto">
        Snap a photo of the water you&apos;re observing. Each verified report earns you tokens
        and contributes to a healthier river.
      </p>

      {/* `capture="environment"` opens the rear camera on mobile devices */}
      <input
        ref={fileRef} type="file" accept="image/*" capture="environment"
        onChange={onChange} className="hidden"
      />
      <button onClick={onOpen} className="btn-primary text-lg px-8 py-4 inline-flex items-center gap-2">
        <Camera className="w-5 h-5" /> Open Camera
      </button>
      <p className="text-xs text-dusk/50 mt-4">+50 tokens · 2-day Premium trial</p>
    </div>
  );
}

/* ========== STAGE 2: FORM ========== */
function FormStage({
  photo, report, setReport, location, onSubmit, onRetake,
}: {
  photo: string;
  report: CitizenReport;
  setReport: React.Dispatch<React.SetStateAction<CitizenReport>>;
  location: LocationData | null;
  onSubmit: () => void;
  onRetake: () => void;
}) {
  const toggleActivity = (val: typeof ACTIVITY_OPTIONS[number]) => {
    setReport(r => ({
      ...r,
      activity: r.activity.includes(val)
        ? r.activity.filter(a => a !== val)
        : [...r.activity, val],
    }));
  };

  // All required fields filled?
  const isValid = report.odor && report.color && report.flow;

  return (
    <div className="space-y-5">
      {/* Photo preview + retake */}
      <div className="relative rounded-3xl overflow-hidden shadow-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="Captured water sample" className="w-full h-64 object-cover" />
        <button onClick={onRetake}
          className="absolute top-3 right-3 bg-sand-light/90 backdrop-blur px-3 py-2 rounded-xl text-sm font-semibold text-dusk-dark inline-flex items-center gap-1">
          <RotateCcw className="w-4 h-4" /> Retake
        </button>
      </div>

      {/* Location display */}
      {location && (
        <div className="bg-water/10 border border-water/30 rounded-2xl p-4 flex items-center gap-3">
          <MapPin className="w-5 h-5 text-water-dark" />
          <div className="flex-1">
            <p className="text-sm font-medium text-dusk-dark">Location tagged</p>
            <p className="text-xs text-dusk/60">
              {location.address 
                ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
                : `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
              }
            </p>
          </div>
        </div>
      )}

      <h2 className="font-display text-xl font-bold text-dusk-dark">Tell us what you observed</h2>

      <Field label="Water Odor" required>
        <RadioGroup options={ODOR_OPTIONS} value={report.odor}
          onChange={v => setReport(r => ({ ...r, odor: v }))} />
      </Field>

      <Field label="Water Color" required>
        <RadioGroup options={COLOR_OPTIONS} value={report.color}
          onChange={v => setReport(r => ({ ...r, color: v }))} />
      </Field>

      <Field label="Water Flow / Level" required>
        <RadioGroup options={FLOW_OPTIONS} value={report.flow}
          onChange={v => setReport(r => ({ ...r, flow: v }))} />
      </Field>

      <Field label="Human Activity Nearby" hint="Select all that apply">
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_OPTIONS.map(opt => {
            const on = report.activity.includes(opt);
            return (
              <button key={opt} onClick={() => toggleActivity(opt)}
                className={clsx(
                  'px-4 py-2 rounded-xl text-sm font-medium transition border',
                  on ? 'bg-water text-white border-water-dark' : 'bg-white/70 text-dusk-dark border-grass/50'
                )}
              >
                {on && <Check className="inline w-3.5 h-3.5 mr-1" />} {opt}
              </button>
            );
          })}
        </div>
      </Field>

      <button
        onClick={onSubmit}
        disabled={!isValid}
        className={clsx(
          'w-full py-4 rounded-2xl font-bold text-lg inline-flex items-center justify-center gap-2 transition',
          isValid
            ? 'bg-dusk text-sand-light shadow-fab active:scale-[0.98]'
            : 'bg-grass/40 text-dusk/50 cursor-not-allowed'
        )}
      >
        Submit Report <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}

/* ========== STAGE 3: SUCCESS ========== */
function SuccessStage({ onReset }: { onReset: () => void }) {
  return (
    <div className="text-center py-10">
      <div className="w-28 h-28 mx-auto rounded-full bg-grass/60 flex items-center justify-center mb-6 relative">
        <Award className="w-14 h-14 text-dusk" strokeWidth={1.8} />
        <div className="absolute -top-2 -right-2 w-10 h-10 bg-dusk rounded-full flex items-center justify-center shadow-fab">
          <Check className="w-5 h-5 text-sand-light" strokeWidth={3} />
        </div>
      </div>

      <h1 className="font-display text-3xl font-bold text-dusk-dark mb-2">Report validated!</h1>
      <p className="text-dusk/70 mb-6">Thank you for protecting the Danube 💚</p>

      <div className="bg-gradient-to-br from-dusk to-dusk-dark text-sand-light rounded-3xl p-6 shadow-fab mb-6 max-w-sm mx-auto">
        <p className="text-sm opacity-80 mb-1">You earned</p>
        <p className="font-display text-5xl font-bold mb-3">50 Tokens</p>
        <div className="flex items-center justify-center gap-2 bg-white/15 rounded-xl py-2 px-3">
          <Crown className="w-4 h-4" />
          <span className="text-sm font-semibold">2-day Premium trial unlocked</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 max-w-sm mx-auto">
        <a href="/chatbot" className="btn-primary">Ask AI about your report</a>
        <button onClick={onReset} className="btn-ghost">Submit another</button>
      </div>
    </div>
  );
}

/* ========== Reusable form primitives ========== */
function Field({ label, hint, required, children }:
  { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="card-eco">
      <div className="flex items-baseline justify-between mb-3">
        <label className="font-display font-bold text-dusk-dark">
          {label} {required && <span className="text-dusk">*</span>}
        </label>
        {hint && <span className="text-xs text-dusk/60">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function RadioGroup<T extends string>({
  options, value, onChange,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)}
          className={clsx(
            'px-4 py-2 rounded-xl text-sm font-medium transition border',
            value === opt
              ? 'bg-dusk text-sand-light border-dusk-dark'
              : 'bg-white/70 text-dusk-dark border-grass/50 hover:bg-white'
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
