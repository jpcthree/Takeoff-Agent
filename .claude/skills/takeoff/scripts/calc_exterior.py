"""
Exterior Finishes Trade Calculator

Calculates siding, exterior trim, soffit, fascia, and exterior paint.
"""

from __future__ import annotations
import math
from models import BuildingModel, LineItem


WASTE_SIDING = 1.10
WASTE_TRIM = 1.10
WASTE_PAINT = 1.05


def _lookup_cost(costs: dict, section: str, key: str, fallback: float = 0.0) -> float:
    return costs.get(section, {}).get(key, {}).get("cost", fallback)


def _labor_rate(costs: dict) -> float:
    return costs.get("labor_rates", {}).get("siding_installer", 35.0)


def _item(category, desc, qty, unit, unit_cost, labor_hrs, labor_rate) -> LineItem:
    li = LineItem(
        trade="exterior", category=category, description=desc,
        quantity=round(qty, 2), unit=unit, material_unit_cost=unit_cost,
        labor_hours=round(labor_hrs, 2), labor_rate=labor_rate,
    )
    li.calculate_totals()
    return li


def calculate_exterior(building: BuildingModel, costs: dict) -> list[LineItem]:
    """Calculate all exterior finish materials and labor."""
    items = []
    rate = _labor_rate(costs)

    net_ext_area = building.net_exterior_wall_area()
    gross_ext_area = building.total_exterior_wall_area()

    # --- Siding ---
    siding = building.siding_type
    if siding != "none" and net_ext_area > 0:
        siding_key_map = {
            "vinyl": "siding_vinyl_sq",
            "fiber_cement": "siding_fiber_cement_plank",
            "wood_clapboard": "siding_wood_clapboard",
            "wood_shingle": "siding_wood_shingle",
            "metal": "siding_metal_panel",
        }

        if siding == "vinyl":
            squares = math.ceil(net_ext_area / 100) * WASTE_SIDING
            items.append(_item(
                "Siding", "Vinyl siding (per square)",
                squares, "sq", _lookup_cost(costs, "exterior", "siding_vinyl_sq"),
                net_ext_area * 0.04, rate,
            ))
            # Starter strip, J-channel, utility trim
            perim = building.foundation.perimeter if building.foundation.perimeter > 0 else math.sqrt(net_ext_area) * 4
            items.append(_item(
                "Siding Accessories", "Vinyl starter strip (12 ft)",
                math.ceil(perim / 12), "ea",
                _lookup_cost(costs, "exterior", "vinyl_starter_strip", 5),
                perim * 0.01, rate,
            ))
            j_channel_lf = sum(
                (o.height.total_feet * 2 + o.width.total_feet * 2) * o.quantity
                for o in building.openings
            )
            items.append(_item(
                "Siding Accessories", "J-channel (12 ft)",
                math.ceil(j_channel_lf / 12 * WASTE_TRIM), "ea",
                _lookup_cost(costs, "exterior", "vinyl_j_channel", 4),
                j_channel_lf * 0.02, rate,
            ))

        elif siding == "fiber_cement":
            # HardiPlank ~7.5 sqft per 12' plank
            planks = math.ceil(net_ext_area / 7.5) * WASTE_SIDING
            items.append(_item(
                "Siding", "Fiber cement plank (12 ft)",
                planks, "ea",
                _lookup_cost(costs, "exterior", siding_key_map.get(siding, "siding_fiber_cement_plank")),
                net_ext_area * 0.06, rate,
            ))

        elif siding in ("wood_clapboard", "wood_shingle"):
            key = siding_key_map.get(siding, "siding_wood_clapboard")
            squares = math.ceil(net_ext_area / 100) * WASTE_SIDING
            items.append(_item(
                "Siding", f"{siding.replace('_', ' ').title()} (per square)",
                squares, "sq", _lookup_cost(costs, "exterior", key),
                net_ext_area * 0.08, rate,
            ))

        elif siding == "metal":
            # Metal panels ~3 sqft per linear foot of panel
            panels = math.ceil(net_ext_area / 36) * WASTE_SIDING  # ~36 sqft per panel
            items.append(_item(
                "Siding", "Metal siding panel",
                panels, "ea", _lookup_cost(costs, "exterior", "siding_metal_panel"),
                net_ext_area * 0.06, rate,
            ))

    # Brick/stone veneer
    if siding in ("brick", "stone"):
        items.append(_item(
            "Masonry", f"{siding.title()} veneer",
            math.ceil(net_ext_area * WASTE_SIDING), "sf",
            _lookup_cost(costs, "exterior", f"veneer_{siding}_sf", 12),
            net_ext_area * 0.12, rate,
        ))

    # --- Exterior Trim ---
    # Corner boards
    num_corners = 4  # minimum
    corner_height = 8.0 * building.stories
    corner_lf = num_corners * corner_height
    items.append(_item(
        "Trim", "Exterior corner boards (1x4)",
        math.ceil(corner_lf / 8 * WASTE_TRIM), "ea",
        _lookup_cost(costs, "exterior", "trim_1x4_8ft", 8),
        corner_lf * 0.10, rate,
    ))

    # Window/door trim (exterior casing)
    for op in building.openings:
        if op.location and "interior" in op.location.lower():
            continue
        trim_lf = (op.width.total_feet + op.height.total_feet) * 2 * op.quantity
        items.append(_item(
            "Trim", f"Exterior casing - {op.id}",
            math.ceil(trim_lf / 8 * WASTE_TRIM), "ea",
            _lookup_cost(costs, "exterior", "trim_1x4_8ft", 8),
            trim_lf * 0.10, rate,
        ))

    # --- Fascia ---
    if building.fascia_perimeter > 0:
        fascia_pieces = math.ceil(building.fascia_perimeter / 16 * WASTE_TRIM)
        items.append(_item(
            "Fascia", "Fascia board 1x8x16",
            fascia_pieces, "ea",
            _lookup_cost(costs, "exterior", "fascia_1x8_16ft", 18),
            building.fascia_perimeter * 0.08, rate,
        ))

    # --- Soffit ---
    if building.eave_perimeter > 0 and building.eave_depth.total_feet > 0:
        soffit_sqft = building.eave_perimeter * building.eave_depth.total_feet
        # Vinyl soffit panels ~12 sqft each (12' x 12")
        panels = math.ceil(soffit_sqft / 12 * WASTE_TRIM)
        items.append(_item(
            "Soffit", "Vented soffit panel (12 ft)",
            panels, "ea",
            _lookup_cost(costs, "exterior", "soffit_vinyl_vented_12ft", 12),
            soffit_sqft * 0.06, rate,
        ))

    # --- Exterior Paint ---
    if net_ext_area > 0:
        coverage_per_gal = 350.0
        # Primer (1 coat)
        primer_gal = math.ceil(net_ext_area / coverage_per_gal) * WASTE_PAINT
        items.append(_item(
            "Paint", "Exterior primer (gallon)",
            primer_gal, "gal",
            _lookup_cost(costs, "exterior", "paint_exterior_primer_gal", 35),
            net_ext_area * 0.01, rate,
        ))
        # Paint (2 coats)
        paint_gal = math.ceil(net_ext_area * 2 / coverage_per_gal) * WASTE_PAINT
        items.append(_item(
            "Paint", "Exterior paint (gallon)",
            paint_gal, "gal",
            _lookup_cost(costs, "exterior", "paint_exterior_satin_gal", 45),
            net_ext_area * 2 * 0.01, rate,
        ))

        # Trim paint
        trim_area = corner_lf * 0.5 + building.fascia_perimeter * 0.67
        trim_gal = math.ceil(trim_area * 2 / coverage_per_gal) * WASTE_PAINT
        if trim_gal > 0:
            items.append(_item(
                "Paint", "Exterior trim paint (gallon)",
                max(1, trim_gal), "gal",
                _lookup_cost(costs, "exterior", "paint_exterior_semi_gloss_gal", 50),
                trim_area * 0.02, rate,
            ))

    return items
