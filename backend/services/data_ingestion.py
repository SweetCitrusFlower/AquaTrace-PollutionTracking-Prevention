"""
data_ingestion.py
=================
Orchestrator that pulls data from all external sources, normalizes it,
inserts into Supabase (sensor_data table), and auto-creates anomalies
when threshold values are exceeded.

Can be run as:
  - A Flask route trigger (POST /api/data/ingest)
  - A standalone cron script (python -m services.data_ingestion)
  - A one-off manual import

Environment variables read from ../.env.local (same as app.py):
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SENTINEL_HUB_CLIENT_ID      (optional — falls back to mock)
  SENTINEL_HUB_CLIENT_SECRET   (optional — falls back to mock)
"""

import os
import json
from datetime import datetime
from typing import Any

from supabase import create_client, Client
from dotenv import load_dotenv

from services.external_data_service import (
    EEAWaterbaseClient,
    EMODnetClient,
    CopernicusClient,
    MockNGOClient,
    MockGRDCClient,
    check_thresholds,
)

# Load env from the root Next.js project
load_dotenv(dotenv_path="../.env.local")

# Danube region bounding boxes for satellite scans
DANUBE_BBOXES = {
    "iron-gates":    [22.4, 44.5, 22.8, 44.8],
    "tulcea-delta":  [28.6, 45.0, 29.0, 45.4],
    "giurgiu":       [25.9, 43.8, 26.3, 44.1],
    "smirdan":       [28.0, 45.4, 28.5, 45.8],
    "corabia":       [24.4, 43.7, 24.8, 44.0],
    "portile-fier":  [21.8, 44.4, 22.2, 44.7],
}


def _get_supabase() -> Client | None:
    """Create Supabase client using service role key (bypasses RLS)."""
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[Ingest] WARNING: Supabase credentials missing.")
        return None
    return create_client(url, key)


def _insert_sensor_data(supabase: Client, records: list[dict]) -> int:
    """
    Insert normalized records into the sensor_data table.
    Returns count of successfully inserted rows.
    """
    if not records:
        return 0

    rows = []
    for rec in records:
        lat = rec.get("lat")
        lng = rec.get("lng")
        if lat is None or lng is None:
            continue

        point_wkt = f"POINT({lng} {lat})"
        row = {
            "source": rec["source"],
            "location": point_wkt,
            "chlorophyll_mg_m3": rec.get("chlorophyll_mg_m3"),
            "turbidity_ntu": rec.get("turbidity_ntu"),
            "nitrates_mg_l": rec.get("nitrates_mg_l"),
            "nitrites_mg_l": rec.get("nitrites_mg_l"),
            "phosphates_mg_l": rec.get("phosphates_mg_l"),
            "sulfates_mg_l": rec.get("sulfates_mg_l"),
            "sulfites_mg_l": rec.get("sulfites_mg_l"),
            "ph": rec.get("ph"),
            "dissolved_oxygen_mg_l": rec.get("dissolved_oxygen_mg_l"),
            "temperature_c": rec.get("temperature_c"),
            "conductivity_us_cm": rec.get("conductivity_us_cm"),
            "water_purity_index": rec.get("water_purity_index"),
            "discharge_m3_s": rec.get("discharge_m3_s"),
            "water_level_m": rec.get("water_level_m"),
            "flow_velocity_m_s": rec.get("flow_velocity_m_s"),
            "recorded_at": rec.get("recorded_at", datetime.utcnow().isoformat() + "Z"),
            "raw_payload": json.dumps(rec.get("raw_payload")) if rec.get("raw_payload") else None,
        }
        rows.append(row)

    if not rows:
        return 0

    try:
        # Insert in batches of 50 to avoid payload limits
        inserted = 0
        batch_size = 50
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            response = supabase.table("sensor_data").insert(batch).execute()
            inserted += len(response.data) if response.data else 0
        return inserted
    except Exception as e:
        print(f"[Ingest] DB insert error: {e}")
        return 0


def _create_anomalies(supabase: Client, alerts: list[dict]) -> int:
    """
    Insert anomaly alerts into the anomalies table.
    Returns count of created anomalies.
    """
    if not alerts:
        return 0

    rows = []
    for alert in alerts:
        lat = alert.get("lat")
        lng = alert.get("lng")
        if lat is None or lng is None:
            continue

        point_wkt = f"POINT({lng} {lat})"
        rows.append({
            "source": alert.get("source", "unknown"),
            "anomaly_type": alert["anomaly_type"],
            "severity": alert.get("severity", 3),
            "location": point_wkt,
        })

    if not rows:
        return 0

    try:
        response = supabase.table("anomalies").insert(rows).execute()
        return len(response.data) if response.data else 0
    except Exception as e:
        print(f"[Ingest] Anomaly insert error: {e}")
        return 0


# ---------------------------------------------------------------------------
# Main ingestion pipeline
# ---------------------------------------------------------------------------
def run_full_ingestion(
    sources: list[str] | None = None,
) -> dict[str, Any]:
    """
    Run the full data ingestion pipeline.

    Args:
        sources: Optional list of sources to ingest. If None, runs all.
                 Valid values: 'eea', 'emodnet', 'copernicus', 'ngo', 'grdc'

    Returns:
        Summary dict with counts per source and total anomalies created.
    """
    all_sources = {"eea", "emodnet", "copernicus", "ngo", "grdc"}
    active_sources = set(sources) if sources else all_sources

    supabase = _get_supabase()
    if not supabase:
        return {"error": "Supabase client not available", "records_inserted": 0}

    summary = {
        "started_at": datetime.utcnow().isoformat() + "Z",
        "sources": {},
        "total_records": 0,
        "total_anomalies": 0,
    }

    all_records: list[dict] = []

    # --- EEA Waterbase ---
    if "eea" in active_sources:
        print("[Ingest] Fetching EEA Waterbase data...")
        eea = EEAWaterbaseClient()
        eea_records = eea.fetch_romania_river_data(limit=200)
        all_records.extend(eea_records)
        summary["sources"]["eea_waterbase"] = len(eea_records)

    # --- EMODnet ---
    if "emodnet" in active_sources:
        print("[Ingest] Fetching EMODnet Physics data...")
        emodnet = EMODnetClient()
        emodnet_records = emodnet.fetch_black_sea_data(limit=50)
        all_records.extend(emodnet_records)
        summary["sources"]["emodnet"] = len(emodnet_records)

    # --- Copernicus Satellite ---
    if "copernicus" in active_sources:
        print("[Ingest] Analyzing Danube regions via Copernicus...")
        copernicus = CopernicusClient()
        sat_records = []
        for region_id, bbox in DANUBE_BBOXES.items():
            result = copernicus.analyze_region(bbox, region_name=region_id)
            if result:
                sat_records.append(result)
        all_records.extend(sat_records)
        summary["sources"]["copernicus"] = len(sat_records)

    # --- Mock: NGO Sensors ---
    if "ngo" in active_sources:
        print("[Ingest] Generating NGO sensor readings (mock)...")
        ngo = MockNGOClient()
        ngo_records = ngo.generate_readings()
        all_records.extend(ngo_records)
        summary["sources"]["ngo_sensors_mock"] = len(ngo_records)

    # --- Mock: GRDC Discharge ---
    if "grdc" in active_sources:
        print("[Ingest] Generating GRDC discharge data (mock)...")
        grdc = MockGRDCClient()
        grdc_records = grdc.generate_readings()
        all_records.extend(grdc_records)
        summary["sources"]["grdc_mock"] = len(grdc_records)

    # --- Insert all records ---
    print(f"[Ingest] Inserting {len(all_records)} records into sensor_data...")
    inserted = _insert_sensor_data(supabase, all_records)
    summary["total_records"] = inserted

    # --- Check thresholds and create anomalies ---
    print("[Ingest] Checking thresholds for anomalies...")
    all_alerts = []
    for record in all_records:
        alerts = check_thresholds(record)
        all_alerts.extend(alerts)

    if all_alerts:
        anomalies_created = _create_anomalies(supabase, all_alerts)
        summary["total_anomalies"] = anomalies_created
        print(f"[Ingest] Created {anomalies_created} anomaly alerts!")

    summary["finished_at"] = datetime.utcnow().isoformat() + "Z"
    print(f"[Ingest] Pipeline complete: {json.dumps(summary, indent=2)}")
    return summary


# ---------------------------------------------------------------------------
# CLI entry point (for cron jobs)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    sources_arg = sys.argv[1:] if len(sys.argv) > 1 else None
    result = run_full_ingestion(sources=sources_arg)
    print(json.dumps(result, indent=2))
