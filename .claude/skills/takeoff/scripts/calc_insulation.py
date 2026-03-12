"""
Insulation Trade Calculator

Calculates wall insulation (per floor), attic/roof deck insulation,
interior sound insulation, crawlspace insulation, floor sound insulation,
air sealing, vapor barrier, house wrap, and related materials.
"""

from __future__ import annotations
import math
from collections import defaultdict
from models import BuildingModel, LineItem


WASTE_BATT = 1.05
WASTE_BLOWN = 1.10
WASTE_RIGID = 1.05
WASTE_SPRAY = 1.05
WASTE_WRAP = 1.10


def _lookup_cost(costs: dict, section: str, key: str, fallback: float = 0.0) -> float:
    return costs.get(section, {}).get(key, {}).get("cost", fallback)


def _labor_rate(costs: dict) -> float:
    return costs.get("labor_rates", {}).get("insulation_installer", 30.0)


def _item(category, desc, qty, unit, unit_cost, labor_hrs, labor_rate) -> LineItem:
    li = LineItem(
        trade="insulation", category=category, description=desc,
        quantity=round(qty, 2), unit=unit, material_unit_cost=unit_cost,
        labor_hours=round(labor_hrs, 2), labor_rate=labor_rate,
    )
    li.calculate_totals()
    return li


def _batt_cost_key(r_value: float, thickness: str) -> str:
    """Map R-value and wall thickness to the correct cost key."""
    mapping = {
        ("2x4", 13): "batt_r13_2x4_15in",
        ("2x4", 15): "batt_r13_2x4_15in",  # R-15 uses same batt
        ("2x6", 19): "batt_r19_2x6_15in",
        ("2x6", 21): "batt_r21_2x6_15in",
        ("2x10", 30): "batt_r30_2x10",
        ("2x12", 38): "batt_r38_2x12",
    }
    return mapping.get((thickness, int(r_value)), "batt_r13_2x4_15in")


R_PER_INCH_OPEN = 3.7   # open-cell spray foam R-value per inch
R_PER_INCH_CLOSED = 7.0  # closed-cell spray foam R-value per inch


def _spray_foam_depth(r_value: float, is_open: bool) -> float:
    """Calculate spray foam depth in inches from target R-value."""
    r_per_inch = R_PER_INCH_OPEN if is_open else R_PER_INCH_CLOSED
    return r_value / r_per_inch


def _mineral_wool_cost_key(thickness: str) -> str:
    """Map wall thickness to mineral wool cost key."""
    if thickness in ("2x6", "2x8", "2x10", "2x12"):
        return "mineral_wool_r23_2x6"
    return "mineral_wool_r15_2x4"


def calculate_insulation(building: BuildingModel, costs: dict) -> list[LineItem]:
    """Calculate all insulation materials and labor."""
    items = []
    rate = _labor_rate(costs)

    # ── Exterior Wall Insulation (grouped by floor + type) ──────────────
    # Aggregate by (floor, insulation_type, r_value) for cleaner line items
    floor_groups = defaultdict(lambda: {"area": 0.0, "thickness": "2x4"})

    for wall in building.walls:
        if not wall.is_exterior:
            continue
        if wall.insulation_type == "none" or not wall.insulation_type:
            continue
        net = wall.net_area_sqft(building.openings)
        if net <= 0:
            continue

        key = (wall.floor, wall.insulation_type, wall.insulation_r_value)
        floor_groups[key]["area"] += net
        floor_groups[key]["thickness"] = wall.thickness

    for (floor_num, ins_type, r_val), data in sorted(floor_groups.items()):
        net = data["area"]
        thickness = data["thickness"]
        floor_label = f"Floor {floor_num}" if building.stories > 1 else "Exterior Walls"

        if ins_type in ("batt", "fiberglass_batt", "fiberglass"):
            sf = round(net * WASTE_BATT, 2)
            cost_key = _batt_cost_key(r_val, thickness)
            items.append(_item(
                "Wall Insulation",
                f"{floor_label} - R-{int(r_val)} fiberglass batt ({thickness} walls)",
                sf, "sf", _lookup_cost(costs, "insulation", cost_key),
                net * 0.02, rate,
            ))

        elif ins_type in ("spray_foam_open", "spray_foam_closed"):
            is_open = "open" in ins_type
            cost_key = "spray_foam_open_cell" if is_open else "spray_foam_closed_cell"
            label = "open-cell" if is_open else "closed-cell"
            depth_in = _spray_foam_depth(r_val, is_open)
            sf_with_waste = math.ceil(net * WASTE_SPRAY)
            board_feet = round(sf_with_waste * depth_in, 2)
            cost_per_bf = _lookup_cost(costs, "insulation", cost_key)  # cost is per BF (sf × 1 inch)
            items.append(_item(
                "Wall Insulation",
                f'{floor_label} - R-{int(r_val)} {label} spray foam ({depth_in:.1f}" depth, {sf_with_waste:,} SF)',
                board_feet, "bf", cost_per_bf,
                net * 0.04, rate,
            ))

        elif ins_type == "rigid":
            sf = round(net * WASTE_RIGID, 2)
            items.append(_item(
                "Wall Insulation",
                f"{floor_label} - R-{int(r_val)} rigid foam board",
                sf, "sf", _lookup_cost(costs, "insulation", "rigid_xps_1in", 1.50),
                net * 0.03, rate,
            ))

        elif ins_type == "blown":
            sf = round(net * WASTE_BLOWN, 2)
            items.append(_item(
                "Wall Insulation",
                f"{floor_label} - R-{int(r_val)} blown-in wall insulation",
                sf, "sf", _lookup_cost(costs, "insulation", "blown_cellulose", 0.80),
                net * 0.02, rate,
            ))

    # ── Interior Sound Insulation (grouped by floor) ────────────────────
    sound_by_floor = defaultdict(lambda: {"area": 0.0, "type": "fiberglass_batt", "thickness": "2x4"})

    for wall in building.walls:
        if wall.is_exterior:
            continue
        if not getattr(wall, "sound_insulation", False):
            continue
        net = wall.net_area_sqft(building.openings)
        if net <= 0:
            continue
        key = wall.floor
        sound_by_floor[key]["area"] += net  # cavity area (single layer)
        sound_by_floor[key]["type"] = getattr(wall, "sound_insulation_type", "fiberglass_batt")
        sound_by_floor[key]["thickness"] = wall.thickness

    for floor_num, data in sorted(sound_by_floor.items()):
        net = data["area"]
        snd_type = data["type"]
        thickness = data["thickness"]
        floor_label = f"Floor {floor_num}" if building.stories > 1 else "Interior"

        if snd_type == "mineral_wool":
            cost_key = _mineral_wool_cost_key(thickness)
            sf = round(net * WASTE_BATT, 2)
            items.append(_item(
                "Sound Insulation",
                f"{floor_label} - Interior walls - mineral wool batt",
                sf, "sf", _lookup_cost(costs, "insulation", cost_key, 1.15),
                net * 0.025, rate,
            ))
        else:  # fiberglass_batt
            r_val = getattr(wall, "sound_insulation_r_value", 13) if 'wall' in dir() else 13
            cost_key = _batt_cost_key(r_val, thickness)
            sf = round(net * WASTE_BATT, 2)
            items.append(_item(
                "Sound Insulation",
                f"{floor_label} - Interior walls - fiberglass batt (sound)",
                sf, "sf", _lookup_cost(costs, "insulation", cost_key),
                net * 0.02, rate,
            ))

    # ── Attic Insulation (attic floor) ──────────────────────────────────
    if getattr(building, "has_attic", True) and building.attic_area > 0:
        attic = building.attic_area
        a_type = building.attic_insulation_type
        a_r = building.attic_insulation_r_value

        if a_type == "blown":
            sf = round(attic * WASTE_BLOWN, 2)
            items.append(_item(
                "Attic Insulation", f"Attic floor - blown-in cellulose R-{int(a_r)}",
                sf, "sf", _lookup_cost(costs, "insulation", "blown_cellulose", 0.80),
                attic * 0.01, rate,
            ))
        elif a_type == "batt":
            sf = round(attic * WASTE_BATT, 2)
            items.append(_item(
                "Attic Insulation", f"Attic floor - R-{int(a_r)} fiberglass batt",
                sf, "sf", _lookup_cost(costs, "insulation", "batt_r38_2x12"),
                attic * 0.02, rate,
            ))
        elif a_type in ("spray_foam_open", "spray_foam_closed"):
            is_open = "open" in a_type
            cost_key = "spray_foam_open_cell" if is_open else "spray_foam_closed_cell"
            label = "open-cell" if is_open else "closed-cell"
            depth_in = _spray_foam_depth(a_r, is_open)
            sf_with_waste = math.ceil(attic * WASTE_SPRAY)
            board_feet = round(sf_with_waste * depth_in, 2)
            cost_per_bf = _lookup_cost(costs, "insulation", cost_key)
            items.append(_item(
                "Attic Insulation",
                f'Attic floor - R-{int(a_r)} {label} spray foam ({depth_in:.1f}" depth, {sf_with_waste:,} SF)',
                board_feet, "bf", cost_per_bf,
                attic * 0.04, rate,
            ))

    # ── Roof Deck Insulation (cathedral/vaulted ceilings) ───────────────
    if getattr(building, "has_cathedral_ceiling", False):
        roof_type = getattr(building, "roof_insulation_type", "none")
        roof_r = getattr(building, "roof_insulation_r_value", 0.0)

        if roof_type != "none" and roof_r > 0:
            roof_area = building.total_roof_area()
            if roof_area > 0:
                if roof_type in ("spray_foam_open", "spray_foam_closed"):
                    is_open = "open" in roof_type
                    cost_key = "spray_foam_open_cell" if is_open else "spray_foam_closed_cell"
                    label = "open-cell" if is_open else "closed-cell"
                    depth_in = _spray_foam_depth(roof_r, is_open)
                    sf_with_waste = math.ceil(roof_area * WASTE_SPRAY)
                    board_feet = round(sf_with_waste * depth_in, 2)
                    cost_per_bf = _lookup_cost(costs, "insulation", cost_key)
                    items.append(_item(
                        "Roof Deck Insulation",
                        f'Roof deck underside - R-{int(roof_r)} {label} spray foam ({depth_in:.1f}" depth, {sf_with_waste:,} SF)',
                        board_feet, "bf", cost_per_bf,
                        roof_area * 0.05, rate,
                    ))
                elif roof_type == "rigid":
                    sf = round(roof_area * WASTE_RIGID, 2)
                    items.append(_item(
                        "Roof Deck Insulation",
                        f"Roof deck - R-{int(roof_r)} rigid foam board",
                        sf, "sf", _lookup_cost(costs, "insulation", "rigid_xps_1in", 1.50),
                        roof_area * 0.04, rate,
                    ))

    # ── Crawlspace ──────────────────────────────────────────────────────
    if building.crawlspace_area > 0:
        cs = building.crawlspace_area

        # Vapor barrier
        if building.crawlspace_vapor_barrier:
            cs_perim = math.sqrt(cs) * 4
            wall_overlap = cs_perim * building.crawlspace_height.total_feet
            total_poly = round((cs + wall_overlap) * WASTE_WRAP, 2)
            items.append(_item(
                "Crawlspace", "6 mil vapor barrier poly",
                total_poly, "sf",
                _lookup_cost(costs, "insulation", "vapor_barrier_6mil", 0.10),
                total_poly * 0.005, rate,
            ))

        # Crawlspace wall insulation (conditioned crawlspace)
        cs_wall_ins = getattr(building, "crawlspace_wall_insulation", False)
        cs_perim = getattr(building, "crawlspace_perimeter", 0.0)
        if cs_wall_ins and cs_perim > 0:
            cs_type = getattr(building, "crawlspace_wall_insulation_type", "rigid")
            cs_r = getattr(building, "crawlspace_wall_insulation_r_value", 10.0)
            wall_area = cs_perim * building.crawlspace_height.total_feet

            if cs_type == "rigid":
                sf = round(wall_area * WASTE_RIGID, 2)
                items.append(_item(
                    "Crawlspace", f"Crawlspace wall insulation - rigid foam R-{int(cs_r)}",
                    sf, "sf", _lookup_cost(costs, "insulation", "rigid_crawlspace_r10", 1.50),
                    wall_area * 0.03, rate,
                ))
            elif cs_type == "spray_foam_closed":
                depth_in = _spray_foam_depth(cs_r, is_open=False)
                sf_with_waste = math.ceil(wall_area * WASTE_SPRAY)
                board_feet = round(sf_with_waste * depth_in, 2)
                cost_per_bf = _lookup_cost(costs, "insulation", "spray_foam_closed_cell")
                items.append(_item(
                    "Crawlspace",
                    f'Crawlspace wall - R-{int(cs_r)} closed-cell spray foam ({depth_in:.1f}" depth, {sf_with_waste:,} SF)',
                    board_feet, "bf", cost_per_bf,
                    wall_area * 0.05, rate,
                ))

    # ── Floor Sound Insulation (between stories) ────────────────────────
    floor_snd = getattr(building, "floor_sound_insulation", False)
    floor_snd_area = getattr(building, "floor_sound_insulation_area", 0.0)
    if floor_snd and floor_snd_area > 0:
        floor_snd_type = getattr(building, "floor_sound_insulation_type", "batt")
        sf = round(floor_snd_area * WASTE_BATT, 2)

        if floor_snd_type == "mineral_wool":
            items.append(_item(
                "Floor Sound Insulation",
                "Between-floor sound insulation - mineral wool batt",
                sf, "sf", _lookup_cost(costs, "insulation", "mineral_wool_r15_2x4", 1.15),
                floor_snd_area * 0.02, rate,
            ))
        else:
            items.append(_item(
                "Floor Sound Insulation",
                "Between-floor sound insulation - fiberglass batt",
                sf, "sf", _lookup_cost(costs, "insulation", "batt_r13_2x4_15in"),
                floor_snd_area * 0.02, rate,
            ))

    # ── Air Sealing ─────────────────────────────────────────────────────
    air_seal = getattr(building, "air_sealing", False)
    if air_seal:
        # Qty = building footprint area (foundation area)
        footprint_sf = building.foundation.area if building.foundation.area > 0 else 0.0
        if footprint_sf > 0:
            items.append(_item(
                "Air Sealing",
                "Air sealing - foam, caulk, and labor (rim joists, top plates, penetrations)",
                footprint_sf, "sf", 0,
                footprint_sf * 0.03, rate,
            ))

    # ── Vapor Barrier (exterior walls) ──────────────────────────────────
    ext_net = building.net_exterior_wall_area()
    if getattr(building, "vapor_barrier", True) and ext_net > 0:
        vb_sf = round(ext_net * WASTE_WRAP, 2)
        items.append(_item(
            "Vapor Barrier", "6 mil poly vapor barrier (walls)",
            vb_sf, "sf",
            _lookup_cost(costs, "insulation", "vapor_barrier_6mil", 0.10),
            ext_net * 0.005, rate,
        ))

    # ── House Wrap ──────────────────────────────────────────────────────
    if building.house_wrap:
        ext_gross = building.total_exterior_wall_area()
        if ext_gross > 0:
            hw_sf = round(ext_gross * WASTE_WRAP, 2)
            items.append(_item(
                "House Wrap", "House wrap (Tyvek type)",
                hw_sf, "sf",
                _lookup_cost(costs, "insulation", "house_wrap_per_sf", 0.50),
                ext_gross * 0.01, rate,
            ))

            # Tape (1 roll per ~700 sf of wrap)
            tape_rolls = math.ceil(hw_sf / 700)
            items.append(_item(
                "House Wrap", "House wrap tape",
                tape_rolls, "roll",
                _lookup_cost(costs, "insulation", "house_wrap_tape", 8.00),
                0, rate,
            ))

            # Cap staples
            boxes = math.ceil(hw_sf / 3000)
            items.append(_item(
                "House Wrap", "Cap staples (box)",
                boxes, "box",
                _lookup_cost(costs, "insulation", "cap_staples_box", 15.00),
                0, rate,
            ))

    return items
