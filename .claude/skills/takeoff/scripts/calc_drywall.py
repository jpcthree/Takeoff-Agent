"""
Drywall Trade Calculator

Calculates drywall sheets (per floor, per type), finishing materials,
texture, and drywall primer. Supports standard, moisture-resistant,
fire-rated, cement board, mold-resistant, abuse-resistant, shaftliner,
and Type C drywall types.

Enhanced per Drywall Scope Analysis Guide:
- Multi-layer assemblies (drywall_layers per wall/ceiling)
- GA-214 finish levels (L0-L5) with labor multipliers
- Setting compound for fire-rated assemblies
- Drywall adhesive for multi-layer assemblies
- L-bead/J-bead at dissimilar material transitions
- Access panels
- High-ceiling labor surcharge (>10ft)
- Corner bead types (metal 90° and bullnose)
"""

from __future__ import annotations
import math
from collections import defaultdict
from models import BuildingModel, LineItem


WASTE_SHEETS = 1.10
WASTE_FINISH = 1.10
SQFT_PER_SHEET_4x8 = 32.0
SQFT_PER_SHEET_4x10 = 40.0

# GA-214 finish level labor multipliers (L4 = 1.0 baseline)
FINISH_LEVEL_MULTIPLIERS = {
    0: 0.0,   # L0 — no finishing (concealed areas)
    1: 0.3,   # L1 — fire-rated only, no taping visible
    2: 0.5,   # L2 — tile substrate, concealed areas
    3: 0.7,   # L3 — medium texture, no smooth finish
    4: 1.0,   # L4 — standard smooth/light texture (baseline)
    5: 1.5,   # L5 — skim coat, highest quality
}


# Drywall type display labels
DW_LABELS = {
    "standard_1_2": '1/2" standard drywall',
    "moisture_resistant": '1/2" moisture-resistant (green board)',
    "fire_rated_5_8": '5/8" fire-rated (Type X)',
    "cement_board": '1/2" cement board (wet areas)',
    "mold_resistant": '1/2" mold-resistant',
    "abuse_resistant": '1/2" abuse-resistant (high traffic)',
    "shaftliner": '1" shaftliner (shaft walls)',
    "type_c": '5/8" Type C (enhanced fire)',
}

# Drywall type cost keys (in default_costs.json)
DW_COST_KEYS = {
    "standard_1_2": "drywall_1_2_4x8",
    "moisture_resistant": "moisture_resistant_1_2_4x8",
    "fire_rated_5_8": "drywall_5_8_4x8",
    "cement_board": "cement_board_1_2_3x5",
    "mold_resistant": "mold_resistant_1_2_4x8",
    "abuse_resistant": "abuse_resistant_1_2_4x8",
    "shaftliner": "shaftliner_1in_4x8",
    "type_c": "type_c_5_8_4x8",
}

# Sheet SF by drywall type (most are 4x8=32, cement board is 3x5=15)
DW_SHEET_SF = {
    "cement_board": 15.0,
}

# Fire-rated drywall types that need setting compound
FIRE_RATED_TYPES = {"fire_rated_5_8", "type_c", "shaftliner"}


def _lookup_cost(costs: dict, section: str, key: str, fallback: float = 0.0) -> float:
    return costs.get(section, {}).get(key, {}).get("cost", fallback)


def _labor_rate(costs: dict) -> float:
    return costs.get("labor_rates", {}).get("drywall_finisher", 32.0)


def _item(category, desc, qty, unit, unit_cost, labor_hrs, labor_rate,
          sheets: int = 0) -> LineItem:
    li = LineItem(
        trade="drywall", category=category, description=desc,
        quantity=round(qty, 2), unit=unit, material_unit_cost=unit_cost,
        labor_hours=round(labor_hrs, 2), labor_rate=labor_rate,
        sheets=sheets,
    )
    li.calculate_totals()
    return li


def _sheet_sf(dw_type: str) -> float:
    """Return square footage per sheet for a drywall type."""
    return DW_SHEET_SF.get(dw_type, SQFT_PER_SHEET_4x8)


def _resolve_wall_dw_type(wall, room_map: dict) -> str:
    """Determine drywall type for a wall.

    Priority:
    1. Explicit wall.drywall_type if set
    2. Fire-rated flag
    3. Room-based inference (bathroom/kitchen → moisture-resistant, garage → fire-rated)
    4. Default: standard_1_2
    """
    # 1. Explicit override
    dw_type = getattr(wall, "drywall_type", "")
    if dw_type:
        return dw_type

    # 2. Fire-rated wall type
    if wall.is_fire_rated or wall.wall_type == "fire_rated":
        return "fire_rated_5_8"

    # 3. Room-based inference — check if wall is in a bathroom, kitchen, or garage
    for room_id, room in room_map.items():
        if hasattr(room, "walls") and wall.id in room.walls:
            if room.is_garage:
                return "fire_rated_5_8"
            if room.is_bathroom or room.is_kitchen:
                return "moisture_resistant"

    # 4. Default
    return "standard_1_2"


def _resolve_ceiling_dw_type(room) -> str:
    """Determine ceiling drywall type for a room.

    Priority:
    1. Explicit room.ceiling_drywall_type if set
    2. Room-based inference (garage → fire-rated, bathroom → moisture-resistant)
    3. Default: standard_1_2
    """
    # 1. Explicit override from model
    ceiling_type = getattr(room, "ceiling_drywall_type", "")
    if ceiling_type:
        return ceiling_type

    # 2. Room-based inference
    if room.is_garage:
        return "fire_rated_5_8"
    if room.is_bathroom:
        return "moisture_resistant"
    return "standard_1_2"


def _resolve_wall_context(wall, room_map: dict) -> str:
    """Determine location context for a wall's description.

    Returns one of: 'exterior', 'wet_area', 'garage', 'interior'
    """
    # Check room-based context first for garage and wet areas
    for room_id, room in room_map.items():
        if hasattr(room, "walls") and wall.id in room.walls:
            if room.is_garage:
                return "garage"
            if room.is_bathroom or room.is_kitchen:
                return "wet_area"

    if wall.is_exterior:
        return "exterior"

    return "interior"


def _resolve_ceiling_context(room) -> str:
    """Determine location context for a ceiling's description.

    Returns one of: 'garage', 'bathroom', 'standard'
    """
    if room.is_garage:
        return "garage"
    if room.is_bathroom:
        return "bathroom"
    return "standard"


def _wall_desc(context: str, label: str, total_sheets: int, layer_note: str,
               floor_num: int, multi_story: bool) -> str:
    """Build a wall drywall description with location context."""
    floor_suffix = f", Floor {floor_num}" if multi_story else ""
    ctx_labels = {
        "exterior": "Exterior Walls",
        "wet_area": "Wet Areas (Bath/Kitchen)",
        "garage": "Garage Separation",
        "interior": "Interior Walls",
    }
    ctx = ctx_labels.get(context, "Walls")
    code_note = ", IRC R302.6" if context == "garage" else ""
    return f"{ctx} - {label} ({total_sheets} sheets{layer_note}{code_note}{floor_suffix})"


def _ceiling_desc(context: str, label: str, total_sheets: int, layer_note: str,
                  floor_num: int, multi_story: bool) -> str:
    """Build a ceiling drywall description with location context."""
    floor_suffix = f", Floor {floor_num}" if multi_story else ""
    ctx_labels = {
        "garage": "Garage Ceiling",
        "bathroom": "Bathroom Ceilings",
        "standard": "Ceilings",
    }
    ctx = ctx_labels.get(context, "Ceilings")
    code_note = ", IRC R302.6" if context == "garage" else ""
    return f"{ctx} - {label} ({total_sheets} sheets{layer_note}{code_note}{floor_suffix})"


def _get_finish_level(obj, attr: str = "drywall_finish_level") -> int:
    """Get finish level with fallback to L4 (standard)."""
    return getattr(obj, attr, 4)


def calculate_drywall(building: BuildingModel, costs: dict) -> list[LineItem]:
    """Calculate all drywall materials and labor."""
    items = []
    rate = _labor_rate(costs)

    # Build room lookup for wall-to-room inference
    room_map = {}
    for room in building.rooms:
        room_map[getattr(room, "id", id(room))] = room

    # Track totals for finishing calculations
    total_wall_sheets = 0
    total_ceiling_sheets = 0
    total_wall_area = 0.0
    total_ceiling_area = 0.0
    fire_rated_sheets = 0
    multi_layer_sheets = 0
    finish_level_areas = defaultdict(float)  # level → SF (for weighted labor)
    high_ceiling_area = 0.0  # SF of walls/ceilings >10ft

    # ── Wall Drywall (grouped by floor + type + context) ────────────────
    # Key: (floor, dw_type, context) → {area, layers, finish_level}
    wall_groups = defaultdict(lambda: {"area": 0.0, "layers": 1, "finish_level": 4})

    for wall in building.walls:
        if wall.interior_finish != "drywall":
            continue
        net = wall.net_area_sqft(building.openings)
        if net <= 0:
            continue

        dw_type = _resolve_wall_dw_type(wall, room_map)
        layers = getattr(wall, "drywall_layers", 1)
        finish_level = _get_finish_level(wall)
        context = _resolve_wall_context(wall, room_map)

        if wall.is_exterior:
            sides = 1  # interior face only
        else:
            sides = 2  # both sides

        wall_sf = net * sides
        key = (wall.floor, dw_type, context)
        wall_groups[key]["area"] += wall_sf
        wall_groups[key]["layers"] = max(wall_groups[key]["layers"], layers)
        wall_groups[key]["finish_level"] = finish_level

        # Track high-ceiling areas
        wall_height = wall.height.total_feet if hasattr(wall.height, "total_feet") else 9.0
        if wall_height > 10.0:
            high_ceiling_area += wall_sf

    multi_story = building.stories > 1
    for (floor_num, dw_type, context), info in sorted(wall_groups.items()):
        area = info["area"]
        layers = info["layers"]
        finish_level = info["finish_level"]
        if area <= 0:
            continue

        sheet_sf = _sheet_sf(dw_type)
        sheets_per_layer = math.ceil(area / sheet_sf * WASTE_SHEETS)
        total_sheets = sheets_per_layer * layers
        sf_with_waste = round(area * WASTE_SHEETS, 2)
        label = DW_LABELS.get(dw_type, dw_type)
        cost_key = DW_COST_KEYS.get(dw_type, "drywall_1_2_4x8")
        cost_per_sheet = _lookup_cost(costs, "drywall", cost_key)

        layer_note = f", {layers} layers" if layers > 1 else ""
        desc = _wall_desc(context, label, total_sheets, layer_note,
                          floor_num, multi_story)
        items.append(_item(
            "Walls", desc,
            sf_with_waste * layers, "sf",
            cost_per_sheet,
            total_sheets * 0.05, rate,
            sheets=total_sheets,
        ))

        total_wall_sheets += total_sheets
        total_wall_area += area
        finish_level_areas[finish_level] += area

        if dw_type in FIRE_RATED_TYPES:
            fire_rated_sheets += total_sheets
        if layers > 1:
            multi_layer_sheets += total_sheets

    # ── Ceiling Drywall (grouped by floor + type + context) ─────────────
    ceiling_groups = defaultdict(lambda: {"area": 0.0, "layers": 1, "finish_level": 4})

    for room in building.rooms:
        ceil_area = room.ceiling_area_sqft
        if ceil_area <= 0:
            continue
        dw_type = _resolve_ceiling_dw_type(room)
        layers = getattr(room, "ceiling_drywall_layers", 1)
        finish_level = getattr(room, "ceiling_finish_level", 4)
        context = _resolve_ceiling_context(room)

        key = (room.floor, dw_type, context)
        ceiling_groups[key]["area"] += ceil_area
        ceiling_groups[key]["layers"] = max(ceiling_groups[key]["layers"], layers)
        ceiling_groups[key]["finish_level"] = finish_level

        # Track high-ceiling areas for rooms
        ceil_height = room.ceiling_height.total_feet if hasattr(room.ceiling_height, "total_feet") else 9.0
        if ceil_height > 10.0:
            high_ceiling_area += ceil_area

    for (floor_num, dw_type, context), info in sorted(ceiling_groups.items()):
        area = info["area"]
        layers = info["layers"]
        finish_level = info["finish_level"]
        if area <= 0:
            continue

        sheet_sf = _sheet_sf(dw_type)
        sheets_per_layer = math.ceil(area / sheet_sf * WASTE_SHEETS)
        total_sheets = sheets_per_layer * layers
        sf_with_waste = round(area * WASTE_SHEETS, 2)
        label = DW_LABELS.get(dw_type, dw_type)
        cost_key = DW_COST_KEYS.get(dw_type, "drywall_1_2_4x8")
        cost_per_sheet = _lookup_cost(costs, "drywall", cost_key)

        layer_note = f", {layers} layers" if layers > 1 else ""
        desc = _ceiling_desc(context, label, total_sheets, layer_note,
                             floor_num, multi_story)
        items.append(_item(
            "Ceilings", desc,
            sf_with_waste * layers, "sf",
            cost_per_sheet,
            total_sheets * 0.06, rate,  # slightly more labor for ceilings
            sheets=total_sheets,
        ))

        total_ceiling_sheets += total_sheets
        total_ceiling_area += area
        finish_level_areas[finish_level] += area

        if dw_type in FIRE_RATED_TYPES:
            fire_rated_sheets += total_sheets
        if layers > 1:
            multi_layer_sheets += total_sheets

    # ── Calculate totals for finishing materials ─────────────────────────
    all_sheets = total_wall_sheets + total_ceiling_sheets
    total_area = total_wall_area + total_ceiling_area

    if all_sheets <= 0:
        return items

    # ── Joint Compound ──────────────────────────────────────────────────
    buckets = math.ceil(all_sheets / 15) * WASTE_FINISH
    items.append(_item(
        "Finishing", "Joint compound (4.5 gal bucket)",
        buckets, "bucket",
        _lookup_cost(costs, "drywall", "joint_compound_5gal"),
        buckets * 0.5, rate,
    ))

    # ── Setting Compound (fire-rated assemblies) ────────────────────────
    if fire_rated_sheets > 0:
        bags = math.ceil(fire_rated_sheets / 20)
        items.append(_item(
            "Finishing", "Setting-type compound 18 lb (fire-rated joints)",
            bags, "bag",
            _lookup_cost(costs, "drywall", "setting_compound_18lb", 14.0),
            bags * 0.3, rate,
        ))

    # ── Paper Tape ──────────────────────────────────────────────────────
    rolls = math.ceil(all_sheets / 15) * WASTE_FINISH
    items.append(_item(
        "Finishing", "Paper tape (500 ft roll)",
        rolls, "roll",
        _lookup_cost(costs, "drywall", "joint_tape_500ft"),
        0, rate,  # labor included in mudding
    ))

    # ── Corner Bead ─────────────────────────────────────────────────────
    num_rooms = len(building.rooms)
    avg_height = 8.0
    if building.rooms:
        avg_height = sum(r.ceiling_height.total_feet for r in building.rooms) / num_rooms
    corner_lf = num_rooms * 4 * avg_height  # ~4 corners per room

    # Split: 70% metal 90° for utility/wet, 30% bullnose for living areas
    metal_pieces = math.ceil(corner_lf * 0.7 / 8)
    bullnose_pieces = math.ceil(corner_lf * 0.3 / 8)

    if metal_pieces > 0:
        items.append(_item(
            "Finishing", "Metal corner bead 90° (8 ft)",
            metal_pieces, "ea",
            _lookup_cost(costs, "drywall", "corner_bead_8ft"),
            metal_pieces * 0.15, rate,
        ))
    if bullnose_pieces > 0:
        items.append(_item(
            "Finishing", "Bullnose corner bead (8 ft)",
            bullnose_pieces, "ea",
            _lookup_cost(costs, "drywall", "corner_bead_bullnose_8ft", 5.50),
            bullnose_pieces * 0.20, rate,
        ))

    # ── L-Bead / J-Bead ────────────────────────────────────────────────
    l_bead_lf = getattr(building, "l_bead_lf", 0.0)
    if l_bead_lf > 0:
        pieces = math.ceil(l_bead_lf / 10)  # 10-ft pieces
        items.append(_item(
            "Finishing", "L-bead / J-bead (10 ft)",
            pieces, "ea",
            _lookup_cost(costs, "drywall", "l_bead_10ft", 3.75),
            pieces * 0.10, rate,
        ))

    # ── Drywall Screws ──────────────────────────────────────────────────
    screw_lbs = math.ceil(all_sheets / 3)
    items.append(_item(
        "Fasteners", 'Drywall screws 1-1/4" (1 lb)',
        screw_lbs, "lb",
        _lookup_cost(costs, "drywall", "drywall_screws_1lb"),
        0, rate,
    ))

    # ── Drywall Adhesive (multi-layer assemblies) ───────────────────────
    if multi_layer_sheets > 0:
        tubes = math.ceil(multi_layer_sheets / 8)  # 1 tube per 8 sheets
        items.append(_item(
            "Fasteners", "Drywall adhesive (28 oz tube)",
            tubes, "ea",
            _lookup_cost(costs, "drywall", "drywall_adhesive", 4.50),
            tubes * 0.05, rate,
        ))

    # ── Access Panels ───────────────────────────────────────────────────
    access_count = getattr(building, "access_panel_count", 0)
    if access_count > 0:
        items.append(_item(
            "Accessories", "Access panel 12x12",
            access_count, "ea",
            _lookup_cost(costs, "drywall", "access_panel_12x12", 18.0),
            access_count * 0.50, rate,
        ))

    # ── Taping/Finishing Labor (scaled by GA-214 finish level) ──────────
    # Calculate weighted finish labor from finish level areas
    if total_area > 0:
        weighted_labor = 0.0
        for level, area in finish_level_areas.items():
            multiplier = FINISH_LEVEL_MULTIPLIERS.get(level, 1.0)
            weighted_labor += area * 0.04 * multiplier  # 0.04 hrs/sf baseline

        # High-ceiling surcharge: 15% extra labor for walls/ceilings >10ft
        if high_ceiling_area > 0:
            high_ceiling_ratio = high_ceiling_area / total_area
            weighted_labor *= (1.0 + 0.15 * high_ceiling_ratio)

        items.append(_item(
            "Finishing Labor", "Taping, mudding, sanding (GA-214 finish level adjusted)",
            0, "ea", 0,
            round(weighted_labor, 2), rate,
        ))

    # ── Texture ─────────────────────────────────────────────────────────
    if total_ceiling_area > 0:
        items.append(_item(
            "Texture", "Wall/ceiling texture compound",
            math.ceil(total_ceiling_area / 200), "bag",
            _lookup_cost(costs, "drywall", "texture_compound", 15.0),
            total_ceiling_area * 0.01, rate,
        ))

    # ── Drywall Primer (always included) ────────────────────────────────
    # Single line item covering ALL drywall surfaces
    if total_area > 0:
        primer_gallons = math.ceil(total_area / 350)  # ~350 SF per gallon
        items.append(_item(
            "Primer", f"Drywall PVA primer - all surfaces ({round(total_area):,} SF total)",
            primer_gallons, "gal",
            _lookup_cost(costs, "drywall", "drywall_primer_pva",
                         _lookup_cost(costs, "interior_finishes", "interior_primer", 22.0)),
            total_area * 0.005, rate,
        ))

    return items
