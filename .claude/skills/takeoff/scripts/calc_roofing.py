"""
Roofing & Gutters Trade Calculator

Calculates roofing materials (shingles, underlayment, flashing, etc.)
and gutter system components with per-run specs for size, style,
material, and color.
"""

from __future__ import annotations
import math
from models import BuildingModel, LineItem


WASTE_SHINGLES = 1.10
WASTE_FLASHING = 1.15
WASTE_GUTTERS = 1.05


def _lookup_cost(costs: dict, section: str, key: str, fallback: float = 0.0) -> float:
    return costs.get(section, {}).get(key, {}).get("cost", fallback)


def _labor_rate_roof(costs: dict) -> float:
    return costs.get("labor_rates", {}).get("roofer", 35.0)


def _labor_rate_gutter(costs: dict) -> float:
    return costs.get("labor_rates", {}).get("gutter_installer", 30.0)


def _item(trade, category, desc, qty, unit, unit_cost, labor_hrs, labor_rate) -> LineItem:
    li = LineItem(
        trade=trade, category=category, description=desc,
        quantity=round(qty, 2), unit=unit, material_unit_cost=unit_cost,
        labor_hours=round(labor_hrs, 2), labor_rate=labor_rate,
    )
    li.calculate_totals()
    return li


def _roofing_items(building: BuildingModel, costs: dict) -> list[LineItem]:
    items = []
    rate = _labor_rate_roof(costs)

    total_actual_area = 0.0
    total_eave = 0.0
    total_rake = 0.0
    total_ridge = 0.0
    total_hip = 0.0
    total_valley = 0.0

    for rs in building.roof_sections:
        area = rs.actual_area
        total_actual_area += area
        total_eave += rs.eave_length
        total_rake += rs.rake_length
        total_ridge += rs.ridge_length
        total_hip += rs.hip_length
        total_valley += rs.valley_length

    if total_actual_area <= 0:
        return items

    # Total roof area (informational line item)
    items.append(_item(
        "roofing", "Roof Area", f"Total roof area ({round(total_actual_area):,} SF)",
        total_actual_area, "sf", 0, 0, rate,
    ))

    # Shingles (3 bundles per square = 100 sqft)
    squares = total_actual_area / 100
    bundles = math.ceil(squares * 3 * WASTE_SHINGLES)
    items.append(_item(
        "roofing", "Shingles", "Architectural asphalt shingles (bundle)",
        bundles, "bundle", _lookup_cost(costs, "roofing", "shingle_architectural"),
        total_actual_area * 0.04, rate,
    ))

    # Underlayment (synthetic)
    rolls = math.ceil(total_actual_area / 1000 * WASTE_SHINGLES)
    items.append(_item(
        "roofing", "Underlayment", "Synthetic underlayment (roll)",
        rolls, "roll", _lookup_cost(costs, "roofing", "underlayment_synthetic"),
        rolls * 0.3, rate,
    ))

    # Ice and water shield (eave + valleys)
    ice_sqft = (total_eave * 3) + (total_valley * 3)
    if ice_sqft > 0:
        rolls_ice = math.ceil(ice_sqft / 65)
        items.append(_item(
            "roofing", "Ice & Water Shield", "Ice and water shield (roll)",
            rolls_ice, "roll", _lookup_cost(costs, "roofing", "ice_water_shield"),
            rolls_ice * 0.4, rate,
        ))

    # Drip edge
    drip_lf = total_eave + total_rake
    if drip_lf > 0:
        pieces = math.ceil(drip_lf / 10) * WASTE_FLASHING
        items.append(_item(
            "roofing", "Drip Edge", "Aluminum drip edge (10 ft)",
            pieces, "ea", _lookup_cost(costs, "roofing", "drip_edge"),
            drip_lf * 0.03, rate,
        ))

    # Starter strip
    if total_eave > 0:
        starter_bundles = math.ceil(total_eave / 100)
        items.append(_item(
            "roofing", "Starter Strip", "Starter strip shingles (bundle)",
            starter_bundles, "bundle",
            _lookup_cost(costs, "roofing", "shingle_architectural") * 0.6,
            total_eave * 0.01, rate,
        ))

    # Ridge cap
    if total_ridge > 0:
        ridge_bundles = math.ceil(total_ridge / 33)
        items.append(_item(
            "roofing", "Ridge Cap", "Ridge cap shingles (bundle)",
            ridge_bundles, "bundle",
            _lookup_cost(costs, "roofing", "shingle_architectural"),
            total_ridge * 0.03, rate,
        ))

    # Ridge vent
    if total_ridge > 0:
        vent_pieces = math.ceil(total_ridge / 4)
        items.append(_item(
            "roofing", "Ventilation", "Ridge vent (4 ft section)",
            vent_pieces, "ea", _lookup_cost(costs, "roofing", "ridge_vent"),
            total_ridge * 0.05, rate,
        ))

    # Pipe boots and flashing
    items.append(_item(
        "roofing", "Flashing", "Pipe boot flashing",
        3, "ea", _lookup_cost(costs, "roofing", "flashing_pipe_boot"),
        3 * 0.5, rate,
    ))

    # Step/chimney flashing
    items.append(_item(
        "roofing", "Flashing", "Step flashing kit",
        1, "ea", _lookup_cost(costs, "roofing", "flashing_step", 25.0),
        2.0, rate,
    ))

    # Valley flashing
    if total_valley > 0:
        items.append(_item(
            "roofing", "Flashing", "W-valley flashing (10 ft)",
            math.ceil(total_valley / 10 * WASTE_FLASHING), "ea",
            _lookup_cost(costs, "roofing", "flashing_valley", 20.0),
            total_valley * 0.05, rate,
        ))

    # Roofing nails
    nail_lbs = math.ceil(squares * 2)
    items.append(_item(
        "roofing", "Fasteners", "Roofing coil nails (lb)",
        nail_lbs, "lb", _lookup_cost(costs, "roofing", "roofing_nails", 2.0),
        0, rate,
    ))

    return items


def _gutter_cost_key(size: str, material: str) -> str:
    """Build cost key from gutter specs, e.g., 'gutter_5in_aluminum'."""
    size_label = size.replace("_inch", "in").replace("_", "")
    return f"gutter_{size_label}_{material}"


def _downspout_cost_key(size: str, material: str) -> str:
    """Build cost key from downspout specs, e.g., 'downspout_2x3_aluminum'."""
    return f"downspout_{size}_{material}"


def _gutter_items(building: BuildingModel, costs: dict) -> list[LineItem]:
    items = []
    rate = _labor_rate_gutter(costs)

    if not building.gutter_runs:
        return items

    # ── Aggregate totals across all runs ──────────────────────────────
    total_gutter_lf = 0.0
    total_ds_lf = 0.0
    total_downspouts = 0
    total_inside_miters = 0
    total_outside_miters = 0
    total_end_caps = 0
    total_labor_gutter = 0.0
    total_labor_ds = 0.0
    total_labor_splash = 0.0
    total_labor_miters = 0.0

    # Use specs from the first run for description (all runs assumed same spec)
    first = building.gutter_runs[0]
    size = getattr(first, "size", "5_inch")
    material = first.material or "aluminum"
    style = getattr(first, "style", "k_style")
    color = getattr(first, "color", "")
    ds_size = getattr(first, "downspout_size", "2x3")
    ds_material = getattr(first, "downspout_material", "") or material

    size_display = size.replace("_inch", '"').replace("_", "")
    style_display = style.replace("_", "-")
    color_note = f" ({color})" if color else ""

    ft_per_ds = 30 if building.stories >= 2 else 20

    for gr in building.gutter_runs:
        total_gutter_lf += gr.length
        total_downspouts += gr.downspouts
        total_ds_lf += gr.downspouts * ft_per_ds
        total_inside_miters += gr.inside_miters
        total_outside_miters += gr.outside_miters
        total_end_caps += 2  # 2 end caps per run
        total_labor_gutter += gr.length * 0.15
        total_labor_ds += gr.downspouts * 0.5
        total_labor_splash += gr.downspouts * 0.15
        total_labor_miters += gr.inside_miters * 0.25 + gr.outside_miters * 0.25

    # ── Single gutter line item ───────────────────────────────────────
    gutter_lf_with_waste = round(total_gutter_lf * WASTE_GUTTERS, 2)
    gutter_key = _gutter_cost_key(size, material)
    items.append(_item(
        "gutters", "Gutters",
        f'{size_display} {style_display} {material} gutter{color_note}',
        gutter_lf_with_waste, "lf",
        _lookup_cost(costs, "gutters", gutter_key,
                     _lookup_cost(costs, "gutters", "gutter_5in_aluminum", 3.50)),
        total_labor_gutter, rate,
    ))

    # ── Single downspout line item ────────────────────────────────────
    if total_downspouts > 0:
        ds_lf_with_waste = round(total_ds_lf * WASTE_GUTTERS, 2)
        ds_key = _downspout_cost_key(ds_size, ds_material)
        ds_cost_per_10ft = _lookup_cost(costs, "gutters", ds_key,
                         _lookup_cost(costs, "gutters", "downspout_2x3_aluminum", 9.00))
        ds_cost_per_lf = ds_cost_per_10ft / 10

        items.append(_item(
            "gutters", "Downspouts",
            f'{ds_size} {ds_material} downspout ({total_downspouts} locations)',
            ds_lf_with_waste, "lf",
            ds_cost_per_lf,
            total_labor_ds, rate,
        ))

        # Elbows (3 per downspout)
        items.append(_item(
            "gutters", "Fittings",
            f'{ds_size} downspout elbows',
            total_downspouts * 3, "ea",
            _lookup_cost(costs, "gutters", "downspout_elbow"),
            0, rate,
        ))

        # Splash blocks (1 per downspout)
        items.append(_item(
            "gutters", "Accessories",
            "Splash blocks",
            total_downspouts, "ea",
            _lookup_cost(costs, "gutters", "splash_block", 8.00),
            total_labor_splash, rate,
        ))

    # ── Miters ────────────────────────────────────────────────────────
    if total_inside_miters > 0:
        items.append(_item(
            "gutters", "Fittings", "Inside miters",
            total_inside_miters, "ea",
            _lookup_cost(costs, "gutters", "inside_miter"),
            total_inside_miters * 0.25, rate,
        ))
    if total_outside_miters > 0:
        items.append(_item(
            "gutters", "Fittings", "Outside miters",
            total_outside_miters, "ea",
            _lookup_cost(costs, "gutters", "outside_miter"),
            total_outside_miters * 0.25, rate,
        ))

    # ── End caps ──────────────────────────────────────────────────────
    items.append(_item(
        "gutters", "Fittings", "End caps",
        total_end_caps, "ea",
        _lookup_cost(costs, "gutters", "end_cap", 3.0),
        0, rate,
    ))

    # ── Hangers (1 per 2 lf) ─────────────────────────────────────────
    hangers = math.ceil(total_gutter_lf / 2)
    items.append(_item(
        "gutters", "Hardware", "Hidden hangers",
        hangers, "ea",
        _lookup_cost(costs, "gutters", "gutter_hanger"),
        0, rate,
    ))

    # ── Downspout straps ──────────────────────────────────────────────
    if total_downspouts > 0:
        items.append(_item(
            "gutters", "Hardware", "Downspout straps",
            total_downspouts * 2, "ea",
            _lookup_cost(costs, "gutters", "downspout_strap"),
            0, rate,
        ))

    # ── Sealant ───────────────────────────────────────────────────────
    if total_gutter_lf > 0:
        tubes = math.ceil(total_gutter_lf / 50)
        items.append(_item(
            "gutters", "Sealant", "Gutter sealant (tube)",
            tubes, "tube",
            _lookup_cost(costs, "gutters", "gutter_sealant"),
            0, rate,
        ))

    return items


def calculate_roofing(building: BuildingModel, costs: dict) -> list[LineItem]:
    """Calculate all roofing and gutter materials and labor."""
    items = []
    items.extend(_roofing_items(building, costs))
    items.extend(_gutter_items(building, costs))
    return items
