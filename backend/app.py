import logging
import os
import json
import math
import random
import requests
from io import BytesIO
from datetime import datetime, timedelta, date
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from dotenv import load_dotenv
import numpy as np
from PIL import Image
from services.eta_service import calculate_eta as _compute_eta
from services.data_ingestion import run_full_ingestion

# Încărcăm variabilele de mediu din .env.local al proiectului principal Next.js
load_dotenv(dotenv_path="../.env.local")

app = Flask(__name__)
logger = logging.getLogger(__name__)

# CORS: allow listed origins (comma-separated in ALLOWED_ORIGINS env var).
# Add your Vercel production domain to ALLOWED_ORIGINS in .env.local.
_allowed_origins = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,https://nume-placeholder.vercel.app",
    ).split(",")
    if o.strip()
]
CORS(app, origins=_allowed_origins)

# Initialize Supabase Client
url: str = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
# Pentru backend (orchestrator Flask) folosim ROLE_KEY pentru a trece peste RLS si a scrie/modifica direct din "server"
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("WARNING: Supabase variables are missing!")

supabase: Client = create_client(url, key) if url and key else None


@app.route("/health", methods=["GET"])
def health_check():
    """Ruta simpla de test pentru a verifica starea middleware-ului Flask."""
    return jsonify({"status": "ok", "message": "Flask Middleware is running."}), 200


@app.route("/api/test-db", methods=["GET"])
def test_db_connection():
    """Testeaza efectiv conexiunea cu Supabase."""
    if not supabase:
        return jsonify({"error": "Supabase client uninitialized"}), 500
    try:
        # Încearcă să extragă max 1 rând dintr-un tabel public (reports de ex.)
        response = supabase.table("reports").select("*").limit(1).execute()
        return (
            jsonify(
                {
                    "status": "success",
                    "message": "Connected to Supabase DB successfully!",
                    "data_sample": response.data,
                }
            ),
            200,
        )
    except Exception as e:
        return jsonify({"error": "DB Test failed", "details": str(e)}), 500


@app.route("/api/reports", methods=["POST"])
def create_report():
    """Riceives citizen science photo metadata and saves to DB."""
    data = request.json
    try:
        # Convert lat/lng to PostGIS POINT
        # supabase-py will just insert it as WKT
        point_wkt = f"POINT({data['lng']} {data['lat']})"

        response = (
            supabase.table("reports")
            .insert(
                {
                    "user_id": data["user_id"],
                    "location": point_wkt,
                    "image_url": data.get("image_url"),
                    "smell_score": data.get("smell_score"),
                    "water_flow": data.get("water_flow"),
                }
            )
            .execute()
        )

        # Gamification / Reward Tokens logic - increment tokens for the user
        if data.get("user_id"):
            # Fetch user
            user_res = (
                supabase.table("profiles")
                .select("tokens")
                .eq("id", data["user_id"])
                .execute()
            )
            if user_res.data:
                current_tokens = user_res.data[0]["tokens"] or 0
                supabase.table("profiles").update({"tokens": current_tokens + 10}).eq(
                    "id", data["user_id"]
                ).execute()

        return jsonify({"status": "success", "data": response.data}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/map/markers", methods=["GET"])
def get_map_markers():
    """Fetches GeoJSON-friendly points for Next.js/React Native."""
    try:
        anomalies = (
            supabase.table("anomalies")
            .select("id, anomaly_type, location, severity")
            .eq("resolved", False)
            .execute()
        )
        reports = (
            supabase.table("reports")
            .select("id, location, status")
            .eq("status", "verified")
            .execute()
        )

        return jsonify({"anomalies": anomalies.data, "reports": reports.data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/webhooks/copernicus", methods=["POST"])
def copernicus_webhook():
    """Receives triggers from the ML/Data Pipeline."""
    data = request.json
    try:
        point_wkt = f"POINT({data['lng']} {data['lat']})"
        response = (
            supabase.table("anomalies")
            .insert(
                {
                    "source": data["source"],
                    "anomaly_type": data["anomaly_type"],
                    "severity": data["severity"],
                    "location": point_wkt,
                }
            )
            .execute()
        )

        return jsonify({"status": "anomaly registered", "data": response.data}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# Sentinel Hub configuration
SENTINEL_HUB_CLIENT_ID = os.environ.get("SENTINEL_HUB_CLIENT_ID")
SENTINEL_HUB_CLIENT_SECRET = os.environ.get("SENTINEL_HUB_CLIENT_SECRET")
# New CDSE endpoint
SENTINEL_HUB_BASE_URL = "https://sh.dataspace.copernicus.eu/api/v1"
CDSE_OAUTH_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"

# Evalscript bands gain factor.
# Danube water reflectances are typically 0.01–0.30. Multiplying by 3.5 maps
# this range to 0.035–1.0, using ~96 % of the 8-bit PNG dynamic range before
# clipping. Python reverses this by dividing the 0–255 pixel values by (255 * 3.5).
EVALSCRIPT_GAIN: float = 3.5

# Danube region bounding boxes for satellite analysis
REGION_BBOXES = {
    "iron-gates":   [22.4, 44.5, 22.8, 44.8],
    "tulcea-delta": [28.6, 45.0, 29.0, 45.4],
    "giurgiu":      [25.9, 43.8, 26.3, 44.1],
    "smirdan":      [28.0, 45.4, 28.5, 45.8],
    "corabia":      [24.4, 43.7, 24.8, 44.0],
    "portile-fier": [21.8, 44.4, 22.2, 44.7],
    # Brăila / Insula Mare a Brăilei — major Danube port, industrial + agricultural runoff
    "braila":       [27.7, 44.9, 28.3, 45.6],
    # Călărași — industrial zone + irrigation outflow on the Bulgarian border stretch
    "calarasi":     [27.1, 43.9, 27.7, 44.5],
}


def get_sentinel_hub_token():
    """Get OAuth token from Copernicus Data Space."""
    if not SENTINEL_HUB_CLIENT_ID or not SENTINEL_HUB_CLIENT_SECRET:
        return None

    try:
        resp = requests.post(
            CDSE_OAUTH_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": SENTINEL_HUB_CLIENT_ID,
                "client_secret": SENTINEL_HUB_CLIENT_SECRET,
            },
            timeout=15,
        )
        if resp.status_code == 200:
            return resp.json().get("access_token")
        logger.warning("CDSE OAuth failed: %s — %s", resp.status_code, resp.text[:200])
        return None
    except Exception as exc:
        logger.warning("CDSE OAuth error: %s", exc)
        return None


def analyze_region_satellite(region_id: str):
    """
    Fetch Sentinel-2 data for a region and estimate pollution metrics.
    Uses chlorophyll-a and color indices to detect water quality issues.
    """
    if region_id not in REGION_BBOXES:
        return None

    bbox = REGION_BBOXES[region_id]

    # 10-day window: aligns with Sentinel-2 revisit cycle (~5 days with S2A + S2B combined).
    end_date = datetime.now()
    start_date = end_date - timedelta(days=10)

    # Get token from CDSE
    token = get_sentinel_hub_token()
    if not token:
        return generate_mock_pollution_data(region_id)

    # Use new CDSE endpoint
    sh_api = "https://sh.dataspace.copernicus.eu/process/v1"

    # Evalscript requesting the four bands needed for water quality indices.
    # Output bands (in PNG channel order):
    #   Ch 0 = B03 (Green, 560 nm)  — NDWI + NDTI
    #   Ch 1 = B04 (Red,   665 nm)  — NDCI + NDTI
    #   Ch 2 = B05 (RedEdge,705 nm) — NDCI numerator  (Mishra & Mishra 2012)
    #   Ch 3 = B08 (NIR,   842 nm)  — NDWI water mask
    #
    # Reflectances are scaled by EVALSCRIPT_GAIN before PNG encoding so that
    # the low water-pixel values (0.01–0.30) use most of the 8-bit range.
    evalscript = f"""
//VERSION=3
function setup() {{
    return {{
        input: [{{ bands: ["B03", "B04", "B05", "B08"] }}],
        output: {{ bands: 4, sampleType: "FLOAT32" }}
    }};
}}
function evaluatePixel(sample) {{
    var gain = {EVALSCRIPT_GAIN};
    return [
        Math.min(1.0, sample.B03 * gain),
        Math.min(1.0, sample.B04 * gain),
        Math.min(1.0, sample.B05 * gain),
        Math.min(1.0, sample.B08 * gain)
    ];
}}
"""

    # Build request data
    req_data = {
        "input": {
            "bounds": {
                "bbox": bbox,
                "properties": {"crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"},
            },
            "data": [
                {
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "timeRange": {
                            "from": start_date.isoformat() + "Z",
                            "to": end_date.isoformat() + "Z",
                        },
                        # 30 % max cloud cover — stricter than the previous 50 %.
                        # Cloud shadows over water pixels corrupt spectral indices,
                        # so permissive values produce silent errors in chlorophyll.
                        "maxCloudCoverage": 30,
                    },
                }
            ],
        },
        "output": {
            "width": 50,
            "height": 50,
            "responses": [
                {"identifier": "default", "format": {"type": "image/png"}}
            ],
        },
        "evalscript": evalscript,
    }

    try:
        # Use multipart form data
        files = {"request": ("", json.dumps(req_data), "application/json")}

        resp = requests.post(
            sh_api,
            headers={"Authorization": f"Bearer {token}"},
            files=files,
            timeout=60,
        )

        if resp.status_code == 200:
            content_type = resp.headers.get("Content-Type", "")
            if "image" in content_type:
                try:
                    return process_satellite_data(resp.content, region_id)
                except Exception as parse_err:
                    print(f"Satellite image processing failed for {region_id}: {parse_err}")
                    return generate_mock_pollution_data(region_id)
            print(f"Sentinel Hub returned unexpected content-type: {content_type}")
            return generate_mock_pollution_data(region_id)
        else:
            print(f"Sentinel Hub API error: {resp.status_code} - {resp.text[:200]}")
            return generate_mock_pollution_data(region_id)
    except Exception as e:
        print(f"Sentinel Hub request failed: {e}")
        return generate_mock_pollution_data(region_id)


def _classify_severity(chl_a: float, turbidity: float) -> str:
    """
    EU Water Framework Directive-inspired eutrophication classification.

    Thresholds (used consistently for both real satellite data and mock fallback):
      Chlorophyll-a: <10 low | 10–25 moderate | 25–75 high | >75 critical  (µg/L ≈ mg/m³)
      Turbidity:     <10 low | 10–50 moderate  | 50–100 high | >100 critical (NTU/FNU)

    The OR logic ensures that either a bloom OR high sediment load alone can
    escalate severity — both are independent pollution signals.
    """
    if chl_a > 75 or turbidity > 100:
        return "critical"
    if chl_a > 25 or turbidity > 50:
        return "high"
    if chl_a > 10 or turbidity > 10:
        return "moderate"
    return "low"


def _seasonal_multiplier() -> float:
    """
    Month-dependent chlorophyll scaling factor for the Danube (±20% sinusoidal).

    Biology: algal biomass peaks in late summer (August) due to warm water and
    accumulated nutrients, and troughs in February (cold, low irradiance).
    A ±5 % daily noise term avoids identical readings across requests.

    Mathematical model:
      multiplier = 1 + 0.20 × sin(2π/12 × (month − 5))
      Peak  at month 8 (August)  → +20 %
      Trough at month 2 (February) → −20 %
    """
    month = datetime.now().month
    seasonal = 1.0 + 0.20 * math.sin(2.0 * math.pi / 12.0 * (month - 5))
    daily_noise = random.uniform(0.95, 1.05)
    return seasonal * daily_noise


def process_satellite_data(image_bytes: bytes, region_id: str) -> dict:
    """
    Parse a Sentinel-2 4-band PNG from the CDSE Process API and compute
    scientifically defensible water quality indices.

    PNG channel → spectral band mapping (set by the evalscript):
      Ch 0 = B03  Green    560 nm   NDWI denominator / NDTI
      Ch 1 = B04  Red      665 nm   NDCI / NDTI
      Ch 2 = B05  RedEdge  705 nm   NDCI numerator
      Ch 3 = B08  NIR      842 nm   NDWI water mask

    Indices and formulas:
      NDWI = (B03 − B08) / (B03 + B08)          McFeeters 1996
             NDWI > 0  →  open water pixel

      NDCI = (B05 − B04) / (B05 + B04)          Mishra & Mishra 2012
             Chl-a (µg/L) = 14.039
                           + 86.115 × NDCI
                           + 194.325 × NDCI²

      Turbidity (FNU) = (228.1 × ρ_B04)         Dogliotti et al. 2015
                      / (1 − ρ_B04 / 0.1641)    adapted from λ=645 nm → B04=665 nm

    Raises ValueError if the image has an unexpected shape or contains no
    water pixels, so the caller can activate the mock fallback.
    """
    img = Image.open(BytesIO(image_bytes))
    arr = np.array(img, dtype=np.float32)

    if arr.ndim != 3 or arr.shape[2] < 4:
        raise ValueError(
            f"Expected 4-channel RGBA PNG, got array shape {arr.shape}. "
            "Check that the evalscript outputs exactly 4 bands."
        )

    # Recover reflectances: PNG stores gain-scaled values as uint8 0–255.
    # Dividing by (255 × EVALSCRIPT_GAIN) reverses the evalscript scaling.
    refl = arr / (255.0 * EVALSCRIPT_GAIN)
    B03 = refl[:, :, 0]
    B04 = refl[:, :, 1]
    B05 = refl[:, :, 2]
    B08 = refl[:, :, 3]

    eps = 1e-10  # guard against division by zero in index calculations

    # --- Water mask (McFeeters 1996) ---
    NDWI = (B03 - B08) / (B03 + B08 + eps)
    water_mask = NDWI > 0.0

    water_pixel_count = int(water_mask.sum())
    total_pixels = water_mask.size
    if water_pixel_count == 0:
        raise ValueError(
            f"No water pixels detected for region '{region_id}' "
            f"(all {total_pixels} pixels classified as land). "
            "The bounding box may not intersect the river channel."
        )

    # Restrict all calculations to confirmed water pixels only
    B03_w = B03[water_mask]
    B04_w = B04[water_mask]
    B05_w = B05[water_mask]

    # --- Chlorophyll-a via NDCI (Mishra & Mishra 2012) ---
    # Validated for turbid productive waters (lakes Erie, Ontario, Taihu,
    # Chesapeake Bay). The Danube is a turbid productive river — appropriate.
    NDCI = (B05_w - B04_w) / (B05_w + B04_w + eps)
    chl_a = 14.039 + 86.115 * NDCI + 194.325 * np.power(NDCI, 2)
    chl_a = np.clip(chl_a, 0.0, None)
    chl_a_mean = float(np.mean(chl_a))

    # --- Turbidity via Dogliotti et al. 2015 single-band algorithm ---
    # Original calibration: λ = 645 nm, A_T = 228.1, C_T = 0.1641.
    # B04 centre wavelength is 665 nm — close enough for a first-order estimate.
    # Values > 1000 FNU are physically implausible for the Danube and indicate
    # a cloud/shadow remnant that passed the cloud-coverage filter.
    A_T, C_T = 228.1, 0.1641
    denom = np.maximum(1.0 - B04_w / C_T, eps)
    turbidity = np.clip((A_T * B04_w) / denom, 0.0, 1000.0)
    turbidity_mean = float(np.mean(turbidity))

    severity = _classify_severity(chl_a_mean, turbidity_mean)

    return {
        "id": f"{region_id}-sat",
        "coords": get_region_center(region_id),
        "name": get_region_name(region_id),
        "source": "satellite",
        "severity": severity,
        "metrics": {
            # µg/L ≡ mg/m³ for dilute aqueous solutions (ρ_water ≈ 1 g/mL)
            "chlorophyll_mg_m3": round(chl_a_mean, 1),
            # FNU (Formazin Nephelometric Units) ≈ NTU for practical purposes
            "turbidity_ntu": round(turbidity_mean, 1),
        },
        "reportedAt": datetime.now().isoformat() + "Z",
        "notes": (
            f"Sentinel-2 L2A live analysis. "
            f"NDCI (Mishra & Mishra 2012) | Turbidity (Dogliotti et al. 2015). "
            f"Water pixels: {water_pixel_count}/{total_pixels}."
        ),
    }


def generate_mock_pollution_data(region_id: str) -> dict:
    """
    Seasonal fallback mock data used when Sentinel Hub is unavailable.

    Base values are representative median measurements for each Danube reach
    (chlorophyll in µg/L ≡ mg/m³, turbidity in FNU/NTU).

    Nitrates and phosphates are deliberately ABSENT: Sentinel-2 cannot detect
    dissolved nutrients directly — those signals require in-situ IoT sensors or
    citizen measurements. Displaying satellite-derived nutrient values would be
    scientifically misleading ('junk science').

    Heat anomaly is also absent: thermal infrared is only available on
    Sentinel-3 SLSTR or Landsat 8/9, not Sentinel-2 MSI.

    Seasonal variation (±20 %) is applied via _seasonal_multiplier() so that
    fallback data reflects real algal bloom seasonality on the Danube.
    """
    # Base annual-median values per region (chlorophyll µg/L, turbidity FNU)
    # Sources: Danube River Basin Management Plan 2021, ICPDR monitoring reports.
    base_metrics: dict[str, dict] = {
        # Reservoir — sediment trap keeps turbidity low; nutrients accumulate
        "iron-gates":    {"chlorophyll": 22.1, "turbidity_ntu": 6.0},
        # Gorge section below reservoir — still relatively clear
        "portile-fier":  {"chlorophyll":  9.5, "turbidity_ntu": 9.0},
        # Mid-Danube plain — agricultural runoff elevates nutrients
        "corabia":       {"chlorophyll": 18.7, "turbidity_ntu": 32.0},
        # Industrial outflow — highest chlorophyll in dataset
        "calarasi":      {"chlorophyll": 51.7, "turbidity_ntu": 58.0},
        # Border section with mixed urban/industrial load
        "giurgiu":       {"chlorophyll": 15.2, "turbidity_ntu": 20.0},
        # Large port; ship traffic re-suspends sediment → elevated turbidity
        "smirdan":       {"chlorophyll": 12.3, "turbidity_ntu": 35.0},
        # Delta intake — naturally turbid (accretionary delta, high SPM)
        "tulcea-delta":  {"chlorophyll":  8.4, "turbidity_ntu": 30.0},
        # Major industrial port + Insula Mare a Brăilei agricultural zone
        "braila":        {"chlorophyll": 28.5, "turbidity_ntu": 42.0},
    }

    base = base_metrics.get(region_id, {"chlorophyll": 10.0, "turbidity_ntu": 15.0})
    mult = _seasonal_multiplier()

    chl = base["chlorophyll"] * mult
    turb = base["turbidity_ntu"] * mult
    severity = _classify_severity(chl, turb)

    return {
        "id": f"{region_id}-sat",
        "coords": get_region_center(region_id),
        "name": get_region_name(region_id),
        "source": "satellite",
        "severity": severity,
        "metrics": {
            "chlorophyll_mg_m3": round(chl, 1),
            "turbidity_ntu": round(turb, 1),
        },
        "reportedAt": datetime.now().isoformat() + "Z",
        "notes": "[FALLBACK] Sentinel Hub unavailable — seasonal mock data (±20 % variation).",
    }


def get_region_center(region_id: str) -> list:
    """Get center coordinates for a region."""
    centers = {
        "braila": [45.2692, 27.9578],
        "iron-gates": [44.6228, 22.6750],
        "tulcea-delta": [45.2157, 28.7969],
        "calarasi": [44.0833, 27.2667],
        "giurgiu": [43.9333, 25.9667],
        "smirdan": [45.5667, 28.1000],
        "corabia": [43.7833, 24.5333],
        "portile-fier": [44.5447, 21.9667],
    }
    return centers.get(region_id, [44.4, 26.0])


def get_region_name(region_id: str) -> str:
    """Get human-readable name for a region."""
    names = {
        "braila": "Brăila / Insula Mare a Brăilei",
        "iron-gates": "Iron Gates Reservoir",
        "tulcea-delta": "Tulcea / Delta Intake",
        "calarasi": "Călărași Industrial Outflow",
        "giurgiu": "Giurgiu / Ruse Border",
        "smirdan": "Smârdan / Galați Port",
        "corabia": "Corabia Industrial Zone",
        "portile-fier": "Portile de Fier",
    }
    return names.get(region_id, region_id)


@app.route("/api/map/analyze", methods=["POST"])
def analyze_region():
    """
    Analyze a Danube region for pollution using satellite data.
    Request body: { "region_id": "braila" }
    Response: Pollution metrics for the region
    """
    data = request.json
    region_id = data.get("region_id")

    if not region_id:
        return jsonify({"error": "region_id is required"}), 400

    if region_id not in REGION_BBOXES:
        return jsonify({"error": f"Unknown region: {region_id}"}), 400

    try:
        result = analyze_region_satellite(region_id)
        if result:
            return jsonify(result), 200
        return jsonify({"error": "Analysis failed"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/predict-eta", methods=["POST"])
def predict_eta():
    """
    Estimates how long a pollution plume takes to travel downstream from its
    detection point to a monitoring station.

    Request body (JSON):
      pollution_lat        float  — latitude of the detected pollution patch
      pollution_lon        float  — longitude of the detected pollution patch
      station_lat          float  — latitude of the target monitoring station
      station_lon          float  — longitude of the target monitoring station
      timestamp_detection  str    — ISO 8601 detection time (e.g. "2024-06-01T14:00:00Z")

    Response (JSON):
      distance_km           — river-following distance (geodesic if Overpass failed)
      current_discharge_m3s — live discharge from Open-Meteo flood API
      estimated_velocity_kmh — surface velocity (V = Q / A, A = 6 400 m²)
      transit_time_hours    — distance / velocity
      eta_timestamp         — ISO 8601 expected arrival time
      used_fallback_distance — true when straight-line geodesic was used
      upstream_warning      — true when station appears upstream of the plume
    """
    body = request.get_json(silent=True) or {}

    required = [
        "pollution_lat", "pollution_lon",
        "station_lat", "station_lon",
        "timestamp_detection",
    ]
    missing = [f for f in required if f not in body]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    # datetime.fromisoformat() in Python < 3.11 does not parse the "Z" suffix.
    timestamp_str = str(body["timestamp_detection"]).replace("Z", "+00:00")
    try:
        ts = datetime.fromisoformat(timestamp_str)
    except (ValueError, TypeError):
        return jsonify({
            "error": (
                "Invalid timestamp_detection. "
                "Expected ISO 8601 format, e.g. '2024-06-01T14:00:00Z'."
            )
        }), 400

    try:
        result = _compute_eta(
            pollution_lat=float(body["pollution_lat"]),
            pollution_lon=float(body["pollution_lon"]),
            station_lat=float(body["station_lat"]),
            station_lon=float(body["station_lon"]),
            timestamp_detection=ts,
        )
        return jsonify(result), 200
    except (ValueError, TypeError) as exc:
        return jsonify({"error": f"Invalid coordinate values: {exc}"}), 400
    except Exception as exc:
        return jsonify({"error": "Internal server error", "details": str(exc)}), 500


# ===== NEW ROUTES: Water Stations + Sensor Data + Data Ingestion =====


@app.route("/api/water-stations", methods=["GET"])
def get_water_stations():
    """List all water treatment/monitoring stations.
    Query params: ?type=treatment&river=Dunărea&active=true
    """
    if not supabase:
        return jsonify({"error": "Supabase client uninitialized"}), 500
    try:
        query = supabase.table("water_stations").select("*")

        station_type = request.args.get("type")
        if station_type:
            query = query.eq("station_type", station_type)

        river = request.args.get("river")
        if river:
            query = query.eq("river_name", river)

        active_only = request.args.get("active", "true").lower()
        if active_only == "true":
            query = query.eq("is_active", True)

        response = query.order("name").execute()
        return jsonify({"stations": response.data, "count": len(response.data)}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/water-stations/nearest", methods=["GET"])
def get_nearest_stations():
    """Find nearest water stations to a given point.
    Query params: ?lat=44.42&lng=26.10&radius_km=200&limit=5
    """
    if not supabase:
        return jsonify({"error": "Supabase client uninitialized"}), 500
    try:
        lat = float(request.args.get("lat", 44.4))
        lng = float(request.args.get("lng", 26.1))
        radius = float(request.args.get("radius_km", 200))
        limit = int(request.args.get("limit", 5))

        response = supabase.rpc(
            "get_nearest_water_stations",
            {"in_lng": lng, "in_lat": lat, "in_max_distance_km": radius, "in_limit": limit},
        ).execute()

        return jsonify({"stations": response.data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/sensor-data/history", methods=["GET"])
def get_sensor_data_history():
    """Fetch historical sensor readings with optional filters.
    Query params: ?source=eea_waterbase&days=7&limit=200
                  &min_lng=22&min_lat=43&max_lng=30&max_lat=46
    """
    if not supabase:
        return jsonify({"error": "Supabase client uninitialized"}), 500
    try:
        source = request.args.get("source")
        days = int(request.args.get("days", 7))
        limit = int(request.args.get("limit", 200))

        # Optional bounding box
        min_lng = request.args.get("min_lng")
        min_lat = request.args.get("min_lat")
        max_lng = request.args.get("max_lng")
        max_lat = request.args.get("max_lat")

        params = {
            "in_source": source,
            "in_days": days,
            "in_min_lng": float(min_lng) if min_lng else None,
            "in_min_lat": float(min_lat) if min_lat else None,
            "in_max_lng": float(max_lng) if max_lng else None,
            "in_max_lat": float(max_lat) if max_lat else None,
            "in_limit": limit,
        }

        response = supabase.rpc("get_sensor_data_summary", params).execute()

        return jsonify({
            "data": response.data,
            "count": len(response.data) if response.data else 0,
            "filters": {"source": source, "days": days},
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/data/ingest", methods=["POST"])
def trigger_data_ingestion():
    """Manually trigger data ingestion from external sources.
    Request body (optional): { "sources": ["eea", "copernicus", "emodnet"] }
    If no sources specified, runs all.
    """
    body = request.get_json(silent=True) or {}
    sources = body.get("sources")

    try:
        result = run_full_ingestion(sources=sources)
        status_code = 200 if "error" not in result else 500
        return jsonify(result), status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/data/sources", methods=["GET"])
def list_data_sources():
    """List available external data sources and their status."""
    sources = [
        {
            "id": "eea_waterbase",
            "name": "EEA Waterbase (European Environment Agency)",
            "type": "water_quality",
            "status": "active",
            "data_type": "Chemical parameters (nitrates, phosphates, pH, O₂)",
            "coverage": "EU-wide, Romanian rivers",
            "update_frequency": "Quarterly datasets, daily via WISE SOE API",
        },
        {
            "id": "copernicus",
            "name": "Copernicus Sentinel-2 (ESA/EU)",
            "type": "satellite",
            "status": "active" if os.environ.get("SENTINEL_HUB_CLIENT_ID") else "mock",
            "data_type": "Chlorophyll-a, turbidity, thermal anomalies",
            "coverage": "Global (focused on Danube corridor)",
            "update_frequency": "Every 5 days per region",
        },
        {
            "id": "emodnet",
            "name": "EMODnet Physics",
            "type": "oceanographic",
            "status": "active",
            "data_type": "Temperature, salinity, currents",
            "coverage": "Black Sea / Danube Delta interface",
            "update_frequency": "Near real-time",
        },
        {
            "id": "grdc",
            "name": "GRDC (Global Runoff Data Centre)",
            "type": "hydrology",
            "status": "mock",
            "data_type": "River discharge, water level, flow velocity",
            "coverage": "Major Danube gauging stations",
            "update_frequency": "Daily (when API access approved)",
        },
        {
            "id": "ngo_sensors",
            "name": "NGO Field Sensors (MaiMultVerde, Delta Watch, etc.)",
            "type": "citizen_science",
            "status": "mock",
            "data_type": "Full water quality suite",
            "coverage": "Danube + Romanian tributaries",
            "update_frequency": "Hourly (when integrated)",
        },
    ]
    return jsonify({"sources": sources}), 200


@app.route("/api/debug/env", methods=["GET"])
def debug_env():
    """Debug endpoint to check environment."""
    return (
        jsonify(
            {
                "client_id": SENTINEL_HUB_CLIENT_ID,
                "has_secret": bool(SENTINEL_HUB_CLIENT_SECRET),
                "base_url": SENTINEL_HUB_BASE_URL,
            }
        ),
        200,
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
