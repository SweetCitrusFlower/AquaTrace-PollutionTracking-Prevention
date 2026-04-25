from flask import Blueprint, current_app, jsonify, request

from ..supabase_client import get_supabase_client
from ..utils.validators import ValidationError, parse_float


map_data_bp = Blueprint("map_data", __name__)


def _is_missing_map_rpc(error: Exception) -> bool:
    error_text = str(error)
    return "PGRST202" in error_text or "Could not find the function public.get_map_data" in error_text


def _parse_bbox(raw_bbox: str | None, default_bbox: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    if not raw_bbox:
        return default_bbox

    values = [value.strip() for value in raw_bbox.split(",")]
    if len(values) != 4:
        raise ValidationError("bbox must have four comma-separated values.")

    min_lon = parse_float(values[0], "bbox.min_lon", minimum=-180.0, maximum=180.0)
    min_lat = parse_float(values[1], "bbox.min_lat", minimum=-90.0, maximum=90.0)
    max_lon = parse_float(values[2], "bbox.max_lon", minimum=-180.0, maximum=180.0)
    max_lat = parse_float(values[3], "bbox.max_lat", minimum=-90.0, maximum=90.0)

    if min_lon >= max_lon or min_lat >= max_lat:
        raise ValidationError("bbox min values must be smaller than max values.")

    return min_lon, min_lat, max_lon, max_lat


@map_data_bp.get("/map/data")
def get_map_data():
    try:
        min_lon, min_lat, max_lon, max_lat = _parse_bbox(
            request.args.get("bbox"),
            current_app.config.get("DEFAULT_BBOX", (8.0, 42.0, 30.0, 50.0)),
        )
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400

    rpc_payload = {
        "p_min_lon": min_lon,
        "p_min_lat": min_lat,
        "p_max_lon": max_lon,
        "p_max_lat": max_lat,
    }

    try:
        response = get_supabase_client().rpc("get_map_data", rpc_payload).execute()
    except Exception as exc:
        current_app.logger.exception("Failed to fetch map bundle via Supabase RPC")
        if _is_missing_map_rpc(exc):
            return (
                jsonify(
                    {
                        "reports": [],
                        "anomalies": [],
                        "sensors": [],
                        "warning": "Supabase function public.get_map_data is missing. Run supabase/schema.sql in Supabase SQL Editor.",
                    }
                ),
                200,
            )
        return jsonify({"error": "Failed to load map data."}), 502

    data = response.data or {"reports": [], "anomalies": [], "sensors": []}
    return jsonify(data), 200