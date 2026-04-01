"""
Interior Finishes Trade Calculator

Calculates interior paint, trim/millwork (baseboard, casing, crown),
flooring, and interior doors.
"""

from __future__ import annotations
import math
from models import BuildingModel, LineItem


WASTE_FLOORING = 1.10
WASTE_TRIM = 1.10
WASTE_PAINT = 1.05


def _lookup_cost(costs: dict, section: str, key: str, fallback: float = 0.0) -> float:
    return costs.get(section, {}).get(key, {}).get("cost", fallback)


def _item(trade, category, desc, qty, unit, unit_cost, labor_hrs, labor_rate) -> LineItem:
    li = LineItem(
        trade=trade, category=category, description=desc,
        quantity=round(qty, 2), unit=unit, material_unit_cost=unit_cost,
        labor_hours=round(labor_hrs, 2), labor_rate=labor_rate,
    )
    li.calculate_totals()
    return li


def calculate_interior(building: BuildingModel, costs: dict) -> list[LineItem]:
    """Calculate all interior finish materials and labor."""
    items = []

    painter_rate = costs.get("labor_rates", {}).get("painter", 30.0)
    carpenter_rate = costs.get("labor_rates", {}).get("finish_carpenter", 40.0)
    flooring_rate = costs.get("labor_rates", {}).get("flooring_installer", 32.0)

    coverage_per_gal = 350.0

    # ---------------------------------------------------------------
    # Paint
    # ---------------------------------------------------------------
    total_wall_paint_area = 0.0
    total_ceiling_area = 0.0

    for room in building.rooms:
        # Wall area (perimeter × height, minus ~20 sqft per door opening)
        door_count = sum(
            1 for o in building.openings
            if o.opening_type == "door" and o.location and room.name.lower() in o.location.lower()
        )
        wall_area = room.perimeter_ft * room.ceiling_height.total_feet - (door_count * 20)
        total_wall_paint_area += max(0, wall_area)
        total_ceiling_area += room.ceiling_area_sqft

    # Wall primer
    if total_wall_paint_area > 0:
        primer_gal = math.ceil(total_wall_paint_area / coverage_per_gal) * WASTE_PAINT
        items.append(_item(
            "interior_paint", "Paint", "Interior wall primer (gallon)",
            primer_gal, "gal",
            _lookup_cost(costs, "interior_finishes", "interior_primer", 25),
            total_wall_paint_area * 0.008, painter_rate,
        ))

        # Wall paint (2 coats)
        paint_gal = math.ceil(total_wall_paint_area * 2 / coverage_per_gal) * WASTE_PAINT
        items.append(_item(
            "interior_paint", "Paint", "Interior wall paint - eggshell (gallon)",
            paint_gal, "gal",
            _lookup_cost(costs, "interior_finishes", "interior_paint", 35),
            total_wall_paint_area * 2 * 0.008, painter_rate,
        ))

    # Ceiling paint (1 coat primer + 1 coat paint)
    if total_ceiling_area > 0:
        ceil_primer = math.ceil(total_ceiling_area / coverage_per_gal) * WASTE_PAINT
        items.append(_item(
            "interior_paint", "Paint", "Ceiling primer (gallon)",
            ceil_primer, "gal",
            _lookup_cost(costs, "interior_finishes", "interior_primer", 25),
            total_ceiling_area * 0.008, painter_rate,
        ))
        ceil_paint = math.ceil(total_ceiling_area / coverage_per_gal) * WASTE_PAINT
        items.append(_item(
            "interior_paint", "Paint", "Ceiling paint - flat white (gallon)",
            ceil_paint, "gal",
            _lookup_cost(costs, "interior_finishes", "paint_ceiling_flat", 30),
            total_ceiling_area * 0.008, painter_rate,
        ))

    # Paint supplies
    total_paint_area = total_wall_paint_area + total_ceiling_area
    if total_paint_area > 0:
        roller_kits = max(2, math.ceil(total_paint_area / 2000))
        items.append(_item(
            "interior_paint", "Supplies", "Paint roller/brush kit",
            roller_kits, "set",
            _lookup_cost(costs, "interior_finishes", "paint_supplies_kit", 25),
            0, painter_rate,
        ))
        # Painters tape
        tape_rolls = max(2, math.ceil(total_paint_area / 500))
        items.append(_item(
            "interior_paint", "Supplies", "Painters tape (roll)",
            tape_rolls, "roll",
            _lookup_cost(costs, "interior_finishes", "painters_tape", 6),
            0, painter_rate,
        ))
        # Drop cloths
        items.append(_item(
            "interior_paint", "Supplies", "Drop cloth",
            max(2, len(building.rooms) // 3), "ea",
            _lookup_cost(costs, "interior_finishes", "drop_cloth", 10),
            0, painter_rate,
        ))

    # ---------------------------------------------------------------
    # Trim / Millwork
    # ---------------------------------------------------------------
    total_baseboard_lf = 0.0
    total_crown_lf = 0.0
    total_casing_lf = 0.0

    for room in building.rooms:
        # Baseboard: room perimeter minus door openings (~3' per door)
        door_count = sum(
            1 for o in building.openings
            if o.opening_type == "door" and o.location and room.name.lower() in o.location.lower()
        )
        bb_lf = room.perimeter_ft - (door_count * 3)
        total_baseboard_lf += max(0, bb_lf)

        # Crown molding (only for rooms with it)
        if room.trim_crown:
            total_crown_lf += room.perimeter_ft

    # Baseboard
    if total_baseboard_lf > 0:
        pieces = math.ceil(total_baseboard_lf / 16 * WASTE_TRIM)  # 16' pieces
        items.append(_item(
            "interior_trim", "Baseboard", 'Baseboard 3-1/4" MDF (16 ft)',
            pieces, "ea",
            _lookup_cost(costs, "interior_finishes", "baseboard_3_25_mdf") * 16,
            total_baseboard_lf * 0.08, carpenter_rate,
        ))

    # Door/window casing
    for op in building.openings:
        casing_lf = (op.width.total_feet + op.height.total_feet) * 2 * op.quantity
        total_casing_lf += casing_lf

    if total_casing_lf > 0:
        pieces = math.ceil(total_casing_lf / 7 * WASTE_TRIM)  # 7' pieces
        items.append(_item(
            "interior_trim", "Casing", 'Door/window casing 2-1/4" MDF (7 ft)',
            pieces, "ea",
            _lookup_cost(costs, "interior_finishes", "door_casing_2_25_mdf") * 7,
            total_casing_lf * 0.10, carpenter_rate,
        ))

    # Crown molding
    if total_crown_lf > 0:
        pieces = math.ceil(total_crown_lf / 16 * WASTE_TRIM)
        items.append(_item(
            "interior_trim", "Crown", 'Crown molding 3-5/8" (16 ft)',
            pieces, "ea",
            _lookup_cost(costs, "interior_finishes", "crown_molding_3_5") * 16,
            total_crown_lf * 0.12, carpenter_rate,
        ))

    # Trim nails
    total_trim_lf = total_baseboard_lf + total_casing_lf + total_crown_lf
    if total_trim_lf > 0:
        nail_boxes = max(1, math.ceil(total_trim_lf / 500))
        items.append(_item(
            "interior_trim", "Fasteners", "Finish nails (18 ga, box)",
            nail_boxes, "box",
            _lookup_cost(costs, "interior_finishes", "finish_nails_18ga", 12),
            0, carpenter_rate,
        ))

    # Trim paint (semi-gloss)
    if total_trim_lf > 0:
        trim_paint_area = total_trim_lf * 0.5  # ~0.5 sqft per lf
        trim_gal = math.ceil(trim_paint_area * 2 / coverage_per_gal) * WASTE_PAINT
        items.append(_item(
            "interior_paint", "Paint", "Trim paint - semi-gloss (gallon)",
            max(1, trim_gal), "gal",
            _lookup_cost(costs, "interior_finishes", "paint_semi_gloss", 40),
            trim_paint_area * 2 * 0.01, painter_rate,
        ))

    # ---------------------------------------------------------------
    # Flooring
    # ---------------------------------------------------------------
    flooring_by_type: dict[str, float] = {}
    for room in building.rooms:
        ft = room.floor_type
        flooring_by_type[ft] = flooring_by_type.get(ft, 0) + room.floor_area_sqft

    for ftype, area in flooring_by_type.items():
        if area <= 0:
            continue

        if ftype == "hardwood":
            items.append(_item(
                "flooring", "Hardwood", "Hardwood flooring (3/4\" solid oak)",
                math.ceil(area * WASTE_FLOORING), "sf",
                _lookup_cost(costs, "interior_finishes", "hardwood_oak", 5),
                area * 0.06, flooring_rate,
            ))

        elif ftype == "tile":
            items.append(_item(
                "flooring", "Tile", "Porcelain tile (12x24)",
                math.ceil(area * WASTE_FLOORING), "sf",
                _lookup_cost(costs, "interior_finishes", "tile_porcelain_12x24", 4),
                area * 0.10, flooring_rate,
            ))
            # Thinset mortar (~50 sqft per bag)
            bags = math.ceil(area / 50 * WASTE_FLOORING)
            items.append(_item(
                "flooring", "Tile", "Thinset mortar (50 lb bag)",
                bags, "bag",
                _lookup_cost(costs, "interior_finishes", "thinset_mortar", 15),
                0, flooring_rate,
            ))
            # Grout (~25 sqft per bag)
            grout_bags = math.ceil(area / 25 * WASTE_FLOORING)
            items.append(_item(
                "flooring", "Tile", "Grout (25 lb bag)",
                grout_bags, "bag",
                _lookup_cost(costs, "interior_finishes", "grout_sanded", 12),
                0, flooring_rate,
            ))

        elif ftype == "carpet":
            sq_yards = math.ceil(area / 9 * WASTE_FLOORING)
            items.append(_item(
                "flooring", "Carpet", "Carpet (mid-grade, per sq yd)",
                sq_yards, "sy",
                _lookup_cost(costs, "interior_finishes", "carpet_mid_grade", 25),
                area * 0.03, flooring_rate,
            ))
            # Carpet pad
            items.append(_item(
                "flooring", "Carpet", "Carpet pad (per sq yd)",
                sq_yards, "sy",
                _lookup_cost(costs, "interior_finishes", "carpet_pad", 5),
                0, flooring_rate,
            ))
            # Tack strips
            tack_lf = math.sqrt(area) * 4  # rough perimeter estimate
            items.append(_item(
                "flooring", "Carpet", "Tack strip (4 ft)",
                math.ceil(tack_lf / 4), "ea",
                _lookup_cost(costs, "interior_finishes", "tack_strip", 1.50),
                0, flooring_rate,
            ))

        elif ftype == "vinyl_plank":
            items.append(_item(
                "flooring", "LVP", "Luxury vinyl plank (per sqft)",
                math.ceil(area * WASTE_FLOORING), "sf",
                _lookup_cost(costs, "interior_finishes", "lvp_mid_grade", 3.50),
                area * 0.04, flooring_rate,
            ))
            # Underlayment
            items.append(_item(
                "flooring", "LVP", "LVP underlayment (roll, 100 sqft)",
                math.ceil(area / 100 * WASTE_FLOORING), "roll",
                _lookup_cost(costs, "interior_finishes", "underlayment_flooring", 20),
                0, flooring_rate,
            ))

        elif ftype == "laminate":
            items.append(_item(
                "flooring", "Laminate", "Laminate flooring (per sqft)",
                math.ceil(area * WASTE_FLOORING), "sf",
                _lookup_cost(costs, "interior_finishes", "laminate_mid_grade", 2.50),
                area * 0.04, flooring_rate,
            ))
            items.append(_item(
                "flooring", "Laminate", "Laminate underlayment (roll, 100 sqft)",
                math.ceil(area / 100 * WASTE_FLOORING), "roll",
                _lookup_cost(costs, "interior_finishes", "underlayment_flooring", 15),
                0, flooring_rate,
            ))

    # Transition strips (estimate 1 per doorway between different floor types)
    if len(flooring_by_type) > 1:
        # Count interior doors as approximate transitions
        interior_doors = sum(
            o.quantity for o in building.openings
            if o.opening_type == "door" and o.style in ("interior", "bi_fold", "pocket", "")
        )
        transitions = max(2, interior_doors // 2)
        items.append(_item(
            "flooring", "Transitions", "Floor transition strip (3 ft)",
            transitions, "ea",
            _lookup_cost(costs, "interior_finishes", "transition_strips", 12),
            transitions * 0.25, flooring_rate,
        ))

    # ---------------------------------------------------------------
    # Interior Doors
    # ---------------------------------------------------------------
    for op in building.openings:
        if op.opening_type != "door":
            continue
        # Skip exterior doors (garage, entry)
        if op.style in ("entry", "garage", "sliding_glass", "french_exterior"):
            continue

        door_key = "interior_door_hollow_core" if not op.material or "hollow" in op.material else "interior_door_solid_core"
        items.append(_item(
            "interior_doors", "Doors",
            f"Pre-hung interior door {op.width}x{op.height} - {op.style}",
            op.quantity, "ea",
            _lookup_cost(costs, "interior_finishes", door_key, 120),
            op.quantity * 1.5, carpenter_rate,
        ))

        # Door hardware (knob/lever)
        items.append(_item(
            "interior_doors", "Hardware",
            f"Door hardware (passage/privacy set)",
            op.quantity, "ea",
            _lookup_cost(costs, "interior_finishes", "door_hardware_passage", 15),
            op.quantity * 0.25, carpenter_rate,
        ))

    return items
