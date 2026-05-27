import json
from app.models.schemas import SegmentType

_DEFAULT_THRESHOLDS = {"A": 9, "B": 7, "C": 5}


def score_to_segment(score: int, thresholds: dict | None = None) -> SegmentType:
    """Map a 1-10 score to a segment label per CLAUDE.md invariants.

    thresholds: optional dict with keys A, B, C (int). Falls back to 9/7/5.
    """
    t = thresholds or _DEFAULT_THRESHOLDS
    if score >= t.get("A", 9):
        return "A"
    elif score >= t.get("B", 7):
        return "B"
    elif score >= t.get("C", 5):
        return "C"
    else:
        return "D"


def parse_thresholds(raw: str | None) -> dict | None:
    """Parse JSON threshold string from app_settings. Returns None on any error."""
    if not raw:
        return None
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None
        result: dict = {}
        for key in ("A", "B", "C"):
            val = data.get(key)
            if isinstance(val, (int, float)):
                result[key] = max(1, min(10, int(val)))
        if len(result) != 3:
            return None
        # Enforce A > B > C — out-of-order thresholds silently break segmentation
        if not (result["A"] > result["B"] > result["C"]):
            return None
        return result
    except Exception:
        return None
