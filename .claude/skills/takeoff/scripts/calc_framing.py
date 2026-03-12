"""
Framing Trade Calculator

Calculates all framing materials: wall framing, floor framing,
roof framing, sheathing, and hardware/fasteners.
"""

from __future__ import annotations
import math
from models import BuildingModel, LineItem


WASTE_LUMBER = 1.10
WASTE_SHEATHING = 1.10
WASTE_HARDWARE = 1.05


def _lookup_cost(costs: dict, section: str, key: str, fallback: float = 0.0) -> float:
    return costs.get(section, {}).get(key, {}).get("cost", fallback)


def _labor_rate(costs: dict) -> float:
    return costs.get("labor_rates", {}).get("framing_carpenter", 35.0)


def _item(category, desc, qty, unit, unit_cost, labor_hrs, labor_rate) -> LineItem:
    li = LineItem(
        trade="framing", category=category, description=desc,
        quantity=round(qty, 2), unit=unit, material_unit_cost=unit_cost,
        labor_hours=round(labor_hrs, 2), labor_rate=labor_rate,
    )
    li.calculate_totals()
    return li


# ---------------------------------------------------------------------------
# Wall framing
# ---------------------------------------------------------------------------

def _wall_framing(building: BuildingModel, costs: dict) -> list[LineItem]:
    items = []
    rate = _labor_rate(costs)

    for wall in building.walls:
        length_ft = wall.length.total_feet
        height_ft = wall.height.total_feet
        if length_ft <= 0:
            continue

        is_2x6 = "2x6" in wall.thickness
        plate_key = "plate_2x6_10" if is_2x6 else "plate_2x4_10"
        stud_key = "stud_2x6_92" if is_2x6 else "stud_2x4_92"
        plate_len = 10.0  # 10' plates

        # Bottom plate: 1x length
        plate_count = math.ceil(length_ft / plate_len) * WASTE_LUMBER
        items.append(_item(
            "Wall Plates", f"Bottom plate {wall.thickness} - {wall.id}",
            plate_count, "ea", _lookup_cost(costs, "framing", plate_key),
            plate_count * 0.1, rate,
        ))

        # Double top plate: 2x length
        top_plate_count = math.ceil(length_ft * 2 / plate_len) * WASTE_LUMBER
        items.append(_item(
            "Wall Plates", f"Double top plate {wall.thickness} - {wall.id}",
            top_plate_count, "ea", _lookup_cost(costs, "framing", plate_key),
            top_plate_count * 0.1, rate,
        ))

        # Studs
        stud_count = math.ceil(length_ft * 12 / wall.stud_spacing) + 1
        # Extra for corners (2 per corner, estimate 1 corner per wall end)
        stud_count += 4

        # King/jack/cripple studs for openings
        wall_openings = building.get_openings_for_wall(wall.id)
        for op in wall_openings:
            stud_count += 2 * op.quantity  # king studs
            stud_count += 2 * op.quantity  # jack studs
            if op.opening_type == "window":
                cripple_below = max(1, int(op.width.total_feet / (wall.stud_spacing / 12)))
                stud_count += cripple_below * op.quantity

        stud_count = math.ceil(stud_count * WASTE_LUMBER)
        items.append(_item(
            "Studs", f"Studs {wall.thickness} - {wall.id}",
            stud_count, "ea", _lookup_cost(costs, "framing", stud_key),
            stud_count * 0.08, rate,
        ))

        # Headers for openings
        for op in wall_openings:
            header_map = {
                "2x6": "header_2x6", "2x8": "header_2x8",
                "2x10": "header_2x10", "2x12": "header_2x12",
            }
            h_key = header_map.get(op.header_size, "header_2x8")
            h_cost = _lookup_cost(costs, "framing", h_key)
            items.append(_item(
                "Headers", f"{op.header_size} header - {op.id} ({op.width})",
                op.quantity * 2, "ea", h_cost,  # doubled header
                op.quantity * 0.5, rate,
            ))

        # Wall area for labor tracking
        wall_area = wall.gross_area_sqft
        items.append(_item(
            "Wall Framing Labor", f"Framing labor - {wall.id}",
            0, "ea", 0,
            wall_area * 0.04, rate,  # additional assembly labor
        ))

    return items


# ---------------------------------------------------------------------------
# Floor framing
# ---------------------------------------------------------------------------

def _floor_framing(building: BuildingModel, costs: dict) -> list[LineItem]:
    items = []
    rate = _labor_rate(costs)

    if building.stories < 2:
        return items

    for floor_num in range(2, building.stories + 1):
        rooms = building.rooms_on_floor(floor_num)
        floor_area = sum(r.floor_area_sqft for r in rooms)
        if floor_area <= 0:
            continue

        # Estimate perimeter from area (rough: sqrt(area) * 4)
        perim = math.sqrt(floor_area) * 4

        # Rim joist (2x10 or 2x12)
        rim_pieces = math.ceil(perim / 16) * WASTE_LUMBER  # 16' lengths
        items.append(_item(
            "Floor Framing", f"Rim joist 2x10x16 - Floor {floor_num}",
            rim_pieces, "ea", _lookup_cost(costs, "framing", "joist_2x10_16"),
            rim_pieces * 0.15, rate,
        ))

        # Floor joists at 16" OC
        joist_count = math.ceil(math.sqrt(floor_area) * 12 / 16) + 1
        joist_count = math.ceil(joist_count * WASTE_LUMBER)
        items.append(_item(
            "Floor Framing", f"Floor joists 2x10x16 - Floor {floor_num}",
            joist_count, "ea", _lookup_cost(costs, "framing", "joist_2x10_16"),
            joist_count * 0.15, rate,
        ))

        # Blocking - one row per 8' of span
        span = math.sqrt(floor_area)
        blocking_rows = max(1, int(span / 8))
        block_pieces = blocking_rows * joist_count
        items.append(_item(
            "Floor Framing", f"Blocking 2x10 - Floor {floor_num}",
            math.ceil(block_pieces * 0.1), "ea",
            _lookup_cost(costs, "framing", "joist_2x10_16") * 0.25,
            block_pieces * 0.05, rate,
        ))

        # Floor sheathing (3/4" T&G plywood)
        sheets = math.ceil(floor_area / 32) * WASTE_SHEATHING
        items.append(_item(
            "Floor Sheathing", f"3/4\" T&G plywood - Floor {floor_num}",
            sheets, "sheet", _lookup_cost(costs, "framing", "sheathing_plywood_3_4"),
            sheets * 0.03, rate,
        ))

        # Joist hangers
        items.append(_item(
            "Hardware", f"Joist hangers - Floor {floor_num}",
            math.ceil(joist_count * WASTE_HARDWARE), "ea",
            _lookup_cost(costs, "framing", "joist_hanger"),
            joist_count * 0.05, rate,
        ))

    return items


# ---------------------------------------------------------------------------
# Roof framing
# ---------------------------------------------------------------------------

def _roof_framing(building: BuildingModel, costs: dict) -> list[LineItem]:
    items = []
    rate = _labor_rate(costs)

    for rs in building.roof_sections:
        area = rs.actual_area
        if area <= 0:
            continue

        # Rafters or trusses
        if rs.section_type in ("gable", "hip", "gambrel", "mansard", "dutch_hip"):
            # Estimate rafter count from eave length
            eave = rs.eave_length if rs.eave_length > 0 else math.sqrt(rs.horizontal_area) * 2
            rafter_count = math.ceil(eave * 12 / 24) + 1  # 24" OC
            rafter_count = math.ceil(rafter_count * WASTE_LUMBER)

            items.append(_item(
                "Roof Framing", f"Rafters/trusses 2x8 - {rs.id}",
                rafter_count, "ea", _lookup_cost(costs, "framing", "rafter_2x8_16"),
                rafter_count * 0.3, rate,
            ))

            # Hurricane ties
            items.append(_item(
                "Hardware", f"Hurricane ties - {rs.id}",
                math.ceil(rafter_count * WASTE_HARDWARE), "ea",
                _lookup_cost(costs, "framing", "hurricane_tie"),
                rafter_count * 0.05, rate,
            ))

        # Ridge board
        if rs.ridge_length > 0:
            ridge_pieces = math.ceil(rs.ridge_length / 16) * WASTE_LUMBER
            items.append(_item(
                "Roof Framing", f"Ridge board 2x10 - {rs.id}",
                ridge_pieces, "ea", _lookup_cost(costs, "framing", "joist_2x10_16"),
                ridge_pieces * 0.3, rate,
            ))

            # Collar ties (one per 4' of ridge)
            collar_count = math.ceil(rs.ridge_length / 4) * WASTE_LUMBER
            items.append(_item(
                "Roof Framing", f"Collar ties 2x4 - {rs.id}",
                collar_count, "ea", _lookup_cost(costs, "framing", "stud_2x4_92"),
                collar_count * 0.1, rate,
            ))

        # Roof sheathing
        sheets = math.ceil(area / 32) * WASTE_SHEATHING
        items.append(_item(
            "Roof Sheathing", f"OSB 7/16\" sheathing - {rs.id}",
            sheets, "sheet", _lookup_cost(costs, "framing", "sheathing_osb_7_16"),
            sheets * 0.03, rate,
        ))

    # Ceiling joists
    total_ceiling = building.total_ceiling_area()
    if total_ceiling > 0:
        joist_run = math.sqrt(total_ceiling)
        joist_count = math.ceil(joist_run * 12 / 16) + 1
        joist_count = math.ceil(joist_count * WASTE_LUMBER)
        items.append(_item(
            "Ceiling Framing", "Ceiling joists 2x6x16",
            joist_count, "ea", _lookup_cost(costs, "framing", "joist_2x6_16", 8.0),
            joist_count * 0.15, rate,
        ))

    return items


# ---------------------------------------------------------------------------
# Wall sheathing
# ---------------------------------------------------------------------------

def _wall_sheathing(building: BuildingModel, costs: dict) -> list[LineItem]:
    items = []
    rate = _labor_rate(costs)

    ext_area = building.net_exterior_wall_area()
    if ext_area <= 0:
        return items

    sheets = math.ceil(ext_area / 32) * WASTE_SHEATHING
    items.append(_item(
        "Wall Sheathing", "OSB 7/16\" wall sheathing",
        sheets, "sheet", _lookup_cost(costs, "framing", "sheathing_osb_7_16"),
        sheets * 0.03, rate,
    ))

    return items


# ---------------------------------------------------------------------------
# Fasteners
# ---------------------------------------------------------------------------

def _fasteners(building: BuildingModel, costs: dict) -> list[LineItem]:
    items = []
    rate = _labor_rate(costs)

    sqft = building.total_sqft if building.total_sqft > 0 else building.total_floor_area()
    nail_lbs = math.ceil(sqft / 1000 * 20)  # ~20 lbs per 1000 sqft

    items.append(_item(
        "Fasteners", "16d framing nails",
        nail_lbs, "lb", _lookup_cost(costs, "framing", "nails_16d_sinker", 0.08),
        0, rate,
    ))

    # Simpson connectors estimate
    connector_count = len(building.walls) * 2
    items.append(_item(
        "Hardware", "Simpson angle connectors",
        math.ceil(connector_count * WASTE_HARDWARE), "ea",
        _lookup_cost(costs, "framing", "hurricane_tie", 1.50),
        connector_count * 0.05, rate,
    ))

    return items


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def calculate_framing(building: BuildingModel, costs: dict) -> list[LineItem]:
    """Calculate all framing materials and labor."""
    items = []
    items.extend(_wall_framing(building, costs))
    items.extend(_floor_framing(building, costs))
    items.extend(_roof_framing(building, costs))
    items.extend(_wall_sheathing(building, costs))
    items.extend(_fasteners(building, costs))
    return items
