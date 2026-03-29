"""
Roofing & Gutters Trade Calculator

Calculates roofing materials (shingles, underlayment, flashing, etc.)
and gutter system components with per-run specs for size, style,
material, and color.

Enhanced per Roofing & Gutters Scope Analysis Agent Instructions:
- Material-aware shingle calculations (architectural, 3-tab, designer)
- Underlayment type selection (synthetic, felt #15/#30, high-temp)
- Hip cap separate from ridge cap
- Penetration-based flashing (chimney, skylight, pipe boots by count)
- Step/counter flashing by measured LF
- Soffit vents, power vents
- Roof complexity waste factors
- Gutter guards, outlet drops, expansion joints
"""

from __future__ import annotations
import math
from models import BuildingModel, LineItem


# Waste factors by roof complexity
WASTE_BY_COMPLEXITY = {
    "simple": 1.07,       # Simple gable / single plane
    "standard": 1.10,     # Standard hip roof
    "complex": 1.15,      # Multiple dormers, valleys, penetrations
    "very_complex": 1.20, # Steepness + complexity combined
}
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


def _shingle_cost_key(shingle_type: str) -> str:
    """Map shingle type to cost key."""
    mapping = {
        "architectural": "shingle_architectural",
        "3_tab": "shingle_3tab",
        "designer": "shingle_designer",
    }
    return mapping.get(shingle_type, "shingle_architectural")


def _underlayment_cost_key(underlayment_type: str) -> str:
    """Map underlayment type to cost key."""
    mapping = {
        "synthetic": "underlayment_synthetic",
        "felt_15": "underlayment_15lb_felt",
        "felt_30": "underlayment_30lb_felt",
        "high_temp": "ice_water_shield",  # high-temp I&W for metal
    }
    return mapping.get(underlayment_type, "underlayment_synthetic")


def _underlayment_coverage(underlayment_type: str) -> float:
    """SF coverage per roll by type."""
    return {
        "synthetic": 1000,
        "felt_15": 400,
        "felt_30": 200,
        "high_temp": 65,
    }.get(underlayment_type, 1000)


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

    # Determine waste factor from roof complexity
    complexity = getattr(building, "roof_complexity", "standard")
    waste = WASTE_BY_COMPLEXITY.get(complexity, 1.10)

    # Determine shingle type and underlayment from first roof section
    first_rs = building.roof_sections[0]
    shingle_type = getattr(first_rs, "shingle_type", "architectural")
    underlayment_type = getattr(first_rs, "underlayment_type", "synthetic")

    # Total roof area (informational line item)
    items.append(_item(
        "roofing", "Roof Area", f"Total roof area ({round(total_actual_area):,} SF)",
        total_actual_area, "sf", 0, 0, rate,
    ))

    # ── Shingles — priced per square (1 square = 100 SF) ────────────
    squares = total_actual_area / 100
    squares_with_waste = math.ceil(squares * waste)
    shingle_key = _shingle_cost_key(shingle_type)
    shingle_label = shingle_type.replace("_", "-")
    # Cost per bundle → cost per square (3 bundles per square)
    cost_per_bundle = _lookup_cost(costs, "roofing", shingle_key,
                                    _lookup_cost(costs, "roofing", "shingle_architectural", 38.0))
    cost_per_square_shingle = cost_per_bundle * 3
    shingle_item = _item(
        "roofing", "Shingles", f"{shingle_label.title()} asphalt shingles",
        squares_with_waste, "square", cost_per_square_shingle,
        total_actual_area * 0.04, rate,
    )
    shingle_item.sheets = squares_with_waste  # sheets field = squares for roofing
    shingle_item.calculate_totals()
    items.append(shingle_item)

    # ── Underlayment — priced per square ──────────────────────────────
    ul_key = _underlayment_cost_key(underlayment_type)
    ul_coverage = _underlayment_coverage(underlayment_type)
    ul_label = underlayment_type.replace("_", " ").title()
    rolls = math.ceil(total_actual_area / ul_coverage * waste)
    # Convert roll cost to per-square cost
    cost_per_roll = _lookup_cost(costs, "roofing", ul_key,
                                  _lookup_cost(costs, "roofing", "underlayment_synthetic", 65.0))
    sqft_per_roll = ul_coverage
    cost_per_square_ul = round(cost_per_roll / (sqft_per_roll / 100), 2)
    ul_item = _item(
        "roofing", "Underlayment", f"{ul_label} underlayment",
        squares_with_waste, "square", cost_per_square_ul,
        rolls * 0.3, rate,
    )
    ul_item.sheets = squares_with_waste  # sheets field = squares for roofing
    ul_item.calculate_totals()
    items.append(ul_item)

    # ── Ice and water shield (eave + valleys) ─────────────────────────
    ice_sqft = (total_eave * 3) + (total_valley * 3)
    if ice_sqft > 0:
        rolls_ice = math.ceil(ice_sqft / 65)
        items.append(_item(
            "roofing", "Ice & Water Shield", "Ice and water shield (roll)",
            rolls_ice, "roll", _lookup_cost(costs, "roofing", "ice_water_shield"),
            rolls_ice * 0.4, rate,
        ))

    # ── Drip edge ─────────────────────────────────────────────────────
    drip_lf = total_eave + total_rake
    if drip_lf > 0:
        pieces = math.ceil(drip_lf / 10 * WASTE_FLASHING)
        items.append(_item(
            "roofing", "Drip Edge", "Aluminum drip edge (10 ft)",
            pieces, "ea", _lookup_cost(costs, "roofing", "drip_edge"),
            drip_lf * 0.03, rate,
        ))

    # ── Starter strip ─────────────────────────────────────────────────
    if total_eave > 0:
        starter_bundles = math.ceil(total_eave / 100)
        items.append(_item(
            "roofing", "Starter Strip", "Starter strip shingles (bundle)",
            starter_bundles, "bundle",
            _lookup_cost(costs, "roofing", shingle_key,
                         _lookup_cost(costs, "roofing", "shingle_architectural", 38.0)) * 0.6,
            total_eave * 0.01, rate,
        ))

    # ── Ridge cap ─────────────────────────────────────────────────────
    if total_ridge > 0:
        ridge_bundles = math.ceil(total_ridge / 25)  # ~25 LF per bundle
        items.append(_item(
            "roofing", "Ridge Cap", "Ridge cap shingles (bundle)",
            ridge_bundles, "bundle",
            _lookup_cost(costs, "roofing", "ridge_cap_shingle",
                         _lookup_cost(costs, "roofing", "shingle_architectural", 38.0)),
            total_ridge * 0.03, rate,
        ))

    # ── Hip cap (separate from ridge) ─────────────────────────────────
    if total_hip > 0:
        hip_bundles = math.ceil(total_hip / 25)
        items.append(_item(
            "roofing", "Hip Cap", "Hip cap shingles (bundle)",
            hip_bundles, "bundle",
            _lookup_cost(costs, "roofing", "ridge_cap_shingle",
                         _lookup_cost(costs, "roofing", "shingle_architectural", 38.0)),
            total_hip * 0.03, rate,
        ))

    # ── Ridge vent ────────────────────────────────────────────────────
    if total_ridge > 0:
        vent_pieces = math.ceil(total_ridge / 4)
        items.append(_item(
            "roofing", "Ventilation", "Ridge vent (4 ft section)",
            vent_pieces, "ea", _lookup_cost(costs, "roofing", "ridge_vent"),
            total_ridge * 0.05, rate,
        ))

    # ── Soffit vents ──────────────────────────────────────────────────
    soffit_count = getattr(building, "soffit_vent_count", 0)
    if soffit_count > 0:
        items.append(_item(
            "roofing", "Ventilation", "Soffit vents",
            soffit_count, "ea", _lookup_cost(costs, "roofing", "soffit_vent", 5.50),
            soffit_count * 0.25, rate,
        ))

    # ── Power / turbine vents ─────────────────────────────────────────
    power_count = getattr(building, "power_vent_count", 0)
    if power_count > 0:
        items.append(_item(
            "roofing", "Ventilation", "Power / turbine vents",
            power_count, "ea", _lookup_cost(costs, "roofing", "power_vent", 85.0),
            power_count * 1.5, rate,
        ))

    # ── Pipe boot flashing ────────────────────────────────────────────
    pipe_boots = getattr(building, "pipe_boot_count", 3)
    if pipe_boots > 0:
        items.append(_item(
            "roofing", "Flashing", f"Pipe boot flashing ({pipe_boots} penetrations)",
            pipe_boots, "ea", _lookup_cost(costs, "roofing", "flashing_pipe_boot"),
            pipe_boots * 0.5, rate,
        ))

    # ── Step flashing ─────────────────────────────────────────────────
    step_lf = getattr(building, "step_flashing_lf", 0.0)
    if step_lf > 0:
        # Step flashing sold in pieces (~8" each = ~0.67 ft)
        pieces = math.ceil(step_lf / 0.67 * WASTE_FLASHING)
        items.append(_item(
            "roofing", "Flashing", f"Step flashing ({round(step_lf)} LF)",
            pieces, "ea",
            _lookup_cost(costs, "roofing", "flashing_step", 25.0) / 25,  # per-piece from kit
            step_lf * 0.08, rate,
        ))
    else:
        # Default: 1 step flashing kit
        items.append(_item(
            "roofing", "Flashing", "Step flashing kit",
            1, "ea", _lookup_cost(costs, "roofing", "flashing_step", 25.0),
            2.0, rate,
        ))

    # ── Counter flashing ──────────────────────────────────────────────
    counter_lf = getattr(building, "counter_flashing_lf", 0.0)
    if counter_lf > 0:
        pieces_10ft = math.ceil(counter_lf / 10 * WASTE_FLASHING)
        items.append(_item(
            "roofing", "Flashing", f"Counter flashing ({round(counter_lf)} LF)",
            pieces_10ft, "ea",
            _lookup_cost(costs, "roofing", "flashing_counter", 35.0),
            counter_lf * 0.08, rate,
        ))

    # ── Chimney flashing ──────────────────────────────────────────────
    chimney_count = getattr(building, "chimney_count", 0)
    if chimney_count > 0:
        items.append(_item(
            "roofing", "Flashing", f"Chimney flashing kit ({chimney_count} chimney{'s' if chimney_count > 1 else ''})",
            chimney_count, "ea",
            _lookup_cost(costs, "roofing", "flashing_chimney_kit", 85.0),
            chimney_count * 3.0, rate,
        ))

    # ── Skylight flashing ─────────────────────────────────────────────
    skylight_count = getattr(building, "skylight_count", 0)
    if skylight_count > 0:
        items.append(_item(
            "roofing", "Flashing", f"Skylight flashing kit ({skylight_count} skylight{'s' if skylight_count > 1 else ''})",
            skylight_count, "ea",
            _lookup_cost(costs, "roofing", "flashing_skylight_kit", 65.0),
            skylight_count * 1.5, rate,
        ))

    # ── Valley flashing ───────────────────────────────────────────────
    if total_valley > 0:
        items.append(_item(
            "roofing", "Flashing", "W-valley flashing (10 ft)",
            math.ceil(total_valley / 10 * WASTE_FLASHING), "ea",
            _lookup_cost(costs, "roofing", "flashing_valley", 20.0),
            total_valley * 0.05, rate,
        ))

    # ── Roof cement / sealant ─────────────────────────────────────────
    cement_tubes = max(1, math.ceil(squares / 10))
    items.append(_item(
        "roofing", "Sealant", "Roof cement / sealant (tube)",
        cement_tubes, "tube", _lookup_cost(costs, "roofing", "roof_cement", 6.50),
        0, rate,
    ))

    # ── Roofing nails ─────────────────────────────────────────────────
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
    has_gutter_guard = False
    guard_type = "screen"
    total_guard_lf = 0.0

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
        total_end_caps += getattr(gr, "end_caps", 2)
        total_labor_gutter += gr.length * 0.15
        total_labor_ds += gr.downspouts * 0.5
        total_labor_splash += gr.downspouts * 0.15
        total_labor_miters += gr.inside_miters * 0.25 + gr.outside_miters * 0.25
        if getattr(gr, "gutter_guard", False):
            has_gutter_guard = True
            guard_type = getattr(gr, "gutter_guard_type", "screen")
            total_guard_lf += gr.length

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

        # Outlet drops (1 per downspout)
        items.append(_item(
            "gutters", "Fittings",
            "Outlet drops",
            total_downspouts, "ea",
            _lookup_cost(costs, "gutters", "outlet_drop", 6.00),
            total_downspouts * 0.15, rate,
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
    if total_end_caps > 0:
        items.append(_item(
            "gutters", "Fittings", "End caps",
            total_end_caps, "ea",
            _lookup_cost(costs, "gutters", "end_cap", 3.0),
            0, rate,
        ))

    # ── Expansion joints (1 per 40 LF per SMACNA) ────────────────────
    if total_gutter_lf > 40:
        expansion_count = math.ceil(total_gutter_lf / 40) - 1
        if expansion_count > 0:
            items.append(_item(
                "gutters", "Fittings", "Expansion joints",
                expansion_count, "ea",
                _lookup_cost(costs, "gutters", "expansion_joint", 8.00),
                expansion_count * 0.25, rate,
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

    # ── Gutter guards / leaf protection ───────────────────────────────
    if has_gutter_guard and total_guard_lf > 0:
        guard_key = f"gutter_guard_{guard_type}"
        guard_label = guard_type.replace("_", " ").title()
        items.append(_item(
            "gutters", "Accessories",
            f"Gutter guard — {guard_label}",
            round(total_guard_lf * WASTE_GUTTERS, 2), "lf",
            _lookup_cost(costs, "gutters", guard_key,
                         _lookup_cost(costs, "gutters", "gutter_screen", 1.75)),
            total_guard_lf * 0.05, rate,
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
