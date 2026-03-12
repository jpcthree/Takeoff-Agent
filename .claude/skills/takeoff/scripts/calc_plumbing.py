"""
Plumbing Trade Calculator

Calculates fixtures, water heater, supply/drain/vent piping,
gas lines, and accessories.
"""

from __future__ import annotations
import math
from models import BuildingModel, LineItem


WASTE_PIPE = 1.10
WASTE_FITTINGS = 1.15


def _lookup_cost(costs: dict, section: str, key: str, fallback: float = 0.0) -> float:
    return costs.get(section, {}).get(key, {}).get("cost", fallback)


def _labor_rate(costs: dict) -> float:
    return costs.get("labor_rates", {}).get("plumber", 45.0)


def _item(category, desc, qty, unit, unit_cost, labor_hrs, labor_rate) -> LineItem:
    li = LineItem(
        trade="plumbing", category=category, description=desc,
        quantity=round(qty, 2), unit=unit, material_unit_cost=unit_cost,
        labor_hours=round(labor_hrs, 2), labor_rate=labor_rate,
    )
    li.calculate_totals()
    return li


def calculate_plumbing(building: BuildingModel, costs: dict) -> list[LineItem]:
    """Calculate all plumbing materials and labor."""
    if building.plumbing is None:
        return []

    items = []
    plumb = building.plumbing
    rate = _labor_rate(costs)

    # --- Fixtures ---
    fixture_key_map = {
        "toilet": ("fixture_toilet", 2.0),
        "lavatory": ("fixture_lavatory", 3.0),
        "kitchen_sink": ("fixture_kitchen_sink", 3.0),
        "bathtub": ("fixture_bathtub", 4.0),
        "shower": ("fixture_shower_base", 4.0),
        "tub_shower_combo": ("fixture_bathtub", 4.5),
        "utility_sink": ("fixture_utility_sink", 2.0),
        "wet_bar_sink": ("fixture_lavatory", 2.5),
    }

    for fix in plumb.fixtures:
        key, labor = fixture_key_map.get(fix.fixture_type, ("fixture_toilet", 2.0))
        items.append(_item(
            "Fixtures", f"{fix.fixture_type.replace('_', ' ').title()} - {fix.location}",
            fix.quantity, "ea", _lookup_cost(costs, "plumbing", key),
            fix.quantity * labor, rate,
        ))

        # Faucets (not for toilets)
        if fix.fixture_type != "toilet":
            faucet_key = "faucet_kitchen" if "kitchen" in fix.fixture_type else "faucet_lavatory"
            if "tub" in fix.fixture_type or "shower" in fix.fixture_type:
                faucet_key = "faucet_tub_shower"
            items.append(_item(
                "Faucets", f"Faucet - {fix.fixture_type.replace('_', ' ')}",
                fix.quantity, "ea", _lookup_cost(costs, "plumbing", faucet_key),
                fix.quantity * 1.0, rate,
            ))

    # P-traps (1 per fixture except toilets)
    non_toilet = sum(f.quantity for f in plumb.fixtures if f.fixture_type != "toilet")
    if non_toilet > 0:
        items.append(_item(
            "Fittings", "P-trap (1-1/2\" PVC)",
            non_toilet, "ea", _lookup_cost(costs, "plumbing", "p_trap_1_5", 5),
            0, rate,  # labor in fixture install
        ))

    # --- Water Heater ---
    wh_key_map = {
        "tank_gas": "water_heater_tank_gas_50",
        "tank_electric": "water_heater_tank_electric_50",
        "tankless_gas": "water_heater_tankless_gas",
        "tankless_electric": "water_heater_tankless_electric",
        "heat_pump_hybrid": "water_heater_heat_pump",
    }
    wh_key = wh_key_map.get(plumb.water_heater_type, "water_heater_tank_gas_50")
    items.append(_item(
        "Water Heater",
        f"Water heater ({plumb.water_heater_type.replace('_', ' ')}, {plumb.water_heater_gallons} gal)",
        1, "ea", _lookup_cost(costs, "plumbing", wh_key),
        4.0, rate,
    ))

    # --- Supply Lines ---
    supply_ft = plumb.supply_total_feet
    if supply_ft > 0:
        supply_type = plumb.supply_line_type
        if supply_type == "pex":
            # PEX in 100' rolls, mix of 1/2" and 3/4"
            half_ft = supply_ft * 0.7  # 70% is 1/2"
            three_quarter_ft = supply_ft * 0.3
            rolls_half = math.ceil(half_ft / 100 * WASTE_PIPE)
            rolls_3q = math.ceil(three_quarter_ft / 100 * WASTE_PIPE)
            items.append(_item(
                "Supply", '1/2" PEX (100 ft roll)',
                rolls_half, "roll", _lookup_cost(costs, "plumbing", "pex_half_100ft"),
                half_ft * 0.08, rate,
            ))
            items.append(_item(
                "Supply", '3/4" PEX (100 ft roll)',
                rolls_3q, "roll", _lookup_cost(costs, "plumbing", "pex_3_4_100ft"),
                three_quarter_ft * 0.10, rate,
            ))
            # PEX fittings
            fittings = math.ceil(supply_ft / 10 * WASTE_FITTINGS)
            items.append(_item(
                "Fittings", "PEX crimp fittings (assorted)",
                fittings, "ea", _lookup_cost(costs, "plumbing", "pex_fitting", 2),
                fittings * 0.05, rate,
            ))
            # PEX crimp rings
            items.append(_item(
                "Fittings", "PEX crimp rings (bag)",
                math.ceil(fittings / 50), "bag",
                _lookup_cost(costs, "plumbing", "pex_crimp_rings_bag", 8),
                0, rate,
            ))
        elif supply_type == "copper":
            sticks = math.ceil(supply_ft / 10 * WASTE_PIPE)  # 10' sticks
            items.append(_item(
                "Supply", '1/2" copper pipe (10 ft stick)',
                math.ceil(sticks * 0.7), "ea",
                _lookup_cost(costs, "plumbing", "copper_half_10ft"),
                supply_ft * 0.7 * 0.15, rate,
            ))
            items.append(_item(
                "Supply", '3/4" copper pipe (10 ft stick)',
                math.ceil(sticks * 0.3), "ea",
                _lookup_cost(costs, "plumbing", "copper_3_4_10ft"),
                supply_ft * 0.3 * 0.18, rate,
            ))
            fittings = math.ceil(supply_ft / 5 * WASTE_FITTINGS)
            items.append(_item(
                "Fittings", "Copper fittings (elbows, tees, couplings)",
                fittings, "ea", _lookup_cost(costs, "plumbing", "copper_fitting", 3),
                fittings * 0.1, rate,
            ))
            # Solder and flux
            items.append(_item(
                "Supplies", "Lead-free solder + flux",
                1, "set", _lookup_cost(costs, "plumbing", "solder_flux_kit", 25),
                0, rate,
            ))

    # Shut-off valves (2 per fixture for hot+cold, plus 1 main)
    total_fixtures = plumb.total_fixtures
    valves = total_fixtures * 2 + 1
    items.append(_item(
        "Valves", "Quarter-turn shut-off valves",
        valves, "ea", _lookup_cost(costs, "plumbing", "shutoff_valve_quarter_turn", 8),
        valves * 0.2, rate,
    ))

    # --- Drain/Waste/Vent ---
    drain_ft = plumb.drain_total_feet
    vent_ft = plumb.vent_total_feet

    if drain_ft > 0:
        drain_type = plumb.drain_line_type
        # Mix of 2", 3", 4" PVC/ABS
        items.append(_item(
            "DWV", f'3" {drain_type.upper()} drain pipe',
            math.ceil(drain_ft * 0.5 / 10 * WASTE_PIPE), "ea",
            _lookup_cost(costs, "plumbing", f"{drain_type}_3in_10ft", 12),
            drain_ft * 0.5 * 0.15, rate,
        ))
        items.append(_item(
            "DWV", f'4" {drain_type.upper()} drain pipe (main)',
            math.ceil(drain_ft * 0.3 / 10 * WASTE_PIPE), "ea",
            _lookup_cost(costs, "plumbing", f"{drain_type}_4in_10ft", 18),
            drain_ft * 0.3 * 0.18, rate,
        ))
        items.append(_item(
            "DWV", f'2" {drain_type.upper()} drain pipe (branch)',
            math.ceil(drain_ft * 0.2 / 10 * WASTE_PIPE), "ea",
            _lookup_cost(costs, "plumbing", f"{drain_type}_2in_10ft", 8),
            drain_ft * 0.2 * 0.12, rate,
        ))
        # DWV fittings
        dwv_fittings = math.ceil(drain_ft / 5 * WASTE_FITTINGS)
        items.append(_item(
            "Fittings", f"{drain_type.upper()} DWV fittings (assorted)",
            dwv_fittings, "ea",
            _lookup_cost(costs, "plumbing", f"{drain_type}_fitting", 4),
            dwv_fittings * 0.08, rate,
        ))

    if vent_ft > 0:
        items.append(_item(
            "DWV", '2" PVC vent pipe',
            math.ceil(vent_ft / 10 * WASTE_PIPE), "ea",
            _lookup_cost(costs, "plumbing", "pvc_2in_10ft", 8),
            vent_ft * 0.10, rate,
        ))
        items.append(_item(
            "DWV", "Roof vent flashing",
            max(1, total_fixtures // 4), "ea",
            _lookup_cost(costs, "plumbing", "roof_vent_flashing", 15),
            1.0, rate,
        ))

    # Cleanouts
    cleanouts = building.stories + 1  # 1 per floor + 1 main
    items.append(_item(
        "DWV", "Cleanout plug + fitting",
        cleanouts, "ea", _lookup_cost(costs, "plumbing", "cleanout_plug", 8),
        cleanouts * 0.5, rate,
    ))

    # Pipe cement and primer
    items.append(_item(
        "Supplies", "PVC cement + primer",
        math.ceil((drain_ft + vent_ft) / 200), "set",
        _lookup_cost(costs, "plumbing", "pvc_cement_primer", 12),
        0, rate,
    ))

    # --- Gas Line ---
    if plumb.gas_line and plumb.gas_line_feet > 0:
        items.append(_item(
            "Gas", "CSST flex gas line (per ft)",
            math.ceil(plumb.gas_line_feet * WASTE_PIPE), "lf",
            _lookup_cost(costs, "plumbing", "csst_gas_line_lf", 5),
            plumb.gas_line_feet * 0.15, rate,
        ))
        # Gas shutoff valves (estimate 2-3 appliances)
        gas_valves = 3
        items.append(_item(
            "Gas", "Gas shut-off valve",
            gas_valves, "ea",
            _lookup_cost(costs, "plumbing", "gas_shutoff_valve", 15),
            gas_valves * 0.5, rate,
        ))

    # --- Hose Bibs ---
    if plumb.hose_bibs > 0:
        items.append(_item(
            "Exterior", "Frost-free hose bib",
            plumb.hose_bibs, "ea",
            _lookup_cost(costs, "plumbing", "hose_bib_frost_free", 25),
            plumb.hose_bibs * 1.0, rate,
        ))

    # --- Optional Equipment ---
    if plumb.sump_pump:
        items.append(_item(
            "Equipment", "Sump pump + basin",
            1, "ea", _lookup_cost(costs, "plumbing", "sump_pump", 200),
            3.0, rate,
        ))
    if plumb.water_softener:
        items.append(_item(
            "Equipment", "Water softener",
            1, "ea", _lookup_cost(costs, "plumbing", "water_softener", 500),
            4.0, rate,
        ))
    if plumb.recirculating_pump:
        items.append(_item(
            "Equipment", "Hot water recirculating pump",
            1, "ea", _lookup_cost(costs, "plumbing", "recirc_pump", 200),
            2.0, rate,
        ))

    # Pipe hangers/clamps
    total_pipe = supply_ft + drain_ft + vent_ft
    if total_pipe > 0:
        hangers = math.ceil(total_pipe / 4)
        items.append(_item(
            "Hardware", "Pipe hangers/clamps",
            hangers, "ea", _lookup_cost(costs, "plumbing", "pipe_hanger", 1),
            hangers * 0.03, rate,
        ))

    # Teflon tape
    items.append(_item(
        "Supplies", "Teflon tape (roll)",
        3, "roll", _lookup_cost(costs, "plumbing", "teflon_tape", 2),
        0, rate,
    ))

    return items
