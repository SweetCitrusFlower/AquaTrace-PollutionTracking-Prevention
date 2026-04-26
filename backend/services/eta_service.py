"""
eta_service.py — Pollution plume ETA calculator for DanubeGuard OS.

Estimates how long it takes for a detected pollution patch to travel
downstream along the Danube and reach a monitoring station.

Data sources (all live, no static files):
  - Overpass API   → river geometry (way nodes)
  - Open-Meteo     → current river discharge (m³/s)
  - geopy fallback → straight-line distance if Overpass is unavailable
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Optional

import requests
from geopy.distance import geodesic
from pyproj import Transformer
from shapely.geometry import LineString, Point
from shapely.ops import transform as shapely_transform

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
FLOOD_API_BASE = "https://flood-api.open-meteo.com/v1/flood"

# HTTP timeout for the Overpass request; internal Overpass timeout is set to
# 14 s in the query body so we get a clean API error rather than a TCP drop.
OVERPASS_TIMEOUT_S: int = 15

# Danube mean cross-sectional area used in V = Q / A.
# Hackathon approximation — actual values range from ~200 m² (Austrian source)
# to ~15 000 m² (Romanian delta). 6 400 m² is a reasonable mid-reach estimate.
DANUBE_CROSS_SECTION_M2: float = 6_400.0

# Historical median discharge at Orsova (mid-Danube, Romania).
# Used when the Open-Meteo flood API is unreachable or returns no data.
DEFAULT_DISCHARGE_M3S: float = 6_500.0

# Coordinate reference systems
_WGS84 = "EPSG:4326"
_UTM34N = "EPSG:32634"   # UTM Zone 34N — metric precision for Romania's Danube sector


# ---------------------------------------------------------------------------
# Private helpers — river geometry
# ---------------------------------------------------------------------------

def _build_overpass_query(
    lat1: float, lon1: float,
    lat2: float, lon2: float,
) -> str:
    """
    Builds an Overpass QL query that fetches every Danube way segment inside
    a bounding box that includes both points plus 0.5° padding on all sides.
    The generous padding prevents missing pronounced meanders like the Iron
    Gates gorge or the Danube bend near Tulcea.
    """
    padding = 0.5
    s = min(lat1, lat2) - padding
    n = max(lat1, lat2) + padding
    w = min(lon1, lon2) - padding
    e = max(lon1, lon2) + padding

    return (
        f'[out:json][timeout:14];\n'
        f'way["waterway"="river"]'
        f'["name"~"Dunărea|Danube|Dunav|Duna|Donau|Dunaj"]'
        f'({s:.6f},{w:.6f},{n:.6f},{e:.6f});\n'
        f'out geom;'
    )


def _fetch_river_geometry(
    lat1: float, lon1: float,
    lat2: float, lon2: float,
) -> Optional[LineString]:
    """
    Calls Overpass, parses the returned way segments and assembles them into
    a single WGS-84 LineString.

    Segments are sorted by the longitude of their first node (ascending) before
    concatenation, which follows the Danube's dominant W→E flow direction and
    keeps the resulting line topologically consistent enough for distance
    projection.

    Returns None if Overpass returns an empty element list.
    Raises on HTTP / timeout errors so the caller can activate the fallback.
    """
    query = _build_overpass_query(lat1, lon1, lat2, lon2)

    # Overpass-API returns HTTP 406 for requests without a User-Agent header.
    # Python's requests library omits it by default; curl sends it automatically.
    resp = requests.post(
        OVERPASS_URL,
        data={"data": query},
        headers={
            "User-Agent": "DanubeGuardOS/1.0 (hackathon; contact: mateidragomir74@gmail.com)",
            "Accept": "*/*",
        },
        timeout=OVERPASS_TIMEOUT_S,
    )
    resp.raise_for_status()

    ways = [
        e for e in resp.json().get("elements", [])
        if e.get("type") == "way" and e.get("geometry")
    ]
    if not ways:
        return None

    # Sort segments W→E so concatenation approximates downstream order.
    ways_sorted = sorted(ways, key=lambda w: w["geometry"][0]["lon"])

    coords: list[tuple[float, float]] = []
    for way in ways_sorted:
        coords.extend(
            (node["lon"], node["lat"]) for node in way["geometry"]
        )

    return LineString(coords) if len(coords) >= 2 else None


# ---------------------------------------------------------------------------
# Private helpers — distance calculation
# ---------------------------------------------------------------------------

def _calculate_river_distance(
    river_line: LineString,
    pollution_lon: float,
    pollution_lat: float,
    station_lon: float,
    station_lat: float,
) -> float:
    """
    Projects the WGS-84 LineString and both points into UTM Zone 34N
    (EPSG:32634) and returns the along-river distance in kilometres.

    Why UTM 34N instead of Web Mercator (EPSG:3857)?
    At ~45 °N (Romania), Web Mercator stretches the X-axis by cos⁻¹(45°) ≈ 1.41,
    introducing a ~3–5 % distance error. EPSG:32634 is a conformal projection
    designed for this latitude band and keeps metric distortion under 0.04 %.
    """
    project = Transformer.from_crs(_WGS84, _UTM34N, always_xy=True).transform

    river_utm: LineString = shapely_transform(project, river_line)
    poll_utm: Point = shapely_transform(project, Point(pollution_lon, pollution_lat))
    station_utm: Point = shapely_transform(project, Point(station_lon, station_lat))

    # project() returns the distance along the line to the closest point (metres).
    d_poll: float = river_utm.project(poll_utm)
    d_station: float = river_utm.project(station_utm)

    return abs(d_station - d_poll) / 1_000.0   # → km


# ---------------------------------------------------------------------------
# Private helpers — river discharge
# ---------------------------------------------------------------------------

def _fetch_river_discharge(lat: float, lon: float) -> float:
    """
    Queries the Open-Meteo flood API for today's river discharge at the
    pollution source coordinates.

    Strategy (A + C as agreed):
      1. Try today's date first.
      2. Fall back to the last non-null value in the response (API typically
         lags 1–2 days).
      3. If the API is unreachable or returns no usable data, return the
         hardcoded historical default (DEFAULT_DISCHARGE_M3S = 6 500 m³/s).
    """
    today = date.today().isoformat()
    try:
        resp = requests.get(
            FLOOD_API_BASE,
            params={"latitude": lat, "longitude": lon, "daily": "river_discharge"},
            timeout=10,
        )
        resp.raise_for_status()

        daily = resp.json().get("daily", {})
        times: list[str] = daily.get("time", [])
        discharges: list[Optional[float]] = daily.get("river_discharge", [])

        if times and discharges:
            # Preferred: today's value.
            # Guard: Open-Meteo returns 0.0 (not null) for land cells with no
            # river — treat 0.0 the same as None so we reach the default below.
            if today in times:
                val = discharges[times.index(today)]
                if val is not None and val > 0:
                    return float(val)

            # Fallback A: latest available non-null, non-zero reading
            for val in reversed(discharges):
                if val is not None and val > 0:
                    return float(val)

    except Exception as exc:
        logger.warning("Open-Meteo flood API unavailable — using default discharge: %s", exc)

    # Fallback C: hardcoded historical default
    return DEFAULT_DISCHARGE_M3S


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def calculate_eta(
    pollution_lat: float,
    pollution_lon: float,
    station_lat: float,
    station_lon: float,
    timestamp_detection: datetime,
) -> dict:
    """
    Calculates the ETA of a pollution plume travelling downstream from its
    detection point to a monitoring station.

    Returns a dict ready for jsonify() with the following keys:
      distance_km           — river-following (or geodesic fallback) distance
      current_discharge_m3s — live discharge from Open-Meteo
      estimated_velocity_kmh — surface velocity derived from V = Q / A
      transit_time_hours    — distance / velocity
      eta_timestamp         — ISO-8601 datetime when plume is expected to arrive
      used_fallback_distance — True when Overpass/Shapely failed and we used geodesic
      upstream_warning      — True when station appears to be upstream of the plume

    Assumptions (hackathon scope):
      - Plume travels downstream at the mean surface velocity of the river.
      - Cross-section A = 6 400 m² (fixed approximation, see constant above).
      - Upstream detection uses a longitude heuristic: Danube flows W→E, so
        if pollution_lon > station_lon the station is upstream (warning only,
        not an error — the caller may still display results with a UI warning).
    """

    # ------------------------------------------------------------------
    # Upstream heuristic (Variant A — longitude proxy)
    # The Danube flows generally west → east; higher longitude = further
    # downstream.  If the pollution source is already east of the station,
    # the plume cannot reach it by flowing downstream.
    # ------------------------------------------------------------------
    upstream_warning: bool = pollution_lon > station_lon

    # ------------------------------------------------------------------
    # Step 1: River distance
    # ------------------------------------------------------------------
    used_fallback_distance = False
    try:
        river_line = _fetch_river_geometry(
            pollution_lat, pollution_lon,
            station_lat, station_lon,
        )
        if river_line is None:
            raise ValueError("Overpass returned no Danube geometry for this bounding box")

        distance_km = _calculate_river_distance(
            river_line,
            pollution_lon, pollution_lat,
            station_lon, station_lat,
        )
    except Exception as exc:
        logger.warning(
            "Overpass/Shapely pipeline failed → activating geodesic fallback. Reason: %s", exc
        )
        used_fallback_distance = True
        distance_km = geodesic(
            (pollution_lat, pollution_lon),
            (station_lat, station_lon),
        ).km

    # ------------------------------------------------------------------
    # Step 2: Live river discharge
    # ------------------------------------------------------------------
    discharge: float = _fetch_river_discharge(pollution_lat, pollution_lon)

    # Sanity check: the Danube never drops below ~1 000 m³/s even in severe
    # drought. Values below 100 m³/s indicate the API resolved the coordinates
    # to a land cell or a minor tributary, not the main channel.
    if discharge < 100.0:
        logger.warning(
            "Discharge %.1f m³/s at (%.4f, %.4f) is below Danube minimum — "
            "coordinates likely missed the main channel. Substituting default %.0f m³/s.",
            discharge, pollution_lat, pollution_lon, DEFAULT_DISCHARGE_M3S,
        )
        discharge = DEFAULT_DISCHARGE_M3S

    # ------------------------------------------------------------------
    # Step 3: Surface velocity  V = Q / A
    # ------------------------------------------------------------------
    velocity_ms: float = discharge / DANUBE_CROSS_SECTION_M2   # m/s
    velocity_kmh: float = velocity_ms * 3.6                     # km/h

    # ------------------------------------------------------------------
    # Step 4: ETA
    # ------------------------------------------------------------------
    if velocity_kmh > 0 and distance_km > 0:
        transit_time_hours = distance_km / velocity_kmh
    else:
        transit_time_hours = 0.0   # same-point case or zero-flow edge case

    eta_dt: datetime = timestamp_detection + timedelta(hours=transit_time_hours)

    return {
        "distance_km": round(distance_km, 2),
        "current_discharge_m3s": round(discharge, 2),
        "estimated_velocity_kmh": round(velocity_kmh, 4),
        "transit_time_hours": round(transit_time_hours, 2),
        "eta_timestamp": eta_dt.isoformat(),
        "used_fallback_distance": used_fallback_distance,
        "upstream_warning": upstream_warning,
    }
