"""
Electrical Trade Calculator

Calculates panel, breakers, wire, boxes, devices, fixtures,
and safety equipment.
"""

from __future__ import annotations
import math
from collections import defaultdict
from models import BuildingModel, LineItem


WASTE_WIRE = 1.10


def _lookup_cost(costs: dict, section: str, key: str, fallback: float = 0.0) -> float:
    return costs.get(section, {}).get(key, {}).get("cost", fallback)


def _labor_rate(costs: dict) -> float:
    return costs.get("labor_rates", {}).get("electrician", 45.0)


def _item(category, desc, qty, unit, unit_cost, labor_hrs, labor_rate) -> LineItem:
    li = LineItem(
        trade="electrical", category=category, description=desc,
        quantity=round(qty, 2), unit=unit, material_unit_cost=unit_cost,
        labor_hours=round(labor_hrs, 2), labor_rate=labor_rate,
    )
    li.calculate_totals()
    return li


def calculate_electrical(building: BuildingModel, costs: dict) -> list[LineItem]:
    """Calculate all electrical materials and labor."""
    if building.electrical is None:
        return []

    items = []
    elec = building.electrical
    rate = _labor_rate(costs)

    # --- Panel ---
    panel_key = f"panel_{elec.panel_main_amps}amp"
    items.append(_item(
        "Panel", f"Main panel {elec.panel_main_amps}A",
        1, "ea", _lookup_cost(costs, "electrical", panel_key,
                               _lookup_cost(costs, "electrical", "panel_200amp", 250)),
        8.0, rate,
    ))

    # Sub-panels
    if elec.panel_sub > 0:
        items.append(_item(
            "Panel", f"Sub-panel {elec.sub_panel_amps}A",
            elec.panel_sub, "ea",
            _lookup_cost(costs, "electrical", "panel_100amp_sub", 150),
            elec.panel_sub * 4.0, rate,
        ))

    # Meter base + weatherhead
    items.append(_item(
        "Service", "Meter base + weatherhead",
        1, "ea", _lookup_cost(costs, "electrical", "meter_base", 80),
        3.0, rate,
    ))
    items.append(_item(
        "Service", "SE cable (20 ft)",
        1, "ea", _lookup_cost(costs, "electrical", "se_cable_20ft", 60),
        1.0, rate,
    ))

    # Ground rods
    items.append(_item(
        "Grounding", "Ground rod + clamp",
        2, "ea", _lookup_cost(costs, "electrical", "ground_rod", 15),
        1.0, rate,
    ))
    items.append(_item(
        "Grounding", "#4 bare copper ground wire (25 ft)",
        1, "ea", _lookup_cost(costs, "electrical", "ground_wire_6awg", 40),
        0.5, rate,
    ))

    # --- Breakers ---
    breaker_counts = defaultdict(int)
    for circuit in elec.circuits:
        breaker_counts[circuit.breaker_type] += 1

    breaker_key_map = {
        "standard": "breaker_20a",
        "afci": "breaker_afci_20a",
        "gfci": "breaker_gfci_20a",
        "dual_function": "breaker_dual_function_20a",
    }
    for btype, count in breaker_counts.items():
        key = breaker_key_map.get(btype, "breaker_20a")
        items.append(_item(
            "Breakers", f"{btype.replace('_', ' ').title()} breaker",
            count, "ea", _lookup_cost(costs, "electrical", key),
            count * 0.25, rate,
        ))

    # --- Wire ---
    wire_totals = defaultdict(float)
    for circuit in elec.circuits:
        wire_totals[circuit.wire_gauge] += circuit.estimated_length

    wire_key_map = {
        "14/2": "wire_14_2_nm",
        "12/2": "wire_12_2_nm",
        "10/2": "wire_10_2_nm",
        "10/3": "wire_10_3_nm",
        "8/3": "wire_8_3_nm",
        "6/3": "wire_6_3_nm",
    }
    wire_roll_size = {
        "14/2": 250, "12/2": 250, "10/2": 100, "10/3": 100, "8/3": 50, "6/3": 50,
    }
    for gauge, total_ft in wire_totals.items():
        total_ft *= WASTE_WIRE
        roll_size = wire_roll_size.get(gauge, 250)
        rolls = math.ceil(total_ft / roll_size)
        key = wire_key_map.get(gauge, "wire_12_2_nm")
        items.append(_item(
            "Wire", f"NM-B {gauge} ({roll_size} ft roll)",
            rolls, "roll", _lookup_cost(costs, "electrical", key) * roll_size,
            total_ft * 0.02, rate,  # pulling wire labor
        ))

    # Wire staples
    total_wire_ft = sum(wire_totals.values()) * WASTE_WIRE
    staple_boxes = math.ceil(total_wire_ft / 250)
    items.append(_item(
        "Fasteners", "Wire staples (box)",
        staple_boxes, "box", _lookup_cost(costs, "electrical", "wire_staples", 5),
        0, rate,
    ))

    # Wire nuts
    wire_nut_bags = math.ceil(len(elec.circuits) / 10)
    items.append(_item(
        "Fasteners", "Wire nut assortment (bag)",
        wire_nut_bags, "bag", _lookup_cost(costs, "electrical", "wire_nuts_assorted", 8),
        0, rate,
    ))

    # --- Boxes ---
    total_outlet_locations = sum(d.quantity for d in elec.outlets)
    total_switch_locations = sum(d.quantity for d in elec.switches)
    total_fixture_locations = sum(f.quantity for f in elec.fixtures)

    # Device boxes (1-gang default)
    device_boxes = total_outlet_locations + total_switch_locations
    items.append(_item(
        "Boxes", "1-gang device box (plastic)",
        device_boxes, "ea", _lookup_cost(costs, "electrical", "box_single_gang", 0.50),
        device_boxes * 0.1, rate,
    ))

    # Ceiling boxes
    items.append(_item(
        "Boxes", "Ceiling box (round/octagon)",
        total_fixture_locations, "ea",
        _lookup_cost(costs, "electrical", "box_round_ceiling", 1.50),
        total_fixture_locations * 0.1, rate,
    ))

    # Junction boxes
    jboxes = math.ceil(len(elec.circuits) / 3)
    items.append(_item(
        "Boxes", "Junction box (4\" square)",
        jboxes, "ea", _lookup_cost(costs, "electrical", "box_4sq_junction", 2.0),
        jboxes * 0.15, rate,
    ))

    # --- Devices ---
    device_key_map = {
        "standard_outlet": "outlet_standard_15a",
        "gfci_outlet": "outlet_gfci_20a",
        "afci_outlet": "outlet_afci",
        "dedicated_outlet": "outlet_standard_20a",
        "usb_outlet": "outlet_usb",
        "single_switch": "switch_single",
        "3way_switch": "switch_3way",
        "4way_switch": "switch_4way",
        "dimmer_switch": "switch_dimmer",
        "smart_switch": "switch_smart",
        "occupancy_sensor": "switch_occupancy",
    }
    for dev in elec.outlets + elec.switches:
        key = device_key_map.get(dev.device_type, "outlet_standard_15a")
        items.append(_item(
            "Devices", f"{dev.device_type.replace('_', ' ').title()} - {dev.location}",
            dev.quantity, "ea", _lookup_cost(costs, "electrical", key),
            dev.quantity * 0.3, rate,
        ))

    # Cover plates
    total_devices = total_outlet_locations + total_switch_locations
    items.append(_item(
        "Devices", "Cover plates (assorted)",
        total_devices, "ea", _lookup_cost(costs, "electrical", "cover_plate_single", 0.75),
        0, rate,
    ))

    # --- Fixtures ---
    fixture_key_map = {
        "recessed_4in": "recessed_light_4in",
        "recessed_6in": "recessed_light_6in",
        "flush_mount": "flush_mount_fixture",
        "pendant": "pendant_fixture",
        "vanity_bar": "vanity_light_2bulb",
        "under_cabinet": "under_cabinet_light",
        "exterior_wall": "exterior_wall_fixture",
    }
    for fix in elec.fixtures:
        key = fixture_key_map.get(fix.fixture_type, "recessed_light_6in")
        items.append(_item(
            "Fixtures", f"{fix.fixture_type.replace('_', ' ').title()} - {fix.location}",
            fix.quantity, "ea", _lookup_cost(costs, "electrical", key),
            fix.quantity * 0.5, rate,
        ))

    # --- Safety devices ---
    if elec.smoke_detectors > 0:
        items.append(_item(
            "Safety", "Smoke detector (hardwired)",
            elec.smoke_detectors, "ea",
            _lookup_cost(costs, "electrical", "smoke_detector_hardwired"),
            elec.smoke_detectors * 0.25, rate,
        ))
    if elec.co_detectors > 0:
        items.append(_item(
            "Safety", "CO detector (hardwired)",
            elec.co_detectors, "ea",
            _lookup_cost(costs, "electrical", "co_detector_hardwired"),
            elec.co_detectors * 0.25, rate,
        ))

    # Doorbell
    if elec.doorbell:
        items.append(_item(
            "Misc", "Doorbell (wired)",
            1, "ea", _lookup_cost(costs, "electrical", "doorbell_standard", 30),
            0.5, rate,
        ))

    # Garage door opener
    if elec.garage_door_opener > 0:
        items.append(_item(
            "Misc", "Garage door opener circuit/outlet",
            elec.garage_door_opener, "ea",
            _lookup_cost(costs, "electrical", "outlet_standard_20a", 3),
            elec.garage_door_opener * 1.0, rate,
        ))

    # EV charger
    if elec.ev_charger:
        items.append(_item(
            "Misc", "EV charger outlet (NEMA 14-50)",
            1, "ea", _lookup_cost(costs, "electrical", "outlet_nema_14_50", 15),
            2.0, rate,
        ))

    # Circuit rough-in labor (aggregate)
    items.append(_item(
        "Labor", "Circuit rough-in labor",
        0, "ea", 0,
        len(elec.circuits) * 1.0, rate,
    ))

    return items
