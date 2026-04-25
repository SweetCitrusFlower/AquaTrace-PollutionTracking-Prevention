# 🌊 DanubeGuard OS

Frontend hackathon — Next.js 14 + Tailwind + Leaflet pentru protecția Dunării prin date Copernicus & citizen science.

## 🚀 Pornire rapidă

```bash
npm install
npm run dev
# → http://localhost:3000
```

## 🤖 Chatbot API (image + DB)

Chatbot-ul din `/chatbot` foloseste acum endpoint-ul server `POST /api/chatbot`.

- Analizeaza intrebarea utilizatorului + poza incarcata (daca exista).
- Foloseste contextul ultimului raport din camera flow.
- Incearca sa citeasca date recente din Supabase, iar daca nu exista configurare revine pe mock data local.

Variabile recomandate in `.env`:

```bash
OPENAI_API_KEY=...
LLM_MODEL=gpt-4o-mini

# Optional, pentru lookup premium + semnale din DB
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_USERS_TABLE=users
SUPABASE_SIGNALS_TABLE=pollution_points
```

Fara `OPENAI_API_KEY`, endpoint-ul raspunde cu un fallback `[MOCK]` util pentru demo.

## ✨ Ce e nou (v0.2 — Auth + Profile + Settings)

- **Login + Signup** (`/login`, `/signup`) — auth mock cu localStorage. Orice email/parolă merge.
- **Profile customizabil** (`/profile`) — avatar (8 presets sau upload propriu), username, bio, regiune, badges, stats live.
- **Settings full** (`/settings`) — 5 secțiuni: Account · Preferences · Notifications · Privacy · Plan.
- **Header dinamic** — buton Login când ești delogat, dropdown cu avatar + meniu (Profile/Settings/Logout) când ești logat.
- **Camera → Profile loop** — când un user logat trimite un raport, primește real `+50 tokens` și `+1 report` în statistici.

## 🧪 Demo flow recomandat

1. Click pe butonul mov **Login** din colțul dreapta-sus
2. Introdu orice email/parolă (e.g. `test@danube.eu` / `123456`)
3. Ești redirectat la `/profile` — vezi avatar default, stats, badges
4. Click **Edit profile** → schimbă avatar, adaugă bio, alege regiune → Save
5. Mergi la **Camera** (FAB-ul mov din mijloc-jos) → submit raport
6. Întoarce-te la **Profile** — tokens & reports updated
7. **Settings** → testează toggle-urile, exportă datele (Privacy → Download my data)
8. **Logout** din dropdown-ul avatar

## 📁 Structură

```
app/
├── layout.tsx          # Wraps everything in AuthProvider
├── page.tsx            # Home
├── login/page.tsx      # 🆕 Email/password + social mock buttons
├── signup/page.tsx     # 🆕 Account creation
├── profile/page.tsx    # 🆕 Customizable profile
├── settings/page.tsx   # 🆕 5-tab settings (account/prefs/notif/privacy/plan)
├── map/page.tsx
├── camera/page.tsx     # Now awards tokens to logged-in user
└── chatbot/page.tsx
components/
├── Header.tsx          # Uses UserMenu
├── UserMenu.tsx        # 🆕 Login button OR avatar dropdown
├── BottomNav.tsx
├── MapView.tsx
├── NgoMiniMap.tsx
└── PlanToggle.tsx
lib/
├── authStore.ts        # 🆕 React Context auth + localStorage persistence
└── mockData.ts
```

## 🎨 Paleta

| Token   | Hex       | Folosire                                  |
|---------|-----------|-------------------------------------------|
| `dusk`  | `#744577` | Premium, butoane primare, header chatbot  |
| `sand`  | `#F0E9B6` | Background app                            |
| `grass` | `#ACCFA3` | Carduri, secțiuni NGO                     |
| `water` | `#84C5B1` | Nav activ, iconițe apă, alerte            |

## 🔌 Pluggable auth

`lib/authStore.ts` are un API stabil:
```ts
const { user, login, signup, logout, updateUser, updatePrefs } = useAuth();
```

Post-hackathon, swap `login()`/`signup()` să apeleze NextAuth, Clerk sau API-ul propriu. Restul UI-ului nu se atinge.

## 🐛 Note hackathon

- Auth e **mock** — orice credențiale merg, datele se salvează în `localStorage`. La hard refresh contul rămâne; la `Logout` sau `Delete account` se șterge.
- `chatbotContext.lastReport` e singleton de modul (resetat la refresh). Pentru persistență swap pe Zustand cu `persist`.
- Theme switcher în Settings doar setează preferința — implementarea dark mode reală vine cu varianta alt (corporate/glassmorphism).

Made for the Danube 💚
