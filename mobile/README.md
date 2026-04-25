# DanubeGuard Mobile (Expo)

Minimal React Native scaffold for citizen quest capture:
- get GPS coordinates
- submit citizen report metadata to Flask API

## Run

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Start Expo:

```bash
npm run start
```

Set EXPO_PUBLIC_API_BASE_URL to your backend URL (e.g. http://localhost:5000).