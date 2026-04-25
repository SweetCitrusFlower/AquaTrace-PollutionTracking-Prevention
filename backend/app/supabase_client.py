from functools import lru_cache

from flask import current_app
from supabase import Client, create_client


@lru_cache(maxsize=8)
def _build_client(supabase_url: str, service_role_key: str) -> Client:
    return create_client(supabase_url, service_role_key)


def get_supabase_client() -> Client:
    supabase_url = current_app.config.get("SUPABASE_URL", "").rstrip("/")
    service_role_key = current_app.config.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_url or not service_role_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")

    return _build_client(supabase_url, service_role_key)