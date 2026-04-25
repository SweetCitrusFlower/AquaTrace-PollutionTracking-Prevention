from flask import Blueprint, current_app, jsonify, request

from ..supabase_client import get_supabase_client
from ..utils.validators import (
    ValidationError,
    parse_float,
    parse_optional_datetime,
    parse_optional_float,
)


webhooks_bp = Blueprint("webhooks", __name__)


def _is_request_authorized() -> bool:
    expected_token = current_app.config.get("COPERNICUS_WEBHOOK_TOKEN", "")
    if not expected_token:
        return True

    auth_header = request.headers.get("Authorization", "")
    bearer_token = ""
    if auth_header.lower().startswith("bearer "):
        bearer_token = auth_header.split(" ", 1)[1].strip()

    header_token = request.headers.get("X-Copernicus-Token", "").strip()
    return expected_token in {bearer_token, header_token}


@webhooks_bp.post("/webhooks/copernicus")
def ingest_copernicus_webhook():
    if not _is_request_authorized():
        return jsonify({"error": "Unauthorized webhook request."}), 401

    payload = request.get_json(silent=True) or {}
    events = payload.get("events")
    if events is None:
        events = payload if isinstance(payload, list) else [payload]

    if not isinstance(events, list) or len(events) == 0:
        return jsonify({"error": "No events found in webhook payload."}), 400

    supabase = get_supabase_client()
    ingested = []
    errors = []

    for index, event in enumerate(events):
        try:
            if not isinstance(event, dict):
                raise ValidationError("event must be a JSON object")

            latitude = parse_float(event.get("latitude"), f"events[{index}].latitude", -90.0, 90.0)
            longitude = parse_float(event.get("longitude"), f"events[{index}].longitude", -180.0, 180.0)
            severity = parse_float(event.get("severity", 0.5), f"events[{index}].severity", 0.0, 1.0)
            confidence_score = parse_optional_float(
                event.get("confidence_score"),
                f"events[{index}].confidence_score",
                0.0,
                1.0,
            )

            source = str(event.get("source", "copernicus-model")).strip().lower()
            anomaly_type = str(event.get("anomaly_type", "other")).strip().lower()
            predicted_at = parse_optional_datetime(event.get("predicted_at"), f"events[{index}].predicted_at")
            valid_until = parse_optional_datetime(event.get("valid_until"), f"events[{index}].valid_until")

            rpc_payload = {
                "p_source": source,
                "p_anomaly_type": anomaly_type,
                "p_lat": latitude,
                "p_lon": longitude,
                "p_severity": severity,
                "p_confidence_score": confidence_score,
                "p_predicted_at": predicted_at,
                "p_valid_until": valid_until,
                "p_payload": event.get("payload", event),
                "p_created_by": "copernicus-webhook",
            }

            rpc_result = supabase.rpc("upsert_copernicus_anomaly", rpc_payload).execute()
            ingested.append(
                {
                    "event_index": index,
                    "anomaly_id": rpc_result.data,
                    "source": source,
                    "anomaly_type": anomaly_type,
                }
            )
        except ValidationError as exc:
            errors.append({"event_index": index, "error": str(exc)})
        except Exception:
            current_app.logger.exception("Failed to ingest Copernicus event")
            errors.append({"event_index": index, "error": "Persistence failure"})

    if ingested and errors:
        status_code = 207
    elif ingested:
        status_code = 202
    else:
        status_code = 400

    return (
        jsonify(
            {
                "received_events": len(events),
                "ingested_count": len(ingested),
                "error_count": len(errors),
                "ingested": ingested,
                "errors": errors,
            }
        ),
        status_code,
    )