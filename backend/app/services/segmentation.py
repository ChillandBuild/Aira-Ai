from app.models.schemas import SegmentType

def score_to_segment(score: int) -> SegmentType:
    """Map a 1-10 score to a segment label per CLAUDE.md invariants."""
    if score >= 9:
        return "A"   # Hot / High Intent
    elif score >= 7:
        return "B"   # Warm / In Discussion
    elif score >= 5:
        return "C"   # Cold / General inquiry
    else:
        return "D"   # Disqualified / Not interested
