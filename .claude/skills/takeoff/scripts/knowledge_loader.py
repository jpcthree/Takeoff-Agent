"""
Knowledge Base Loader for Construction Takeoff Agent

Loads trade-specific knowledge from markdown files and generates
context-aware notes for estimate exports.
"""

from __future__ import annotations

import os
import re
from typing import Any

# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------

_KNOWLEDGE_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "knowledge")
)

_TRADE_FILES = {
    "insulation": "insulation.md",
    "drywall": "drywall.md",
    "roofing": "roofing_gutters.md",
    "gutters": "roofing_gutters.md",
    "roofing_gutters": "roofing_gutters.md",
}

_BUILDING_SCIENCE_FILE = "_building_science.md"


# ---------------------------------------------------------------------------
# Markdown parsing helpers
# ---------------------------------------------------------------------------

def _read_file(filename: str) -> str:
    path = os.path.join(_KNOWLEDGE_DIR, filename)
    if not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _split_sections(text: str) -> dict[str, str]:
    """Split markdown text into {section_title: content} by H2 headers."""
    sections: dict[str, str] = {}
    current_title = ""
    current_lines: list[str] = []

    for line in text.splitlines():
        if line.startswith("## "):
            if current_title:
                sections[current_title] = "\n".join(current_lines).strip()
            current_title = line[3:].strip()
            current_lines = []
        else:
            current_lines.append(line)

    if current_title:
        sections[current_title] = "\n".join(current_lines).strip()
    return sections


def _extract_bullets(text: str) -> list[str]:
    """Extract top-level bullet items from markdown text."""
    bullets: list[str] = []
    current = ""
    for line in text.splitlines():
        if line.startswith("- "):
            if current:
                bullets.append(current.strip())
            current = line[2:].strip()
        elif line.startswith("  ") and current:
            current += " " + line.strip()
        elif not line.strip():
            if current:
                bullets.append(current.strip())
                current = ""
    if current:
        bullets.append(current.strip())
    return bullets


def _extract_subsection(text: str, zone_key: str) -> list[str]:
    """Extract bullets from an H3 subsection matching zone_key."""
    pattern = rf"###\s+.*{re.escape(zone_key)}.*?\n(.*?)(?=\n###|\Z)"
    match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    if not match:
        return []
    return _extract_bullets(match.group(1))


def _clean_markdown(text: str) -> str:
    """Strip bold markers and other formatting for clean note output."""
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"\*(.*?)\*", r"\1", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def load_trade_knowledge(trade: str) -> dict[str, Any]:
    """Load and parse a trade knowledge file.

    Returns dict with keys:
        best_practices: list[str]
        alternatives: list[str]
        upsells: list[str]
        lessons: list[str]
        gotchas: list[str]
        climate_considerations: str (raw section text for zone filtering)
        raw_sections: dict[str, str]
    """
    filename = _TRADE_FILES.get(trade.lower(), "")
    if not filename:
        return {}

    text = _read_file(filename)
    if not text:
        return {}

    sections = _split_sections(text)
    return {
        "best_practices": _extract_bullets(sections.get("Best Practices", "")),
        "alternatives": _extract_bullets(sections.get("Common Alternatives", "")),
        "upsells": _extract_bullets(sections.get("Upsell Opportunities", "")),
        "lessons": _extract_bullets(sections.get("Lessons Learned", "")),
        "gotchas": _extract_bullets(sections.get("Gotchas & Common Mistakes", "")),
        "climate_considerations": sections.get("Climate Zone Considerations", ""),
        "raw_sections": sections,
    }


def load_building_science() -> dict[str, str]:
    """Load the shared building science knowledge file."""
    text = _read_file(_BUILDING_SCIENCE_FILE)
    return _split_sections(text) if text else {}


def get_climate_notes(trade: str, climate_zone: str) -> list[str]:
    """Get climate-zone-specific notes for a trade.

    climate_zone: e.g. "5B", "4A", "6". Matches on the zone number.
    """
    kb = load_trade_knowledge(trade)
    climate_text = kb.get("climate_considerations", "")
    if not climate_text:
        return []

    # Extract the zone number (e.g., "5" from "5B")
    zone_num = re.match(r"(\d+)", climate_zone)
    if not zone_num:
        return []

    return _extract_subsection(climate_text, f"Zone {zone_num.group(1)}")


# ---------------------------------------------------------------------------
# Smart note generation
# ---------------------------------------------------------------------------

def generate_smart_notes(
    trades: list[str],
    climate_zone: str = "",
    building: Any = None,
    line_items: list | None = None,
) -> list[tuple[str, list[str]]]:
    """Generate context-aware notes for the estimate export.

    Returns notes in the (section_title, [bullets]) format that
    export_xlsx._write_notes() already consumes.

    Args:
        trades: List of trade names included in the estimate (e.g., ["insulation", "drywall", "gutters"])
        climate_zone: Project climate zone (e.g., "5B")
        building: Optional BuildingModel for context-aware filtering
        line_items: Optional list of LineItem objects for context
    """
    notes: list[tuple[str, list[str]]] = []

    # Collect knowledge across all trades
    all_upsells: list[str] = []
    all_climate: list[str] = []
    all_best_practices: list[str] = []
    all_gotchas: list[str] = []

    for trade in trades:
        kb = load_trade_knowledge(trade)
        if not kb:
            continue

        # --- Upsell opportunities ---
        upsells = kb.get("upsells", [])
        # Filter: only include upsells relevant to the project context
        filtered_upsells = _filter_upsells(upsells, trade, building, line_items)
        all_upsells.extend(filtered_upsells)

        # --- Climate zone considerations ---
        if climate_zone:
            zone_notes = get_climate_notes(trade, climate_zone)
            all_climate.extend(zone_notes)

        # --- Best practices (select top relevant ones, not all) ---
        practices = kb.get("best_practices", [])
        selected = _select_relevant_practices(practices, trade, building, line_items)
        all_best_practices.extend(selected)

        # --- Gotchas relevant to this project ---
        gotchas = kb.get("gotchas", [])
        relevant = _filter_gotchas(gotchas, trade, building, line_items)
        all_gotchas.extend(relevant)

    # Build the note sections
    if all_upsells:
        cleaned = [_clean_markdown(u) for u in all_upsells]
        notes.append(("Recommendations", cleaned))

    if all_climate:
        zone_label = climate_zone or "Project"
        cleaned = [_clean_markdown(c) for c in all_climate]
        notes.append((f"Climate Zone {zone_label} Considerations", cleaned))

    if all_best_practices:
        cleaned = [_clean_markdown(p) for p in all_best_practices]
        notes.append(("Best Practices Included", cleaned))

    if all_gotchas:
        cleaned = [_clean_markdown(g) for g in all_gotchas]
        notes.append(("Watch Items", cleaned))

    return notes


# ---------------------------------------------------------------------------
# Filtering helpers — make notes contextual, not generic
# ---------------------------------------------------------------------------

def _filter_upsells(
    upsells: list[str], trade: str, building: Any, line_items: list | None
) -> list[str]:
    """Select upsell opportunities relevant to the project."""
    if not upsells:
        return []

    # Without building context, return top 3 upsells
    if building is None:
        return upsells[:3]

    selected: list[str] = []
    for u in upsells:
        ul = u.lower()

        # Skip upsells for things already in the estimate
        if line_items:
            item_descs = " ".join(i.description.lower() for i in line_items)
            # If upsell mentions spray foam and we already have spray foam, skip
            if "spray foam upgrade" in ul and "spray foam" in item_descs:
                continue
            if "gutter guard" in ul and "gutter guard" in item_descs:
                continue
            if "impact-resistant" in ul and "impact" in item_descs:
                continue

        selected.append(u)

    return selected[:4]  # Cap at 4 to keep notes focused


def _select_relevant_practices(
    practices: list[str], trade: str, building: Any, line_items: list | None
) -> list[str]:
    """Select the most relevant best practices (not all — keep it focused)."""
    if not practices:
        return []

    # Pick practices most likely to be actionable for this project
    selected: list[str] = []
    for p in practices:
        pl = p.lower()

        # Always include fire-rating and air-sealing practices
        if any(kw in pl for kw in ["fire-rated", "fire rating", "air seal", "kick-out"]):
            selected.append(p)
            continue

        # Include rim joist practice for insulation
        if trade == "insulation" and "rim joist" in pl:
            selected.append(p)
            continue

        # Include ceiling-before-walls for drywall
        if trade == "drywall" and "ceiling" in pl and "before" in pl:
            selected.append(p)
            continue

        # Include drainage-related for flat roofs
        if trade in ("roofing", "gutters", "roofing_gutters"):
            if building and getattr(building, "roof_sections", []):
                # Check if any roof section has low pitch (flat roof)
                for rs in building.roof_sections:
                    pitch = getattr(rs, "pitch", 0)
                    if pitch <= 2 and any(kw in pl for kw in ["drainage", "scupper", "flat"]):
                        selected.append(p)
                        break

    return selected[:3]  # Cap at 3


def _filter_gotchas(
    gotchas: list[str], trade: str, building: Any, line_items: list | None
) -> list[str]:
    """Select gotchas relevant to this specific project."""
    if not gotchas:
        return []

    selected: list[str] = []
    for g in gotchas:
        gl = g.lower()

        # Always flag fire separation gotchas
        if "fire separation" in gl or "garage" in gl:
            if building and any("garage" in getattr(r, "name", "").lower()
                               for r in getattr(building, "rooms", [])):
                selected.append(g)
                continue

        # Flag flat roof gotchas
        if "flat roof" in gl and building:
            if any(getattr(rs, "pitch", 4) <= 2
                   for rs in getattr(building, "roof_sections", [])):
                selected.append(g)
                continue

        # Flag expansion joint gotchas for Denver/altitude
        if "expansion" in gl:
            cz = getattr(building, "climate_zone", "") if building else ""
            if "5B" in cz or "denver" in cz.lower():
                selected.append(g)
                continue

    return selected[:3]  # Cap at 3
