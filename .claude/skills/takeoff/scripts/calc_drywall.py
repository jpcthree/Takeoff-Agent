"""
Drywall Trade Calculator

Calculates drywall sheets (per floor, per type), finishing materials,
texture, and drywall primer. Supports standard, moisture-resistant,
fire-rated, cement board, and mold-resistant drywall types.
"""

from __future__ import annotations
import math
from collections import defaultdict
from models import BuildingModel, LineItem


WASTE_SHEETS = 1.10
WASTE_FINISH = 1.10
SQFT_PER_SHEET = 32.0  # 4x8


# Drywall type display labels
DW_LABELS = {
    "standard_1_2": '1/2" standard drywall',
    "moisture_resistant": '1/2" moisture-resistant (green board)',
    "fire_rated_5_8": '5/8" fire-rated (Type X)',
    "cement_board": '1/2" cement board (wet areas)',
    "mold_resistant": '1/2" mold-resistant',
}

# Drywall type cost keys (in default_costs.json)
DW_COST_KEYS = {
    "standard_1_2": "drywall_1_2_4x8",
    "moisture_resistant": "moisture_resistant_1_2_4x8",
    "fire_rated_5_8": "drywall_5_8_4x8",
    "cement_board": "cement_board_1_2_3x5",
    "mold_resistant": "mold_resistant_1_2_4x8",
}


def _lookup_cost(costs: dict, section: str, key: str, fallback: float = 0.0) -> float:
    return costs.get(section, {}).get(key, {}).get("cost", fallback)


def _labor_rate(costs: dict) -> float:
    return costs.get("labor_rates", {}).get("drywall_finisher", 35.0)


def _item(category, desc, qty, unit, unit_cost, labor_hrs, labor_rate) -> LineItem:
    li = LineItem(
        trade="drywall", category=category, description=desc,
        quantity=round(qty, 2), unit=unit, material_unit_cost=unit_cost,
        labor_hours=round(labor_hrs, 2), labor_rate=labor_rate,
    )
    li.calculate_totals()
    return li


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
    """Determine ceiling drywall type for a room."""
    if room.is_garage:
        return "fire_rated_5_8"
    if room.is_bathroom:
        return "moisture_resistant"
    return "standard_1_2"


def calculate_drywall(building: BuildingModel, costs: dict) -> list[LineItem]:
    """Calculate all drywall materials and labor."""
    items = []
    rate = _labor_rate(costs)

    # Build room lookup for wall-to-room inference
    room_map = {}
    for room in building.rooms:
        room_map[getattr(room, "id", id(room))] = room

    # ── Wall Drywall (grouped by floor + type) ──────────────────────────
    wall_areas = defaultdict(float)  # (floor, dw_type) → SF

    for wall in building.walls:
        if wall.interior_finish != "drywall":
            continue
        net = wall.net_area_sqft(building.openings)
        if net <= 0:
            continue

        dw_type = _resolve_wall_dw_type(wall, room_map)

        if wall.is_exterior:
            sides = 1  # interior face only
        else:
            sides = 2  # both sides

        wall_areas[(wall.floor, dw_type)] += net * sides

    for (floor_num, dw_type), area in sorted(wall_areas.items()):
        if area <= 0:
            continue
        floor_label = f"Floor {floor_num}" if building.stories > 1 else "Walls"
        sf_with_waste = round(area * WASTE_SHEETS, 2)
        sheets = math.ceil(area / SQFT_PER_SHEET * WASTE_SHEETS)
        label = DW_LABELS.get(dw_type, dw_type)
        cost_key = DW_COST_KEYS.get(dw_type, "drywall_1_2_4x8")
        cost_per_sf = _lookup_cost(costs, "drywall", cost_key) / SQFT_PER_SHEET

        items.append(_item(
            "Drywall Sheets",
            f"{floor_label} - {label} ({sheets} sheets)",
            sf_with_waste, "sf",
            cost_per_sf,
            sheets * 0.05, rate,
        ))

    # ── Ceiling Drywall (grouped by floor + type) ───────────────────────
    ceiling_areas = defaultdict(float)

    for room in building.rooms:
        ceil_area = room.ceiling_area_sqft
        if ceil_area <= 0:
            continue
        dw_type = _resolve_ceiling_dw_type(room)
        ceiling_areas[(room.floor, dw_type)] += ceil_area

    for (floor_num, dw_type), area in sorted(ceiling_areas.items()):
        if area <= 0:
            continue
        floor_label = f"Floor {floor_num}" if building.stories > 1 else "Ceilings"
        sf_with_waste = round(area * WASTE_SHEETS, 2)
        sheets = math.ceil(area / SQFT_PER_SHEET * WASTE_SHEETS)
        label = DW_LABELS.get(dw_type, dw_type)
        cost_key = DW_COST_KEYS.get(dw_type, "drywall_1_2_4x8")
        cost_per_sf = _lookup_cost(costs, "drywall", cost_key) / SQFT_PER_SHEET

        items.append(_item(
            "Drywall Sheets",
            f"{floor_label} - Ceiling - {label} ({sheets} sheets)",
            sf_with_waste, "sf",
            cost_per_sf,
            sheets * 0.06, rate,  # slightly more labor for ceilings
        ))

    # ── Calculate totals for finishing materials ─────────────────────────
    total_wall_area = sum(wall_areas.values())
    total_ceiling_area = sum(ceiling_areas.values())
    total_area = total_wall_area + total_ceiling_area
    total_sheets = math.ceil(total_area / SQFT_PER_SHEET * WASTE_SHEETS)

    if total_sheets <= 0:
        return items

    # ── Joint Compound ──────────────────────────────────────────────────
    buckets = math.ceil(total_sheets / 15) * WASTE_FINISH
    items.append(_item(
        "Finishing", "Joint compound (4.5 gal bucket)",
        buckets, "bucket",
        _lookup_cost(costs, "drywall", "joint_compound_5gal"),
        buckets * 0.5, rate,
    ))

    # ── Paper Tape ──────────────────────────────────────────────────────
    rolls = math.ceil(total_sheets / 15) * WASTE_FINISH
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
    items.append(_item(
        "Finishing", "Metal corner bead",
        math.ceil(corner_lf / 8), "ea",  # 8' pieces
        _lookup_cost(costs, "drywall", "corner_bead_8ft"),
        corner_lf * 0.05, rate,
    ))

    # ── Drywall Screws ──────────────────────────────────────────────────
    screw_lbs = math.ceil(total_sheets / 3)
    items.append(_item(
        "Fasteners", 'Drywall screws 1-1/4" (1 lb)',
        screw_lbs, "lb",
        _lookup_cost(costs, "drywall", "drywall_screws_1lb"),
        0, rate,
    ))

    # ── Taping/Finishing Labor ──────────────────────────────────────────
    items.append(_item(
        "Finishing Labor", "Taping, mudding, sanding",
        0, "ea", 0,
        total_area * 0.04, rate,
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
