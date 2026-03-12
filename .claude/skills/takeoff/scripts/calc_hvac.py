"""
HVAC Trade Calculator

Calculates equipment, ductwork, registers, controls, refrigerant lines,
condensate, and exhaust ventilation.
"""

from __future__ import annotations
import math
from models import BuildingModel, LineItem


def _lookup_cost(costs: dict, section: str, key: str, fallback: float = 0.0) -> float:
    return costs.get(section, {}).get(key, {}).get("cost", fallback)


def _labor_rate(costs: dict) -> float:
    return costs.get("labor_rates", {}).get("hvac_technician", 45.0)


def _item(category, desc, qty, unit, unit_cost, labor_hrs, labor_rate) -> LineItem:
    li = LineItem(
        trade="hvac", category=category, description=desc,
        quantity=round(qty, 2), unit=unit, material_unit_cost=unit_cost,
        labor_hours=round(labor_hrs, 2), labor_rate=labor_rate,
    )
    li.calculate_totals()
    return li


def calculate_hvac(building: BuildingModel, costs: dict) -> list[LineItem]:
    """Calculate all HVAC materials and labor."""
    if building.hvac is None:
        return []

    items = []
    hvac = building.hvac
    rate = _labor_rate(costs)

    # --- Equipment ---
    equip = hvac.equipment_type
    if equip == "furnace_ac":
        items.append(_item(
            "Equipment", f"Gas furnace {hvac.heating_btu // 1000}K BTU",
            1, "ea", _lookup_cost(costs, "hvac", "furnace_gas_80k"),
            8.0, rate,
        ))
        tons = hvac.cooling_tons
        key = f"ac_condenser_{int(tons)}ton"
        items.append(_item(
            "Equipment", f"AC condenser {tons:.1f} ton",
            1, "ea", _lookup_cost(costs, "hvac", key,
                                   _lookup_cost(costs, "hvac", "ac_condenser_3ton", 2500)),
            6.0, rate,
        ))
        items.append(_item(
            "Equipment", "Evaporator coil",
            1, "ea", _lookup_cost(costs, "hvac", "evaporator_coil", 600),
            2.0, rate,
        ))
    elif equip == "heat_pump":
        items.append(_item(
            "Equipment", f"Heat pump {hvac.cooling_tons:.1f} ton",
            1, "ea", _lookup_cost(costs, "hvac", "heat_pump_3ton", 3500),
            10.0, rate,
        ))
        items.append(_item(
            "Equipment", "Air handler",
            1, "ea", _lookup_cost(costs, "hvac", "air_handler", 1200),
            4.0, rate,
        ))
    elif equip == "mini_split":
        heads = max(1, hvac.num_zones)
        items.append(_item(
            "Equipment", f"Mini-split condenser ({heads}-zone)",
            1, "ea", _lookup_cost(costs, "hvac", "mini_split_condenser", 2000),
            6.0, rate,
        ))
        items.append(_item(
            "Equipment", "Mini-split wall head units",
            heads, "ea", _lookup_cost(costs, "hvac", "mini_split_head", 800),
            heads * 4.0, rate,
        ))

    # Condenser pad
    items.append(_item(
        "Equipment", "Condenser mounting pad",
        1, "ea", _lookup_cost(costs, "hvac", "condenser_pad", 50),
        0.5, rate,
    ))

    # --- Ductwork ---
    total_duct_lf = 0.0
    for dr in hvac.duct_runs:
        lf = dr.length
        total_duct_lf += lf
        mat = dr.material
        key = "duct_flex_6in" if "flex" in mat else "duct_sheet_metal_6x10"
        items.append(_item(
            "Ductwork", f"{dr.duct_type.title()} duct {dr.size} ({mat})",
            math.ceil(lf), "lf", _lookup_cost(costs, "hvac", key),
            lf * 0.25, rate,
        ))

    if total_duct_lf > 0:
        # Duct tape/mastic
        rolls = math.ceil(total_duct_lf / 50)
        items.append(_item(
            "Ductwork", "Duct mastic/sealant",
            rolls, "ea", _lookup_cost(costs, "hvac", "duct_mastic_gal", 15),
            rolls * 0.5, rate,
        ))

        # Duct insulation
        items.append(_item(
            "Ductwork", "Duct insulation wrap",
            math.ceil(total_duct_lf * 0.75), "lf",
            _lookup_cost(costs, "hvac", "duct_insulation_wrap_lf", 1.50),
            total_duct_lf * 0.05, rate,
        ))

        # Duct hangers/straps
        hangers = math.ceil(total_duct_lf / 4)
        items.append(_item(
            "Ductwork", "Duct hangers/straps",
            hangers, "ea", _lookup_cost(costs, "hvac", "duct_hanger", 2.0),
            hangers * 0.05, rate,
        ))

    # --- Registers & Grilles ---
    for reg in hvac.supply_registers:
        items.append(_item(
            "Registers", f"Supply register {reg.size} ({reg.style})",
            reg.quantity, "ea", _lookup_cost(costs, "hvac", "register_supply_4x10"),
            reg.quantity * 0.25, rate,
        ))

    for gr in hvac.return_grilles:
        items.append(_item(
            "Grilles", f"Return grille {gr.size} ({gr.style})",
            gr.quantity, "ea", _lookup_cost(costs, "hvac", "grille_return_14x20"),
            gr.quantity * 0.25, rate,
        ))

    # Filter grilles
    returns = len(hvac.return_grilles)
    if returns > 0:
        items.append(_item(
            "Grilles", "Filter grille/access",
            returns, "ea", _lookup_cost(costs, "hvac", "filter_grille", 25),
            returns * 0.25, rate,
        ))

    # --- Controls ---
    items.append(_item(
        "Controls", "Programmable thermostat",
        hvac.thermostats, "ea", _lookup_cost(costs, "hvac", "thermostat_programmable"),
        hvac.thermostats * 1.0, rate,
    ))

    if hvac.zoning and hvac.num_zones > 1:
        items.append(_item(
            "Controls", "Zone dampers",
            hvac.num_zones, "ea", _lookup_cost(costs, "hvac", "zone_damper", 150),
            hvac.num_zones * 1.0, rate,
        ))
        items.append(_item(
            "Controls", "Zone control panel",
            1, "ea", _lookup_cost(costs, "hvac", "zone_panel", 300),
            2.0, rate,
        ))

    # --- Refrigerant lines ---
    if hvac.refrigerant_line_sets > 0:
        items.append(_item(
            "Refrigerant", "Line set (25 ft pre-charged)",
            hvac.refrigerant_line_sets, "set",
            _lookup_cost(costs, "hvac", "line_set_25ft", 80),
            hvac.refrigerant_line_sets * 2.0, rate,
        ))

    # --- Condensate ---
    if hvac.condensate_drains > 0:
        items.append(_item(
            "Condensate", "Condensate drain PVC + pump",
            hvac.condensate_drains, "ea",
            _lookup_cost(costs, "hvac", "condensate_pump", 60),
            hvac.condensate_drains * 1.0, rate,
        ))

    # --- Exhaust fans ---
    if hvac.exhaust_fans > 0:
        items.append(_item(
            "Exhaust", "Bath exhaust fan (80 CFM)",
            hvac.exhaust_fans, "ea",
            _lookup_cost(costs, "hvac", "exhaust_fan_bath", 80),
            hvac.exhaust_fans * 1.5, rate,
        ))
        # Vent ducting per fan
        items.append(_item(
            "Exhaust", "Exhaust vent ducting (4\" flex, 15 ft)",
            hvac.exhaust_fans, "ea",
            _lookup_cost(costs, "hvac", "duct_flex_4in_25ft", 25) * 0.6,
            hvac.exhaust_fans * 0.5, rate,
        ))
        # Roof/wall caps
        items.append(_item(
            "Exhaust", "Exhaust vent cap",
            hvac.exhaust_fans, "ea",
            _lookup_cost(costs, "hvac", "vent_cap_4in", 15),
            hvac.exhaust_fans * 0.25, rate,
        ))

    return items
