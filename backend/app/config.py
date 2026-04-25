import os


def _parse_origins(raw_value: str) -> list[str]:
    if not raw_value:
        return ["*"]

    origins = [origin.strip() for origin in raw_value.split(",") if origin.strip()]
    return origins or ["*"]


def _parse_bbox(raw_value: str) -> tuple[float, float, float, float]:
    default_bbox = (8.0, 42.0, 30.0, 50.0)
    if not raw_value:
        return default_bbox

    try:
        parts = [float(part.strip()) for part in raw_value.split(",")]
    except ValueError:
        return default_bbox

    if len(parts) != 4:
        return default_bbox

    min_lon, min_lat, max_lon, max_lat = parts
    if min_lon >= max_lon or min_lat >= max_lat:
        return default_bbox

    return min_lon, min_lat, max_lon, max_lat


class Config:
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    DEBUG = FLASK_ENV == "development"

    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    COPERNICUS_WEBHOOK_TOKEN = os.getenv("COPERNICUS_WEBHOOK_TOKEN", "")
    REPORT_TOKEN_REWARD = int(os.getenv("REPORT_TOKEN_REWARD", "10"))

    CORS_ALLOW_ORIGINS = _parse_origins(os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000"))
    DEFAULT_BBOX = _parse_bbox(os.getenv("DEFAULT_BBOX", "8.0,42.0,30.0,50.0"))