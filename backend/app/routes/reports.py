from flask import Blueprint, current_app, jsonify, request

from ..supabase_client import get_supabase_client
from ..utils.validators import (
    ValidationError,
    parse_float,
    parse_optional_datetime,
    parse_optional_float,
    parse_uuid,
    require_fields,
)


reports_bp = Blueprint("reports", __name__)

ALLOWED_REPORT_TYPES = {
    "algae_bloom",
    "dead_fish",
    "oil_sheen",
    "foam",
    "odor",
    "discoloration",
    "litter",
    "other",
}


@reports_bp.post("/reports")
def create_report():
    payload = request.get_json(silent=True) or {}

    try:
        require_fields(payload, ["user_id", "report_type", "latitude", "longitude", "image_url"])

        user_id = parse_uuid(payload.get("user_id"), "user_id")
        report_type = str(payload.get("report_type", "")).strip().lower()
        if report_type not in ALLOWED_REPORT_TYPES:
            raise ValidationError("report_type is invalid.")

        latitude = parse_float(payload.get("latitude"), "latitude", minimum=-90.0, maximum=90.0)
        longitude = parse_float(payload.get("longitude"), "longitude", minimum=-180.0, maximum=180.0)

        image_url = str(payload.get("image_url", "")).strip()
        if not image_url.startswith("http"):
            raise ValidationError("image_url must be a valid URL.")

        exif_taken_at = parse_optional_datetime(payload.get("exif_taken_at"), "exif_taken_at")
        gps_accuracy_m = parse_optional_float(
            payload.get("gps_accuracy_m"),
            "gps_accuracy_m",
            minimum=0.0,
            maximum=10000.0,
        )

        rpc_payload = {
            "p_user_id": user_id,
            "p_report_type": report_type,
            "p_lat": latitude,
            "p_lon": longitude,
            "p_image_url": image_url,
            "p_exif_taken_at": exif_taken_at,
            "p_notes": payload.get("notes"),
            "p_source": payload.get("source", "citizen"),
            "p_gps_accuracy_m": gps_accuracy_m,
            "p_token_reward": int(current_app.config.get("REPORT_TOKEN_REWARD", 10)),
        }
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        response = get_supabase_client().rpc("create_citizen_report", rpc_payload).execute()
    except Exception:
        current_app.logger.exception("Failed to persist report via Supabase RPC")
        return jsonify({"error": "Failed to save report."}), 502

    if response.data is None:
        return jsonify({"error": "Persistence layer returned no report."}), 500

    return jsonify({"report": response.data}), 201