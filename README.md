# 🌊 DanubeGuard OS / AquaTrace

Citizen science + Copernicus satellite data + EU water-quality APIs for protecting the Danube.

Built for hackathon. Frontend: Next.js 14 + Tailwind + Leaflet. Backend: Flask + Supabase + Sentinel Hub.

---

## 🚀 Quick start

### Just the frontend (works without backend, uses static fallbacks)
```bash
npm install
npm run dev
# → http://localhost:3000
```

### Full stack (live ETA + Sentinel + Supabase)
```bash
# Terminal 1 — Backend
cd backend
python -m venv venv
venv\Scripts\activate           # Windows
# source venv/bin/activate      # macOS/Linux
pip install -r requirements.txt
python app.py                   # → http://localhost:5000

# Terminal 2 — Frontend
npm install
npm run dev                     # → http://localhost:3000
```

### Required env vars (`.env.local` in project root)
```bash
# Used by Next.js API routes that proxy to Flask
FLASK_API_URL=http://localhost:5000

# Optional — enables live Sentinel-2 chlorophyll/turbidity (otherwise fallback)
SENTINEL_HUB_CLIENT_ID=your_id
SENTINEL_HUB_CLIENT_SECRET=your_secret

# Optional — enables Supabase for citizen reports + community rooms
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## ✨ What's working end-to-end

### 🗺️ Map (`/map`)
- **5 base map sources** (OpenStreetMap, EEA Water, Copernicus CORINE, Esri Satellite, CARTO Dark)
- **WMS overlays** (real EEA water bodies + Copernicus land cover when available)
- **3 display modes** for pollution markers — Markers / Heatmap / Both
- **16 mock pollution points** along the Danube basin
- **20 real Romanian Danube water stations** (toggle in Layers panel) — fetched live from Flask, falls back to a hardcoded list if backend is down
- **Click any station** → detail sheet with type, operator, capacity, coordinates
- **Satellite Analysis** — draw a rectangle anywhere on the map → real Sentinel-2 NDCI chlorophyll-a + Dogliotti turbidity (or geographic-heuristic fallback if Sentinel unreachable)
- **Pollution ETA** — click a pollution point → picker shows 5 nearest downstream stations → calculates river-following distance via Overpass API + live Open-Meteo discharge → estimated time of arrival

### 🧪 Camera (`/camera`)
4-stage flow: capture → location confirmation → questionnaire → success
- **Geolocation** with map preview + accuracy display
- **Token award** locally (instant UX)
- **Backend persistence** to Supabase via `/api/reports` (fire-and-forget)
- **Status badge** on success screen — "Synced to database" vs "Saved offline"

### 🤖 Chatbot (`/chatbot`)
- Mock LLM with keyword-based responses (water quality, fishing, sulfur, algae, agriculture, premium gating)
- Realistic 200-600ms latency simulation
- **Camera context handoff** — first message attaches `[Recent citizen report: odor=..., color=..., flow=...]`
- Premium badge auto-detects `user_id.startsWith('premium_')`

### 🔐 Auth + Profile + Settings (mock)
- Login/Signup with localStorage persistence
- 8 avatar presets + custom upload
- 6 languages (RO/EN/HU/DE/SR/BG)
- Light/Dark/System theme
- 5-tab settings: Account, Preferences, Notifications, Privacy, Plan

### 📱 PWA
- Installable manifest + service worker
- Custom SVG icons
- Mobile bottom nav + desktop sidebar

---

## 🔌 API surface

### Next.js routes (in `app/api/`)
| Route | What it does |
|-------|--------------|
| `POST /api/chat` | Mock chatbot response |
| `POST /api/analyze` | Rectangle bbox → real Sentinel via `/api/map/analyze` → SVG heatmap overlay |
| `POST /api/eta` | Proxy to Flask `/api/predict-eta` (Overpass + Open-Meteo + velocity) |
| `POST /api/map/analyze` | Real Sentinel-2 NDCI/turbidity (via Sentinel Hub Statistics API) |
| `GET /api/water-stations` | Proxy to Flask, lists 20 Danube stations |
| `GET /api/water-stations/nearest` | Proxy to Flask, RPC for k-nearest |
| `POST /api/reports` | Proxy to Flask, persists citizen reports |

### Flask backend (in `backend/`)
13 routes total. Key ones:
- `POST /api/predict-eta` — by Matei. River-following distance + live discharge.
- `POST /api/map/analyze` — by Matei. Sentinel-2 NDCI (Mishra & Mishra 2012) + Dogliotti 2015 turbidity, with seasonal fallback (±20%).
- `GET /api/water-stations[/nearest]` — by Dev B. PostGIS-backed station registry.
- `POST /api/reports` — saves to `reports` table + awards tokens.
- `POST /api/data/ingest` — pulls from EEA Waterbase + EMODnet + Copernicus.

### Supabase migrations (in `database/`)
- **schema.sql** — base (profiles, sensors, anomalies, reports)
- **001_dev_a_data_platform.sql** — RLS, moderation, location_rooms, room_messages, report_classifications
- **002_water_stations_sensor_data.sql** — water_stations, sensor_data, RPCs
- **seeds/001** — 4 default chat rooms
- **seeds/002** — 20 real Romanian Danube stations

Run order in Supabase SQL Editor: `schema → 001 → 002 → seeds/001 → seeds/002`.

---

## 🎯 Demo flow for jury

1. **Hero open** — `/` shows hero, partners, plans
2. **Map** — toggle `Water Stations` layer → 20 stations appear
3. **Click a station** (e.g. Călărași) → detail popup
4. **Pollution ETA** → "Track plume" → click somewhere upstream → picker shows 5 nearest stations → pick one → live calc with route line + transit hours + ETA timestamp
5. **Satellite Analysis** → "Draw zone to analyze" → drag a rectangle on Iron Gates → ~2 sec → SVG heatmap overlay + Chl-a/Turbidity metrics + source label
6. **Camera** → take photo → confirm GPS → fill form (try `Rotten Eggs / Sulfur`) → submit → "Synced to database" badge
7. **Chatbot** → opens with context-aware greeting about sulfur smell

---

## 🐛 Hackathon notes

- **Auth is mock** (localStorage) — swap `lib/authStore.tsx` for NextAuth/Clerk post-event
- **Stations fall back to hardcoded list** if Flask is offline — UI never breaks
- **Sentinel falls back to seasonal mock** if Hub keys missing or API rate-limited
- **ETA falls back to geodesic** if Overpass times out (yellow dashed line + warning)
- **Chatbot is keyword-based mock** — to use a real LLM, replace `mockReply()` in `app/api/chat/route.ts`
- **PWA service worker** is dev-disabled to avoid HMR conflicts. Test with `npm run build && npm start`.

---

## 👥 Team

- **ovidiuking** — frontend, UX, design system
- **mateidragomir74** — Sentinel-2 pipeline, ETA algorithm
- **Chris** — API migration to Next.js routes
- **Dev A** — Supabase schema, RLS, community rooms, moderation
- **Dev B** — water stations, sensor data, EEA/EMODnet integration

Made for the Danube 💚
