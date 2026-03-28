#!/usr/bin/env python3
"""
run_existing_home.py — Generate insulation, drywall & gutter estimates
for an existing home using only its address.

Usage:
    python run_existing_home.py "1234 Main St, Denver, CO 80204"
    python run_existing_home.py "1234 Main St, Denver, CO 80204" --climate-zone 5B
"""
from __future__ import annotations

import json
import os
import sys

# Ensure scripts/ is on the path
sys.path.insert(0, os.path.dirname(__file__))

from property_lookup import lookup_property, fetch_property_images, classify_roof_material, PropertyData, _load_api_keys
from model_from_address import build_model, load_era_config
from calc_drywall import calculate_drywall
from calc_roofing import calculate_roofing
from export_xlsx import export_estimate
from models import LineItem

# ── Config paths ────────────────────────────────────────────────────────────
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
_CONFIG_DIR = os.path.join(_ROOT, "config")
_COSTS_FILE = os.path.join(_CONFIG_DIR, "default_costs.json")


def _load_costs() -> dict:
    with open(_COSTS_FILE) as f:
        return json.load(f)


def _safe_filename(address: str) -> str:
    """Convert address to a safe filename."""
    safe = address.replace(",", "").replace(".", "").replace("#", "")
    safe = "_".join(safe.split())
    return safe[:50]


def _load_code_requirements(era_config: dict, climate_zone: str) -> dict:
    """Load code requirements for the given climate zone from era_config."""
    zone_num = climate_zone[0] if climate_zone else "5"
    code_reqs = era_config.get("code_requirements", {})
    return code_reqs.get(zone_num, code_reqs.get("5", {}))


def _build_insulation_scope(model, era_config: dict = None, climate_zone: str = "5B") -> list[LineItem]:
    """
    Build measurement-only insulation line items from the BuildingModel.

    No product types, no pricing — just the scope areas for each insulation
    section with applicable building code R-value requirements.
    The contractor fills in product and pricing.
    """
    items = []
    code = _load_code_requirements(era_config or {}, climate_zone) if era_config else {}

    # ── Exterior Walls ────────────────────────────────────────────────
    ext_walls = [w for w in model.walls if w.wall_type == "exterior" and w.floor > 0]
    if ext_walls:
        total_sf = sum(w.length.total_feet * w.height.total_feet for w in ext_walls)
        # Subtract openings
        opening_sf = sum(
            o.width.total_feet * o.height.total_feet * o.quantity
            for o in model.openings
        )
        net_sf = max(total_sf - opening_sf, 0)
        framing = ext_walls[0].thickness if ext_walls else "2x4"
        items.append(LineItem(
            trade="insulation",
            category="Exterior Walls",
            description=f"Exterior wall cavities ({framing} framing) — net of openings",
            quantity=round(net_sf, 1),
            unit="sf",
            code_requirement=code.get("exterior_walls", {}).get("r_value", ""),
        ))

    # ── Attic / Ceiling ───────────────────────────────────────────────
    if getattr(model, "has_attic", False) and model.attic_area > 0:
        items.append(LineItem(
            trade="insulation",
            category="Attic / Ceiling",
            description="Attic floor area (insulate from above or below)",
            quantity=round(model.attic_area, 1),
            unit="sf",
            code_requirement=code.get("attic_ceiling", {}).get("r_value", ""),
        ))
    elif getattr(model, "has_cathedral_ceiling", False):
        roof_sf = sum(rs.horizontal_area for rs in model.roof_sections)
        if roof_sf > 0:
            items.append(LineItem(
                trade="insulation",
                category="Attic / Ceiling",
                description="Roof deck / cathedral ceiling (no accessible attic)",
                quantity=round(roof_sf, 1),
                unit="sf",
                code_requirement=code.get("cathedral_ceiling", {}).get("r_value", ""),
            ))

    # ── Basement Walls ────────────────────────────────────────────────
    bsmt_walls = [w for w in model.walls if w.wall_type == "exterior" and w.floor == 0]
    if bsmt_walls:
        total_sf = sum(w.length.total_feet * w.height.total_feet for w in bsmt_walls)
        items.append(LineItem(
            trade="insulation",
            category="Basement Walls",
            description="Basement wall area (full perimeter × height)",
            quantity=round(total_sf, 1),
            unit="sf",
            code_requirement=code.get("basement_walls", {}).get("r_value", ""),
        ))

    # ── Crawlspace ────────────────────────────────────────────────────
    if model.crawlspace_area > 0:
        # Crawlspace walls first
        if model.crawlspace_perimeter > 0:
            cs_ht = model.crawlspace_height.total_feet
            wall_sf = model.crawlspace_perimeter * cs_ht
            items.append(LineItem(
                trade="insulation",
                category="Crawlspace Walls",
                description=f"Crawlspace perimeter walls ({cs_ht:.1f}' height × {model.crawlspace_perimeter:.0f} LF perimeter)",
                quantity=round(wall_sf, 1),
                unit="sf",
                code_requirement=code.get("crawlspace_walls", {}).get("r_value", ""),
            ))
        # Crawlspace floor — vapor barrier (Class I vapor retarder per IRC 408.2)
        items.append(LineItem(
            trade="insulation",
            category="Crawlspace Floor",
            description="Crawlspace floor vapor barrier (6 mil poly minimum, 6\" laps, sealed seams)",
            quantity=round(model.crawlspace_area, 1),
            unit="sf",
            code_requirement="6 mil poly min (IRC 408.2)",
        ))

    # ── Rim / Band Joist ──────────────────────────────────────────────
    if model.rim_joist_perimeter > 0:
        rj_height_ft = model.rim_joist_height / 12.0  # stored in inches
        rj_sf = model.rim_joist_perimeter * rj_height_ft
        items.append(LineItem(
            trade="insulation",
            category="Rim Joist",
            description=f"Rim/band joist ({model.rim_joist_perimeter:.0f} LF × {model.rim_joist_height:.1f}\" height)",
            quantity=round(rj_sf, 1),
            unit="sf",
            code_requirement=code.get("rim_joist", {}).get("r_value", ""),
        ))

    # ── Interior Walls (Sound) ────────────────────────────────────────
    int_walls = [w for w in model.walls if w.wall_type == "interior"]
    if int_walls:
        total_sf = sum(w.length.total_feet * w.height.total_feet for w in int_walls)
        items.append(LineItem(
            trade="insulation",
            category="Interior Walls",
            description="Interior partition walls (sound insulation)",
            quantity=round(total_sf, 1),
            unit="sf",
            code_requirement="No minimum",
        ))

    return items


def _print_trade(name: str, items: list):
    """Print a trade summary to console."""
    print(f"\n{'=' * 80}")
    print(f"  {name.upper()}")
    print(f"{'=' * 80}")
    total_mat = 0.0
    total_labor = 0.0
    current_cat = ""
    for it in items:
        if it.category != current_cat:
            if current_cat:
                print()
            current_cat = it.category
            print(f"\n  ── {current_cat} {'─' * max(1, 60 - len(current_cat))}")
        total_mat += it.material_total
        total_labor += it.labor_total
        sheets_note = f" ({it.sheets} sheets)" if getattr(it, "sheets", 0) > 0 else ""
        print(
            f"    {it.description[:55]:55s} | qty={it.quantity:8.1f} {it.unit:5s}"
            f"{sheets_note}"
            f" | mat=${it.material_total:9.2f} | labor=${it.labor_total:9.2f}"
        )
    print(f"\n  {'─' * 76}")
    print(f"  {name} Material:  ${total_mat:>10,.2f}")
    print(f"  {name} Labor:     ${total_labor:>10,.2f}")
    print(f"  {name} TOTAL:     ${total_mat + total_labor:>10,.2f}")
    print(f"  Line items:        {len(items)}")


def main(address: str, climate_zone: str = "5B"):
    """End-to-end pipeline: address → XLSX estimate."""

    print(f"\n{'#' * 80}")
    print(f"  EXISTING HOME ESTIMATE")
    print(f"  {address}")
    print(f"  Climate Zone: {climate_zone}")
    print(f"{'#' * 80}\n")

    # ── Step 1: Lookup property data ────────────────────────────────────
    print("Step 1: Looking up property data...\n")
    prop = lookup_property(address)

    if not prop.lat and not prop.lng:
        print("\nERROR: Could not geocode address. Aborting.")
        sys.exit(1)

    # ── Step 2: Load configs ────────────────────────────────────────────
    print("\nStep 2: Loading cost data and era defaults...")
    costs = _load_costs()
    era_config = load_era_config()

    # ── Step 3: Generate BuildingModel ──────────────────────────────────
    print("Step 3: Generating building model from heuristics...\n")
    model, assumptions = build_model(prop, era_config, costs, climate_zone)

    print(f"  Model generated:")
    print(f"    Walls:         {len(model.walls)}")
    print(f"    Rooms:         {len(model.rooms)}")
    print(f"    Openings:      {len(model.openings)}")
    print(f"    Roof sections: {len(model.roof_sections)}")
    print(f"    Gutter runs:   {len(model.gutter_runs)}")
    print(f"    Assumptions:   {len(assumptions)}")

    # ── Step 4: Run calculators ─────────────────────────────────────────
    print("\nStep 4: Running calculators...")
    ins_items = _build_insulation_scope(model, era_config, climate_zone)
    dw_items = calculate_drywall(model, costs)
    rtg_items = calculate_roofing(model, costs)
    gut_items = [it for it in rtg_items if it.trade == "gutters"]

    all_items = ins_items + dw_items + gut_items

    # ── Step 5: Print results ───────────────────────────────────────────
    _print_trade("Insulation Scope", ins_items)
    _print_trade("Drywall", dw_items)
    _print_trade("Gutters", gut_items)

    total_mat = sum(it.material_total for it in all_items)
    total_labor = sum(it.labor_total for it in all_items)
    print(f"\n{'=' * 80}")
    print(f"  GRAND TOTAL Material:  ${total_mat:>10,.2f}")
    print(f"  GRAND TOTAL Labor:     ${total_labor:>10,.2f}")
    print(f"  GRAND TOTAL:           ${total_mat + total_labor:>10,.2f}")
    print(f"  Total line items:      {len(all_items)}")
    print(f"{'=' * 80}")

    # ── Step 6: Fetch images & classify roof ────────────────────────────
    output_dir = os.path.expanduser("~/Downloads")
    safe_name = _safe_filename(address)

    print(f"\nStep 6: Fetching property images...")
    keys = _load_api_keys()
    img_dir = os.path.join(output_dir, f"Existing_Home_{safe_name}_images")
    images = fetch_property_images(
        prop.lat, prop.lng, address,
        keys.get("google_api_key", ""), img_dir,
    )
    for img_type, img_path in images.items():
        if img_path:
            print(f"    {img_type}: {img_path}")
        else:
            print(f"    {img_type}: not available")

    # Classify roof material from satellite image using Claude Vision
    roof_classification = {}
    if images.get("satellite"):
        print(f"\n  Analyzing roof material from satellite image...")
        roof_classification = classify_roof_material(
            images["satellite"],
            keys.get("anthropic_api_key", ""),
        )
        if roof_classification:
            mat = roof_classification.get("material", "unknown")
            conf = roof_classification.get("confidence", "unknown")
            desc = roof_classification.get("description", "")
            cond = roof_classification.get("condition", "unknown")
            print(f"    Roof material: {mat} ({conf} confidence)")
            print(f"    Description:   {desc}")
            print(f"    Condition:     {cond}")
            # Update prop with vision-identified material
            prop.roof_material = mat
            prop.sources["roof_material"] = "claude_vision"
        else:
            print(f"    ✗ Could not classify roof (no API key or analysis failed)")
            print(f"      → Falling back to era-based estimate")

    # ── Step 7: Build notes ──────────────────────────────────────────────
    from model_from_address import find_era
    era = find_era(prop.year_built or 1975, era_config["eras"])

    # Try loading knowledge-base notes if available
    try:
        from knowledge_loader import generate_smart_notes
        kb_notes = generate_smart_notes(
            trades=["drywall", "gutters"],
            climate_zone=climate_zone,
            building=model,
            line_items=all_items,
        )
    except Exception:
        kb_notes = []

    # Property summary section
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
        if prop.land_value and prop.improvement_value:
            summary_lines.append(f"  Land: ${prop.land_value:,.0f} | Improvements: ${prop.improvement_value:,.0f}")

    # Current estimated conditions (insulation — in notes only, not tables)
    conditions_lines = _build_current_conditions(era, climate_zone, prop)

    # Roof information for gutter context — now with vision classification
    roof_lines = _build_roof_info(prop, era, roof_classification)

    # Building code requirements (insulation sheet only)
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

    # ── Step 8: Export XLSX ──────────────────────────────────────────────
    output_path = os.path.join(output_dir, f"Existing_Home_Estimate_{safe_name}.xlsx")

    print(f"\nStep 8: Exporting to XLSX...")
    export_estimate(
        all_items, output_path,
        project_name=f"Existing Home Estimate — {address}",
        notes=property_notes,
        insulation_notes=insulation_notes,
        images=images,
    )
    print(f"Spreadsheet saved: {output_path}")


def _build_code_requirements_notes(era_config: dict, climate_zone: str) -> list[str]:
    """Build a comprehensive building code requirements notes section."""
    code = _load_code_requirements(era_config, climate_zone)
    if not code:
        return [f"No building code data available for Climate Zone {climate_zone}."]

    lines = []
    code_name = code.get("code_name", "IECC")
    eff_date = code.get("effective_date", "")
    zone_num = climate_zone[0] if climate_zone else "5"

    lines.append(f"Applicable Code: {code_name} — Climate Zone {climate_zone}")
    if eff_date:
        lines.append(f"Effective Date: {eff_date}")
    lines.append("")

    # Assembly requirements table
    assemblies = [
        ("exterior_walls", "Exterior Walls"),
        ("attic_ceiling", "Attic / Ceiling"),
        ("cathedral_ceiling", "Cathedral / Vaulted Ceiling"),
        ("basement_walls", "Basement Walls"),
        ("crawlspace_walls", "Crawlspace Walls"),
        ("rim_joist", "Rim / Band Joist"),
        ("floors_over_unconditioned", "Floors Over Unconditioned Space"),
        ("slab_edge", "Slab Edge Perimeter"),
    ]
    for key, label in assemblies:
        entry = code.get(key, {})
        r_val = entry.get("r_value", "")
        if r_val:
            lines.append(f"  {label}: {r_val}")
            desc = entry.get("description", "")
            if desc:
                lines.append(f"    → {desc}")
            notes = entry.get("notes", "")
            if notes:
                lines.append(f"    Note: {notes}")

    # Air sealing
    air = code.get("air_sealing", {})
    if air:
        lines.append(f"  Air Sealing: {air.get('requirement', '')}")
        if air.get("description"):
            lines.append(f"    → {air['description']}")

    # Fenestration
    fen = code.get("fenestration", {})
    if fen:
        lines.append(f"  Windows: U-{fen.get('u_factor', 'N/A')}, SHGC {fen.get('shgc', 'N/A')}")
        if fen.get("description"):
            lines.append(f"    → {fen['description']}")

    # Renovation notes
    reno = code.get("renovation_notes", [])
    if reno:
        lines.append("")
        lines.append("Renovation & Retrofit Applicability:")
        for note in reno:
            lines.append(f"  • {note}")

    return lines


def _build_current_conditions(era: dict, climate_zone: str, prop) -> list[str]:
    """Build notes on estimated current insulation conditions based on era."""
    import math
    lines = []
    year = prop.year_built or 1975
    label = era.get("label", "Unknown")

    lines.append(f"Based on {label} era construction ({year}), typical conditions for this home:")
    lines.append("")

    # Wall insulation
    wall_r = era.get("wall_insulation_r", 0)
    wall_type = era.get("wall_insulation_type", "none")
    framing = era.get("wall_framing", "2x4")
    if wall_r == 0:
        lines.append(f"Walls ({framing}): No insulation — common for {label} era. Cavity is empty.")
    else:
        type_label = {"batt": "fiberglass batt", "blown": "blown-in cellulose", "spray_foam": "spray foam"}.get(wall_type, wall_type)
        lines.append(f"Walls ({framing}): R-{wall_r} {type_label} (may have been retrofitted — verify on-site)")

    # Attic insulation
    attic_r = era.get("attic_insulation_r", 0)
    attic_type = era.get("attic_insulation_type", "none")
    if attic_r == 0:
        lines.append("Attic: No insulation — common for pre-war homes")
    else:
        type_label = {"batt": "fiberglass batt", "blown": "blown-in cellulose", "spray_foam": "spray foam"}.get(attic_type, attic_type)
        lines.append(f"Attic: R-{attic_r} {type_label} (current code requires R-60 for Zone 5B)")

    # Basement walls
    bsmt_r = era.get("basement_wall_insulation_r", 0)
    if (prop.basement or "") in ("full", "partial"):
        if bsmt_r == 0:
            lines.append("Basement walls: No insulation — typical for this era")
        else:
            lines.append(f"Basement walls: R-{bsmt_r} (current code requires R-15 for Zone 5B)")

    # Windows
    win_type = era.get("window_type", "unknown")
    win_labels = {
        "single_pane_wood": "Single-pane wood — poor thermal performance (U≈1.0)",
        "single_pane_aluminum": "Single-pane aluminum — poor thermal performance, high condensation risk (U≈1.2)",
        "double_pane_aluminum": "Double-pane aluminum — moderate performance (U≈0.60)",
        "double_pane_vinyl": "Double-pane vinyl — decent performance (U≈0.45)",
        "double_pane_low_e": "Double-pane Low-E vinyl — good performance (U≈0.30)",
        "double_pane_low_e_argon": "Double-pane Low-E argon-filled — very good (U≈0.27)",
        "triple_pane_low_e_argon": "Triple-pane Low-E argon — excellent (U≈0.20)",
    }
    lines.append(f"Windows: {win_labels.get(win_type, win_type)}")

    # Air sealing
    if year < 1990:
        lines.append("Air sealing: Likely no systematic air barrier. Expect 8-15 ACH50 (blower door test recommended)")
    elif year < 2012:
        lines.append("Air sealing: Some air sealing practices. Expect 5-8 ACH50")
    else:
        lines.append("Air sealing: Modern air barrier. Expect 2-4 ACH50")

    lines.append("")
    lines.append("NOTE: These are era-based estimates. Actual conditions may vary significantly "
                 "due to previous renovations, retrofits, or deterioration. On-site inspection recommended.")

    return lines


def _build_roof_info(prop, era: dict, roof_classification: dict = None) -> list[str]:
    """Build roof information notes from Solar API data, vision classification, and era defaults."""
    import math
    lines = []

    # Roof material — prefer vision classification, fall back to era guess
    mat_labels = {
        "asphalt_shingle": "Asphalt Shingle",
        "metal_standing_seam": "Standing Seam Metal",
        "metal_corrugated": "Corrugated Metal",
        "clay_tile": "Clay Tile",
        "concrete_tile": "Concrete Tile",
        "wood_shake": "Wood Shake",
        "slate": "Slate",
        "flat_membrane_tpo": "Flat Membrane (TPO)",
        "flat_membrane_epdm": "Flat Membrane (EPDM)",
        "composite": "Composite / Synthetic",
        "metal": "Standing Seam Metal",
        "tile": "Clay/Concrete Tile",
        "flat_membrane": "Flat Membrane (TPO/EPDM)",
    }

    if roof_classification and roof_classification.get("material"):
        rc = roof_classification
        mat_key = rc["material"]
        mat_label = mat_labels.get(mat_key, mat_key.replace("_", " ").title())
        conf = rc.get("confidence", "unknown")
        lines.append(f"Roof material: {mat_label} — identified from satellite image ({conf} confidence)")
        if rc.get("description"):
            lines.append(f"  Visual: {rc['description']}")
        if rc.get("color"):
            lines.append(f"  Color: {rc['color']}")
        if rc.get("condition") and rc["condition"] != "unknown":
            cond_labels = {"good": "Good condition", "fair": "Fair — some wear visible", "poor": "Poor — significant wear/damage visible"}
            lines.append(f"  Condition: {cond_labels.get(rc['condition'], rc['condition'])}")
    else:
        mat = era.get("roof_material", "asphalt_shingle")
        lines.append(f"Roof material: {mat_labels.get(mat, mat)} (estimated from {era.get('label', 'era')} era)")

    # Roof style
    style = era.get("roof_style", "gable")
    lines.append(f"Roof style: {style.title()} (estimated from era)")

    # Pitch data from Google Solar
    if prop.solar_roof_segments:
        segs = prop.solar_roof_segments
        pitches_deg = [s["pitch_deg"] for s in segs]
        areas_m2 = [s["area_m2"] for s in segs]

        # Convert degrees to rise:12
        def deg_to_rise12(deg):
            return math.tan(math.radians(deg)) * 12

        pitches_12 = [deg_to_rise12(p) for p in pitches_deg]
        avg_pitch = sum(pitches_12) / len(pitches_12)
        min_pitch = min(pitches_12)
        max_pitch = max(pitches_12)
        total_sloped_sf = sum(a * 10.7639 for a in areas_m2)

        lines.append(f"")
        lines.append(f"Roof pitch (from Google Solar — {len(segs)} segments detected):")
        lines.append(f"  Average: {avg_pitch:.1f}:12 ({sum(pitches_deg)/len(pitches_deg):.1f} degrees)")
        lines.append(f"  Range: {min_pitch:.1f}:12 to {max_pitch:.1f}:12")
        lines.append(f"  Total sloped roof area: {total_sloped_sf:,.0f} SF")
        lines.append(f"")

        # Segment detail
        lines.append("Segment detail:")
        compass = {
            (337.5, 360): "N", (0, 22.5): "N",
            (22.5, 67.5): "NE", (67.5, 112.5): "E",
            (112.5, 157.5): "SE", (157.5, 202.5): "S",
            (202.5, 247.5): "SW", (247.5, 292.5): "W",
            (292.5, 337.5): "NW",
        }
        for i, seg in enumerate(segs):
            az = seg["azimuth_deg"]
            direction = "N"
            for (lo, hi), label in compass.items():
                if lo <= az < hi:
                    direction = label
                    break
            rise = deg_to_rise12(seg["pitch_deg"])
            area_sf = seg["area_m2"] * 10.7639
            lines.append(f"  Seg {i+1}: {rise:.1f}:12 pitch, facing {direction} ({az:.0f}°), {area_sf:,.0f} SF")
    else:
        default_pitch = era.get("roof_pitch", 6)
        lines.append(f"Roof pitch: {default_pitch}:12 (estimated from era — no Solar data available)")

    return lines


def _generate_upgrade_recommendations(era: dict, climate_zone: str, prop: PropertyData) -> list[str]:
    """Generate upgrade recommendations based on era vs current code."""
    recs = []
    zone_num = int(climate_zone[0]) if climate_zone else 5

    # Wall insulation upgrades
    current_r = era.get("wall_insulation_r", 0)
    if zone_num >= 5 and current_r < 20:
        if current_r == 0:
            recs.append(
                f"Walls have no insulation (pre-{era['label']} era). "
                f"Dense-pack cellulose retrofit (R-13 in existing 2x4 cavities) "
                f"is the most cost-effective upgrade — drill-and-fill from exterior."
            )
        elif current_r < 13:
            recs.append(
                f"Walls at R-{current_r} are below current code (R-20 or R-13+5ci for Zone {zone_num}). "
                f"Consider dense-pack cellulose to fill remaining cavity depth, "
                f"or exterior rigid insulation at re-siding."
            )
        else:
            recs.append(
                f"Walls at R-{current_r} — adding R-5 continuous exterior insulation "
                f"at next re-siding would meet current code (R-13+5ci)."
            )

    # Attic insulation upgrades
    attic_r = era.get("attic_insulation_r", 0)
    target_r = 60 if zone_num >= 5 else 49 if zone_num >= 4 else 38
    if attic_r < target_r:
        if attic_r == 0:
            recs.append(
                f"Attic has no insulation. Blown cellulose to R-{target_r} is the "
                f"highest-ROI upgrade for this home — typically 2-3 year payback."
            )
        elif attic_r < target_r * 0.6:
            recs.append(
                f"Attic at R-{attic_r} is well below current code (R-{target_r} for Zone {zone_num}). "
                f"Top-up with blown cellulose to R-{target_r} — cost-effective with excellent ROI."
            )
        else:
            recs.append(
                f"Attic at R-{attic_r} — consider topping up to R-{target_r} "
                f"with blown cellulose at next opportunity."
            )

    # Air sealing
    year = prop.year_built or 1975
    if year < 2006:
        recs.append(
            "Air sealing recommended — homes built before 2006 typically lack "
            "systematic air barrier. Blower door test + targeted sealing at "
            "rim joists, attic bypasses, and penetrations is highly cost-effective."
        )

    # Window upgrades
    if "single_pane" in era.get("window_type", ""):
        recs.append(
            "Single-pane windows identified. Upgrading to Low-E double-pane "
            "reduces heat loss by ~50% and significantly improves comfort. "
            "Consider storm windows as a lower-cost interim solution."
        )

    # Basement
    bsmt_r = era.get("basement_wall_insulation_r", 0)
    if (prop.basement or "").startswith("full") and bsmt_r < 10 and zone_num >= 5:
        recs.append(
            f"Basement walls at R-{bsmt_r} — current code requires R-15 for Zone {zone_num}. "
            f"Interior 2\" polyiso rigid + half-wall framing with R-13 batt is standard retrofit approach."
        )

    return recs


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Existing Home Estimate from Address")
    parser.add_argument("address", help="Full street address (e.g., '1234 Main St, Denver, CO 80204')")
    parser.add_argument("--climate-zone", default="5B", help="IECC climate zone (default: 5B for Denver)")
    args = parser.parse_args()

    main(args.address, args.climate_zone)
