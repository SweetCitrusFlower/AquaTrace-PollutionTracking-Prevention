# DanubeGuard OS

Water Pollution Monitoring & Prevention platform focused on the Danube river basin.

This repository contains the full hackathon scaffolding for a 48-hour build:
- Flask backend middleware
- Supabase PostgreSQL + PostGIS schema with RLS
- Next.js geospatial frontend
- React Native (Expo) mobile quest scaffold
- Docker Compose local stack (backend + frontend only)

## 1) System Architecture

Architecture and data flow are documented in:
- docs/architecture.md

The architecture uses Flask as a middleware/API hub between:
- Web and mobile clients
- Copernicus Sentinel feeds/webhooks
- NGO sensor APIs
- Supabase managed cloud (Auth, PostGIS, Storage)

## 2) Supabase Setup (SQL + PostGIS + RLS)

Run the SQL script below in the Supabase SQL Editor:
- supabase/schema.sql

It creates:
- users (token economy, plan tier)
- reports (citizen reports with geometry(Point, 4326))
- anomalies (satellite/runoff triggers)
- sensors (NGO measurements)

Plus:
- spatial indexes (GIST)
- RLS policies
- RPC helpers consumed by Flask:
	- create_citizen_report(...)
	- get_map_data(...)
	- upsert_copernicus_anomaly(...)

## 3) Backend (Flask)

### Important files
- backend/run.py
- backend/app/config.py
- backend/app/supabase_client.py
- backend/app/routes/reports.py
- backend/app/routes/map_data.py
- backend/app/routes/webhooks.py

### Core API routes

1. POST /api/reports
- Receives citizen report payload (metadata + coordinates)
- Calls create_citizen_report RPC
- Awards tokens to reporter profile

Sample payload:

```json
{
	"user_id": "6fd7bfa5-807f-4fa3-95b2-cf977e938f65",
	"report_type": "algae_bloom",
	"latitude": 45.162,
	"longitude": 28.806,
	"image_url": "https://example.supabase.co/storage/v1/object/public/report-images/abc.jpg",
	"notes": "Green water surface near reed area",
	"exif_taken_at": "2026-04-25T14:31:00Z",
	"gps_accuracy_m": 7.2
}
```

2. GET /api/map/data
- Returns bundle with reports + anomalies + latest sensors
- Supports bbox query string:
	- bbox=minLon,minLat,maxLon,maxLat

Example:

```bash
GET /api/map/data?bbox=8.0,42.0,30.0,50.0
```

3. POST /api/webhooks/copernicus
- Receives anomaly/runoff events from Copernicus pipeline
- Auth via bearer token or X-Copernicus-Token
- Inserts anomaly markers through upsert_copernicus_anomaly RPC

Sample payload:

```json
{
	"events": [
		{
			"source": "sentinel-1",
			"anomaly_type": "runoff_risk",
			"latitude": 45.41,
			"longitude": 21.21,
			"severity": 0.84,
			"confidence_score": 0.73,
			"predicted_at": "2026-04-25T08:00:00Z",
			"valid_until": "2026-04-27T08:00:00Z",
			"payload": {
				"soil_moisture_index": 0.62,
				"rain_forecast_mm": 14.2,
				"risk_label": "high"
			}
		}
	]
}
```

## 4) Frontend (Next.js)

### Important files
- frontend/app/page.tsx
- frontend/components/MapPanel.tsx
- frontend/app/globals.css

Map UI includes:
- citizen report markers
- Copernicus anomaly heat layer + points
- NGO sensor station markers
- live layer counts and refresh cycle

## 5) Mobile (React Native Expo)

### Important files
- mobile/App.tsx
- mobile/src/screens/QuestCaptureScreen.tsx
- mobile/src/services/api.ts

Quick start:

```bash
cd mobile
npm install
cp .env.example .env
npm run start
```

## 6) Local Development with Docker Compose

### Prerequisites
- Docker Desktop
- Supabase project URL + Service Role key

### Steps
1. Copy env template:

```bash
cp .env.example .env
```

2. Fill in values in .env:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- COPERNICUS_WEBHOOK_TOKEN

3. Start stack:

```bash
docker compose up --build
```

4. Access services:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000
- Health: http://localhost:5000/health

## 7) Non-Docker Local Run (optional)

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows PowerShell: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
python run.py
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Mobile:

```bash
cd mobile
npm install
cp .env.example .env
npm run start
```

## 8) Hackathon Roadmap (48h)

1. Integrate Supabase Auth flows (signup/login) in web + mobile.
2. Add image upload to Supabase Storage with signed URLs.
3. Build mobile quest UI (React Native) for mission feed + camera submission.
4. Add Sentinel-1 runoff prediction worker and threshold alerting pipeline.
5. Add premium analytics endpoints (7-30 day predictive windows).