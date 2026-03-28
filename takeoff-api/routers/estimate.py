"""
Estimate endpoints — generate estimates for existing homes from an address.
"""

import base64
import json
import os
import tempfile
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models import LineItem
from property_lookup import (
    lookup_property,
    fetch_property_images,
    classify_roof_material,
    _load_api_keys,
)
from model_from_address import build_model, load_era_config, find_era
from calc_drywall import calculate_drywall
from calc_roofing import calculate_roofing
from run_existing_home import (
    _build_insulation_scope,
    _build_code_requirements_notes,
    _build_current_conditions,
    _build_roof_info,
    _load_costs,
)

router = APIRouter()


class EstimateRequest(BaseModel):
    address: str
    climate_zone: str = "5B"


class EstimateResponse(BaseModel):
    line_items: list[dict]
    property_data: dict
    notes: list[dict]  # [{"title": str, "lines": [str]}]
    insulation_notes: list[dict]
    assumptions: list[str]
    images: dict[str, Optional[str]]  # base64-encoded data URLs
    roof_classification: dict


def _encode_image(path: str) -> Optional[str]:
    """Read an image file and return a base64 data URL, or None."""
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path, "rb") as f:
            raw = f.read()
        # Detect format from magic bytes
        if raw[:8] == b'\x89PNG\r\n\x1a\n':
            mime = "image/png"
        elif raw[:2] == b'\xff\xd8':
            mime = "image/jpeg"
        else:
            mime = "image/jpeg"  # fallback
        return f"data:{mime};base64,{base64.b64encode(raw).decode()}"
    except Exception:
        return None


def _notes_to_dicts(notes: list[tuple[str, list[str]]]) -> list[dict]:
    """Convert (title, lines) tuples to JSON-safe dicts."""
    return [{"title": title, "lines": lines} for title, lines in notes]


@router.post("/from-address", response_model=EstimateResponse)
async def estimate_from_address(req: EstimateRequest):
    """
    Generate a full insulation, drywall & gutter estimate for an existing home
    using only its street address.

    Pipeline: geocode → property lookup → era heuristics → BuildingModel →
    calculators → images → roof classification → notes → response.
    """
    address = req.address.strip()
    climate_zone = req.climate_zone.strip() or "5B"

    if not address:
        raise HTTPException(status_code=400, detail="Address is required")

    # ── Step 1: Lookup property data ──────────────────────────────────
    try:
        prop = lookup_property(address)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Property lookup failed: {e}")

    if not prop.lat and not prop.lng:
        raise HTTPException(
            status_code=400,
            detail="Could not geocode address. Please check the address and try again.",
        )

    # ── Step 2: Load configs ──────────────────────────────────────────
    try:
        costs = _load_costs()
        era_config = load_era_config()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load config: {e}")

    # ── Step 3: Generate BuildingModel ────────────────────────────────
    try:
        model, assumptions = build_model(prop, era_config, costs, climate_zone)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model generation failed: {e}")

    # ── Step 4: Run calculators ───────────────────────────────────────
    try:
        ins_items = _build_insulation_scope(model, era_config, climate_zone)
        dw_items = calculate_drywall(model, costs)
        rtg_items = calculate_roofing(model, costs)
        gut_items = [it for it in rtg_items if it.trade == "gutters"]
        all_items = ins_items + dw_items + gut_items
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Calculator error: {e}")

    # ── Step 5: Fetch images + classify roof ──────────────────────────
    images_b64: dict[str, Optional[str]] = {
        "street_view": None,
        "satellite": None,
    }
    roof_classification: dict = {}

    try:
        keys = _load_api_keys()
        tmp_dir = tempfile.mkdtemp(prefix="takeoff_images_")
        image_paths = fetch_property_images(
            prop.lat, prop.lng, address,
            keys.get("google_api_key", ""), tmp_dir,
        )
        for key, path in image_paths.items():
            images_b64[key] = _encode_image(path)

        # Classify roof from satellite
        if image_paths.get("satellite"):
            roof_classification = classify_roof_material(
                image_paths["satellite"],
                keys.get("anthropic_api_key", ""),
            ) or {}
            if roof_classification.get("material"):
                prop.roof_material = roof_classification["material"]
                prop.sources["roof_material"] = "claude_vision"
    except Exception:
        # Images are optional — don't fail the whole estimate
        pass

    # ── Step 6: Build notes ───────────────────────────────────────────
    era = find_era(prop.year_built or 1975, era_config["eras"])

    summary_lines = []
    summary_lines.append(f"Address: {prop.address}")
    summary_lines.append(f"Year Built: {prop.year_built or 'Unknown (estimated ~1975)'}")
    summary_lines.append(f"Above-Grade SF: {prop.total_sqft:,.0f}" if prop.total_sqft else "Above-Grade SF: Unknown")
    summary_lines.append(f"Stories: {prop.stories}")
    summary_lines.append(f"Bedrooms: {prop.bedrooms}, Bathrooms: {prop.bathrooms}")
    if prop.basement and prop.basement != "none":
        bsmt_detail = f"{prop.basement} basement"
        if prop.basement_sqft:
            bsmt_detail += f" ({prop.basement_sqft:,.0f} SF)"
        summary_lines.append(f"Foundation: {bsmt_detail}")
    else:
        summary_lines.append(f"Foundation: {assumptions[-1] if assumptions else 'Unknown'}")
    if prop.total_value:
        summary_lines.append(f"Assessed Value: ${prop.total_value:,.0f}")

    roof_lines = _build_roof_info(prop, era, roof_classification)
    code_lines = _build_code_requirements_notes(era_config, climate_zone)

    property_notes = [
        ("Property Summary", summary_lines),
        ("Roof Information", roof_lines),
    ]
    insulation_notes = [
        ("Property Summary", summary_lines),
        ("Building Code Requirements", code_lines),
        ("Roof Information", roof_lines),
    ]

    # ── Step 7: Build property data dict ──────────────────────────────
    property_data = {
        "address": prop.address,
        "lat": prop.lat,
        "lng": prop.lng,
        "year_built": prop.year_built,
        "total_sqft": prop.total_sqft,
        "stories": prop.stories,
        "bedrooms": prop.bedrooms,
        "bathrooms": prop.bathrooms,
        "basement": prop.basement or "unknown",
        "basement_sqft": prop.basement_sqft or 0,
        "foundation_type": prop.foundation_type or "unknown",
        "roof_type": prop.roof_type or "unknown",
        "roof_material": prop.roof_material or "unknown",
        "total_value": prop.total_value or 0,
        "land_value": prop.land_value or 0,
        "improvement_value": prop.improvement_value or 0,
        "sources": prop.sources,
        "warnings": prop.warnings,
    }

    # ── Step 8: Serialize and return ──────────────────────────────────
    return EstimateResponse(
        line_items=[item.to_dict() for item in all_items],
        property_data=property_data,
        notes=_notes_to_dicts(property_notes),
        insulation_notes=_notes_to_dicts(insulation_notes),
        assumptions=assumptions,
        images=images_b64,
        roof_classification=roof_classification,
    )
