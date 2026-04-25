from datetime import datetime
from uuid import UUID


class ValidationError(ValueError):
    pass


def require_fields(payload: dict, fields: list[str]) -> None:
    missing_fields = [field for field in fields if payload.get(field) in (None, "")]
    if missing_fields:
        raise ValidationError(f"Missing required fields: {', '.join(missing_fields)}")


def parse_uuid(value: str, field_name: str) -> str:
    try:
        return str(UUID(str(value)))
    except Exception as exc:
        raise ValidationError(f"{field_name} must be a valid UUID.") from exc


def parse_float(
    value,
    field_name: str,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{field_name} must be numeric.") from exc

    if minimum is not None and parsed < minimum:
        raise ValidationError(f"{field_name} must be >= {minimum}.")
    if maximum is not None and parsed > maximum:
        raise ValidationError(f"{field_name} must be <= {maximum}.")

    return parsed


def parse_optional_float(
    value,
    field_name: str,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float | None:
    if value in (None, ""):
        return None
    return parse_float(value, field_name, minimum, maximum)


def parse_optional_datetime(value, field_name: str) -> str | None:
    if value in (None, ""):
        return None

    if isinstance(value, datetime):
        return value.isoformat()

    if isinstance(value, str):
        normalized = value.strip().replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized).isoformat()
        except ValueError as exc:
            raise ValidationError(f"{field_name} must be ISO-8601 datetime.") from exc

    raise ValidationError(f"{field_name} must be ISO-8601 datetime.")