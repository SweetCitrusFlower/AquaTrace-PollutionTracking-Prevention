# DanubeGuard OS - System Architecture & Data Flow

## Microservices Architecture (Mermaid)

```mermaid
flowchart LR
    subgraph Clients[Citizen & Stakeholder Clients]
      WEB[Next.js Web App\nFarmers, Fishermen, Citizens]
      MOBILE[React Native App\nQuest Capture + GPS + Camera]
    end

    subgraph API[Application Layer]
      FLASK[Flask API Middleware\nAuth Context + Validation + Business Rules]
      WORKER[Ingestion/Scoring Worker\nRunoff Correlation + Alert Logic]
    end

    subgraph ExternalData[External Data Sources]
      COPAPI[Copernicus APIs\nSentinel-1/2/3 Products]
      COPHOOK[Copernicus Event/Webhook\nAnomaly & Runoff Triggers]
      NGO[NGO Sensor APIs\nNitrates/Nitrites/Phosphates/pH]
    end

    subgraph Supabase[Managed Supabase Cloud]
      AUTH[Supabase Auth]
      PG[(PostgreSQL + PostGIS)]
      STORAGE[Supabase Storage\nCitizen Images]
      RLS[RLS Policies]
    end

    WEB -->|JWT + REST| FLASK
    MOBILE -->|JWT + REST| FLASK

    FLASK -->|Validate token context| AUTH
    FLASK -->|Insert/Query spatial + tabular data| PG
    FLASK -->|Signed URL / image metadata| STORAGE

    NGO -->|Scheduled pull| WORKER
    COPAPI -->|Scheduled pull| WORKER
    COPHOOK -->|POST webhook| FLASK

    WORKER -->|Upsert anomalies + sensor snapshots| PG
    WORKER -->|Generate runoff risk markers| PG

    PG -->|RLS-enforced views| FLASK
    RLS --> PG

    FLASK -->|Map markers + heatmap payload| WEB
    FLASK -->|Quests + rewards + alerts| MOBILE
```

## Primary Data Flow

1. Mobile users submit anomaly reports (photo metadata, EXIF timestamp, coordinates) to Flask.
2. Flask validates payloads, calls Supabase RPC helpers, stores report records in PostGIS, and awards tokens.
3. Copernicus webhook and scheduled pulls feed anomaly/runoff predictions into Flask ingestion endpoints.
4. NGO sensor feeds are normalized by worker jobs and stored as geolocated measurements.
5. Web frontend requests map payloads from Flask, which aggregates reports, anomalies, and sensors into one response.
6. Supabase RLS protects user-owned data while keeping approved environmental map layers publicly readable.
