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


def _rigid_per_sf(costs: dict, cost_key: str, fallback: float = 1.50, sheet_sf: float = 32.0) -> float:
    """Convert rigid insulation sheet cost to per-SF cost.
    Rigid insulation costs in the database are per sheet (typically 4x8=32 SF).
    """
    sheet_cost = _lookup_cost(costs, "insulation", cost_key, fallback)
    if sheet_cost > 5.0:  # likely a per-sheet price, not per-SF
        return sheet_cost / sheet_sf
    return sheet_cost


def _blown_per_sf(costs: dict, cost_key: str = "blown_cellulose",
                  fallback: float = 0.35, coverage_sf: float = 40.0) -> float:
    """Convert blown insulation bag cost to per-SF cost.
    Blown cellulose is ~$12.50/bag covering ~40 SF at R-38.
    """
    bag_cost = _lookup_cost(costs, "insulation", cost_key, fallback)
    if bag_cost > 5.0:  # likely a per-bag price, not per-SF
        return bag_cost / coverage_sf
    return bag_cost


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
                sf, "sf", _blown_per_sf(costs, "blown_cellulose"),
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
                sf, "sf", _blown_per_sf(costs, "blown_cellulose"),
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
                    sf, "sf", _rigid_per_sf(costs, "rigid_crawlspace_r10"),
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

    # ── Continuous Insulation (ci) on Exterior Walls ─────────────────
    ci_groups = defaultdict(lambda: {"area": 0.0})

    for wall in building.walls:
        if not wall.is_exterior:
            continue
        ci_type = getattr(wall, "continuous_insulation_type", "")
        ci_r = getattr(wall, "continuous_insulation_r_value", 0.0)
        if not ci_type or ci_r <= 0:
            continue
        net = wall.net_area_sqft(building.openings)
        if net <= 0:
            continue
        key = (wall.floor, ci_type, ci_r)
        ci_groups[key]["area"] += net

    for (floor_num, ci_type, ci_r), data in sorted(ci_groups.items()):
        net = data["area"]
        floor_label = f"Floor {floor_num}" if building.stories > 1 else "Exterior Walls"
        ci_label = ci_type.replace("_", " ").replace("rigid ", "")
        sf = round(net * WASTE_RIGID, 2)
        # Map ci type to cost key
        ci_cost_map = {
            "rigid_xps": "rigid_xps_1in", "rigid_polyiso": "rigid_polyiso_1in",
            "rigid_eps": "rigid_eps_1in", "mineral_wool": "mineral_wool_r15_2x4",
        }
        cost_key = ci_cost_map.get(ci_type, "rigid_xps_1in")
        items.append(_item(
            "Continuous Insulation",
            f"{floor_label} - R-{int(ci_r)} {ci_label} continuous insulation (ci)",
            sf, "sf", _rigid_per_sf(costs, cost_key),
            net * 0.03, rate,
        ))

    # ── Slab Edge Insulation ──────────────────────────────────────────
    if getattr(building, "slab_edge_insulation", False):
        perim = getattr(building, "slab_edge_perimeter", 0.0)
        if perim <= 0:
            perim = building.foundation.perimeter
        slab_r = getattr(building, "slab_edge_insulation_r_value", 10.0)
        slab_depth = getattr(building, "slab_edge_insulation_depth", 2.0)  # feet
        slab_type = getattr(building, "slab_edge_insulation_type", "xps")
        if perim > 0:
            sf = round(perim * slab_depth * WASTE_RIGID, 2)
            cost_key = "rigid_xps_2in" if slab_r >= 10 else "rigid_xps_1in"
            items.append(_item(
                "Slab Insulation",
                f"Slab edge - R-{int(slab_r)} {slab_type.upper()} ({slab_depth:.0f}' depth)",
                sf, "sf", _rigid_per_sf(costs, cost_key),
                perim * 0.05, rate,
            ))

    # ── Under-Slab Insulation ─────────────────────────────────────────
    if getattr(building, "under_slab_insulation", False):
        us_area = getattr(building, "under_slab_insulation_area", 0.0)
        if us_area <= 0:
            us_area = building.foundation.area
        us_r = getattr(building, "under_slab_insulation_r_value", 10.0)
        us_type = getattr(building, "under_slab_insulation_type", "xps")
        if us_area > 0:
            sf = round(us_area * WASTE_RIGID, 2)
            items.append(_item(
                "Slab Insulation",
                f"Under-slab - R-{int(us_r)} {us_type.upper()} rigid foam",
                sf, "sf", _rigid_per_sf(costs, "rigid_xps_2in"),
                us_area * 0.01, rate,
            ))

    # ── Basement Wall Insulation ──────────────────────────────────────
    if getattr(building, "basement_wall_insulation", False):
        bw_area = getattr(building, "basement_wall_area", 0.0)
        bw_type = getattr(building, "basement_wall_insulation_type", "rigid")
        bw_r = getattr(building, "basement_wall_insulation_r_value", 10.0)
        bw_loc = getattr(building, "basement_wall_insulation_location", "interior")
        if bw_area > 0:
            if bw_type == "rigid":
                sf = round(bw_area * WASTE_RIGID, 2)
                items.append(_item(
                    "Basement Insulation",
                    f"Basement wall ({bw_loc}) - R-{int(bw_r)} rigid foam",
                    sf, "sf", _rigid_per_sf(costs, "rigid_crawlspace_r10"),
                    bw_area * 0.03, rate,
                ))
            elif bw_type == "spray_foam_closed":
                depth_in = _spray_foam_depth(bw_r, is_open=False)
                sf_w = math.ceil(bw_area * WASTE_SPRAY)
                bf = round(sf_w * depth_in, 2)
                items.append(_item(
                    "Basement Insulation",
                    f'Basement wall ({bw_loc}) - R-{int(bw_r)} closed-cell spray foam ({depth_in:.1f}")',
                    bf, "bf", _lookup_cost(costs, "insulation", "spray_foam_closed_cell"),
                    bw_area * 0.05, rate,
                ))
            elif bw_type == "batt":
                sf = round(bw_area * WASTE_BATT, 2)
                items.append(_item(
                    "Basement Insulation",
                    f"Basement wall ({bw_loc}) - R-{int(bw_r)} fiberglass batt",
                    sf, "sf", _lookup_cost(costs, "insulation", "batt_r13_2x4_15in"),
                    bw_area * 0.02, rate,
                ))

    # ── Rim/Band Joist Insulation ─────────────────────────────────────
    if getattr(building, "rim_joist_insulation", False):
        rj_perim = getattr(building, "rim_joist_perimeter", 0.0)
        if rj_perim <= 0:
            rj_perim = building.foundation.perimeter
        rj_height_in = getattr(building, "rim_joist_height", 9.25)
        rj_type = getattr(building, "rim_joist_insulation_type", "spray_foam_closed")
        rj_r = getattr(building, "rim_joist_insulation_r_value", 14.0)
        rj_area = rj_perim * (rj_height_in / 12.0) * building.stories
        if rj_area > 0:
            if "spray" in rj_type:
                is_open = "open" in rj_type
                depth_in = _spray_foam_depth(rj_r, is_open)
                sf_w = math.ceil(rj_area * WASTE_SPRAY)
                bf = round(sf_w * depth_in, 2)
                label = "open-cell" if is_open else "closed-cell"
                cost_key = "spray_foam_open_cell" if is_open else "spray_foam_closed_cell"
                items.append(_item(
                    "Rim Joist Insulation",
                    f'Rim/band joist - R-{int(rj_r)} {label} spray foam ({depth_in:.1f}")',
                    bf, "bf", _lookup_cost(costs, "insulation", cost_key),
                    rj_area * 0.06, rate,
                ))
            elif rj_type == "rigid":
                sf = round(rj_area * WASTE_RIGID, 2)
                items.append(_item(
                    "Rim Joist Insulation",
                    f"Rim/band joist - R-{int(rj_r)} rigid foam cut-and-cobble",
                    sf, "sf", _lookup_cost(costs, "insulation", "rigid_xps_2in", 1.50),
                    rj_area * 0.08, rate,
                ))
            elif rj_type == "batt":
                sf = round(rj_area * WASTE_BATT, 2)
                items.append(_item(
                    "Rim Joist Insulation",
                    f"Rim/band joist - R-{int(rj_r)} fiberglass batt",
                    sf, "sf", _lookup_cost(costs, "insulation", _batt_cost_key(rj_r, "2x10")),
                    rj_area * 0.04, rate,
                ))

    # ── Knee Wall Insulation ──────────────────────────────────────────
    if getattr(building, "knee_wall_insulation", False):
        kw_area = getattr(building, "knee_wall_area", 0.0)
        kw_type = getattr(building, "knee_wall_insulation_type", "batt")
        kw_r = getattr(building, "knee_wall_insulation_r_value", 13.0)
        if kw_area > 0:
            if kw_type == "batt":
                sf = round(kw_area * WASTE_BATT, 2)
                items.append(_item(
                    "Knee Wall Insulation",
                    f"Knee walls - R-{int(kw_r)} fiberglass batt",
                    sf, "sf", _lookup_cost(costs, "insulation", _batt_cost_key(kw_r, "2x4")),
                    kw_area * 0.025, rate,
                ))
            elif "spray" in kw_type:
                is_open = "open" in kw_type
                depth_in = _spray_foam_depth(kw_r, is_open)
                sf_w = math.ceil(kw_area * WASTE_SPRAY)
                bf = round(sf_w * depth_in, 2)
                label = "open-cell" if is_open else "closed-cell"
                cost_key = "spray_foam_open_cell" if is_open else "spray_foam_closed_cell"
                items.append(_item(
                    "Knee Wall Insulation",
                    f'Knee walls - R-{int(kw_r)} {label} spray foam ({depth_in:.1f}")',
                    bf, "bf", _lookup_cost(costs, "insulation", cost_key),
                    kw_area * 0.04, rate,
                ))

    # ── Floor Over Unconditioned Space ────────────────────────────────
    if getattr(building, "floor_over_unconditioned", False):
        fu_area = getattr(building, "floor_over_unconditioned_area", 0.0)
        fu_type = getattr(building, "floor_over_unconditioned_type", "batt")
        fu_r = getattr(building, "floor_over_unconditioned_r_value", 19.0)
        fu_support = getattr(building, "floor_over_unconditioned_support", "wire")
        fu_joist = getattr(building, "floor_over_unconditioned_joist_size", "2x10")
        if fu_area > 0:
            if fu_type == "batt":
                sf = round(fu_area * WASTE_BATT, 2)
                cost_key = _batt_cost_key(fu_r, fu_joist)
                items.append(_item(
                    "Floor Insulation",
                    f"Floor over unconditioned - R-{int(fu_r)} fiberglass batt ({fu_joist} joists)",
                    sf, "sf", _lookup_cost(costs, "insulation", cost_key),
                    fu_area * 0.025, rate,
                ))
            elif "spray" in fu_type:
                is_open = "open" in fu_type
                depth_in = _spray_foam_depth(fu_r, is_open)
                sf_w = math.ceil(fu_area * WASTE_SPRAY)
                bf = round(sf_w * depth_in, 2)
                label = "open-cell" if is_open else "closed-cell"
                cost_key = "spray_foam_open_cell" if is_open else "spray_foam_closed_cell"
                items.append(_item(
                    "Floor Insulation",
                    f'Floor over unconditioned - R-{int(fu_r)} {label} spray foam ({depth_in:.1f}")',
                    bf, "bf", _lookup_cost(costs, "insulation", cost_key),
                    fu_area * 0.04, rate,
                ))
            elif fu_type == "blown":
                sf = round(fu_area * WASTE_BLOWN, 2)
                items.append(_item(
                    "Floor Insulation",
                    f"Floor over unconditioned - R-{int(fu_r)} blown insulation",
                    sf, "sf", _blown_per_sf(costs, "blown_cellulose"),
                    fu_area * 0.02, rate,
                ))
            # Support material (wire hangers or netting)
            if fu_support in ("wire", "netting"):
                support_sf = round(fu_area * 1.05, 2)
                cost_key = f"insulation_support_{fu_support}"
                # Support costs are per roll (~300 SF wire, ~250 SF netting); convert to per-SF
                roll_cost = _lookup_cost(costs, "insulation", cost_key, 0.15)
                coverage = 300.0 if fu_support == "wire" else 250.0
                support_per_sf = roll_cost / coverage if roll_cost > 5.0 else roll_cost
                items.append(_item(
                    "Floor Insulation",
                    f"Insulation support - {fu_support} (floor over unconditioned)",
                    support_sf, "sf", support_per_sf,
                    fu_area * 0.005, rate,
                ))

    # ── Garage Ceiling Insulation ─────────────────────────────────────
    if getattr(building, "garage_ceiling_insulation", False):
        gc_area = getattr(building, "garage_ceiling_area", 0.0)
        gc_type = getattr(building, "garage_ceiling_insulation_type", "batt")
        gc_r = getattr(building, "garage_ceiling_insulation_r_value", 30.0)
        if gc_area > 0:
            if gc_type == "batt":
                sf = round(gc_area * WASTE_BATT, 2)
                items.append(_item(
                    "Garage Insulation",
                    f"Garage ceiling - R-{int(gc_r)} fiberglass batt (living space above)",
                    sf, "sf", _lookup_cost(costs, "insulation", _batt_cost_key(gc_r, "2x10")),
                    gc_area * 0.025, rate,
                ))
            elif "spray" in gc_type:
                is_open = "open" in gc_type
                depth_in = _spray_foam_depth(gc_r, is_open)
                sf_w = math.ceil(gc_area * WASTE_SPRAY)
                bf = round(sf_w * depth_in, 2)
                label = "open-cell" if is_open else "closed-cell"
                cost_key = "spray_foam_open_cell" if is_open else "spray_foam_closed_cell"
                items.append(_item(
                    "Garage Insulation",
                    f'Garage ceiling - R-{int(gc_r)} {label} spray foam ({depth_in:.1f}")',
                    bf, "bf", _lookup_cost(costs, "insulation", cost_key),
                    gc_area * 0.04, rate,
                ))

    # ── Garage Wall Insulation ────────────────────────────────────────
    if getattr(building, "garage_wall_insulation", False):
        gw_area = getattr(building, "garage_wall_area", 0.0)
        gw_type = getattr(building, "garage_wall_insulation_type", "batt")
        gw_r = getattr(building, "garage_wall_insulation_r_value", 13.0)
        if gw_area > 0:
            sf = round(gw_area * WASTE_BATT, 2)
            items.append(_item(
                "Garage Insulation",
                f"Garage-to-living wall - R-{int(gw_r)} fiberglass batt",
                sf, "sf", _lookup_cost(costs, "insulation", _batt_cost_key(gw_r, "2x4")),
                gw_area * 0.02, rate,
            ))

    # ── Attic Baffles ─────────────────────────────────────────────────
    if getattr(building, "attic_baffles", False):
        baffle_count = getattr(building, "attic_baffle_count", 0)
        if baffle_count <= 0 and building.attic_area > 0:
            # Estimate: 1 baffle per ~2 LF of eave at 16" OC spacing
            baffle_count = math.ceil(building.eave_perimeter * 0.75)
        if baffle_count > 0:
            items.append(_item(
                "Attic Insulation",
                "Attic ventilation baffles (rafter bays)",
                baffle_count, "ea",
                _lookup_cost(costs, "insulation", "attic_baffle", 1.50),
                baffle_count * 0.05, rate,
            ))

    # ── Attic Hatch Insulation ────────────────────────────────────────
    if getattr(building, "attic_hatch_insulation", False):
        hatch_count = getattr(building, "attic_hatch_count", 1)
        items.append(_item(
            "Attic Insulation",
            "Attic hatch/access insulation cover",
            hatch_count, "ea",
            _lookup_cost(costs, "insulation", "attic_hatch_cover", 35.00),
            hatch_count * 0.25, rate,
        ))

    return items
