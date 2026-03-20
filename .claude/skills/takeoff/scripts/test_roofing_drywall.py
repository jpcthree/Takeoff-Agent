#!/usr/bin/env python3
"""Quick smoke test for roofing and drywall calculators after PDF integration."""

import json
import sys
import os

# Add scripts dir to path
sys.path.insert(0, os.path.dirname(__file__))

from models import BuildingModel, Dimension, Wall, Room, Opening, RoofSection, GutterRun

def build_test_model() -> BuildingModel:
    """Build a realistic test model with new fields."""
    b = BuildingModel()
    b.project_name = "Test House"
    b.stories = 1
    b.sqft = 2000

    # Walls
    b.walls = [
        Wall(id="w1", floor=1, wall_type="exterior", length=Dimension(50, 0),
             height=Dimension(9, 0), thickness="2x6", drywall_type="standard_1_2", drywall_layers=1, drywall_finish_level=4),
        Wall(id="w2", floor=1, wall_type="exterior", length=Dimension(40, 0),
             height=Dimension(9, 0), thickness="2x6", drywall_type="standard_1_2", drywall_layers=1, drywall_finish_level=4),
        Wall(id="w3", floor=1, wall_type="exterior", length=Dimension(50, 0),
             height=Dimension(9, 0), thickness="2x6", drywall_type="standard_1_2", drywall_layers=1, drywall_finish_level=4),
        Wall(id="w4", floor=1, wall_type="exterior", length=Dimension(40, 0),
             height=Dimension(9, 0), thickness="2x6", drywall_type="standard_1_2", drywall_layers=1, drywall_finish_level=4),
        # Fire-rated garage wall with 2 layers
        Wall(id="w5", floor=1, wall_type="interior", length=Dimension(20, 0),
             height=Dimension(9, 0), thickness="2x4", is_fire_rated=True, drywall_type="fire_rated_5_8",
             drywall_layers=2, drywall_finish_level=1),
    ]

    # Rooms
    b.rooms = [
        Room(floor=1, name="Living Room", length=Dimension(20, 0),
             width=Dimension(15, 0), ceiling_height=Dimension(9, 0),
             ceiling_drywall_type="standard_1_2", ceiling_finish_level=4),
        Room(floor=1, name="Kitchen", length=Dimension(15, 0),
             width=Dimension(12, 0), ceiling_height=Dimension(9, 0), is_kitchen=True,
             ceiling_drywall_type="moisture_resistant", ceiling_finish_level=4),
        Room(floor=1, name="Bathroom", length=Dimension(8, 0),
             width=Dimension(6, 0), ceiling_height=Dimension(9, 0), is_bathroom=True,
             ceiling_drywall_type="moisture_resistant", ceiling_finish_level=3),
        Room(floor=1, name="Garage", length=Dimension(20, 0),
             width=Dimension(20, 0), ceiling_height=Dimension(10, 0), is_garage=True,
             ceiling_drywall_type="fire_rated_5_8", ceiling_drywall_layers=1,
             ceiling_finish_level=2),
    ]

    # Openings
    b.openings = [
        Opening(id="o1", opening_type="window", width=Dimension(3, 0), height=Dimension(4, 0), quantity=6),
        Opening(id="o2", opening_type="door", width=Dimension(3, 0), height=Dimension(6, 8), quantity=2),
    ]

    # Roof
    b.roof_sections = [
        RoofSection(id="rs1", section_type="hip", horizontal_area=1100, pitch=6,
                    hip_length=15.0,
                    underlayment_type="synthetic", shingle_type="architectural"),
        RoofSection(id="rs2", section_type="hip", horizontal_area=1100, pitch=6,
                    hip_length=15.0,
                    underlayment_type="synthetic", shingle_type="architectural"),
    ]
    b.roof_ridge_lf = 50.0
    b.roof_hip_lf = 30.0
    b.roof_valley_lf = 20.0
    b.roof_eave_lf = 180.0
    b.roof_rake_lf = 80.0
    b.roof_material = "architectural_shingle"
    b.roof_pitch = 6
    b.has_ridge_vent = True

    # New roofing fields
    b.chimney_count = 1
    b.skylight_count = 2
    b.pipe_boot_count = 4
    b.soffit_vent_count = 8
    b.power_vent_count = 0
    b.step_flashing_lf = 24.0
    b.counter_flashing_lf = 12.0
    b.roof_complexity = "standard"

    # Gutters
    b.gutter_runs = [
        GutterRun(id="g1", location="front", length=50.0,
                  size="5_inch", style="k_style", material="aluminum",
                  downspouts=2, gutter_guard=True,
                  gutter_guard_type="micro_mesh", end_caps=2),
        GutterRun(id="g2", location="back", length=50.0,
                  size="5_inch", style="k_style", material="aluminum",
                  downspouts=2, gutter_guard=True,
                  gutter_guard_type="micro_mesh", end_caps=2),
    ]

    # Drywall accessories
    b.access_panel_count = 2
    b.l_bead_lf = 16.0

    return b


def load_costs():
    costs_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "config", "default_costs.json")
    with open(os.path.abspath(costs_path)) as f:
        return json.load(f)


def test_roofing():
    print("=" * 60)
    print("ROOFING CALCULATOR TEST")
    print("=" * 60)
    from calc_roofing import calculate_roofing
    b = build_test_model()
    costs = load_costs()
    items = calculate_roofing(b, costs)

    total_mat = 0.0
    total_labor = 0.0
    for it in items:
        total_mat += it.material_total
        total_labor += it.labor_total
        print(f"  [{it.category:20s}] {it.description:50s} | qty={it.quantity:8.1f} {it.unit:6s} | mat=${it.material_total:8.2f} | labor=${it.labor_total:8.2f}")

    print(f"\n  TOTAL Material: ${total_mat:,.2f}")
    print(f"  TOTAL Labor:    ${total_labor:,.2f}")
    print(f"  GRAND TOTAL:    ${total_mat + total_labor:,.2f}")
    print(f"  Line items:     {len(items)}")

    # Verify new items exist
    descs = [it.description for it in items]
    checks = {
        "Hip cap": any("hip cap" in d.lower() for d in descs),
        "Chimney flashing": any("chimney" in d.lower() for d in descs),
        "Skylight flashing": any("skylight" in d.lower() for d in descs),
        "Step flashing (LF)": any("step flash" in d.lower() for d in descs),
        "Counter flashing": any("counter flash" in d.lower() for d in descs),
        "Soffit vents": any("soffit vent" in d.lower() for d in descs),
        "Roof cement": any("cement" in d.lower() or "sealant" in d.lower() for d in descs),
        "Gutter guards": any("guard" in d.lower() or "mesh" in d.lower() for d in descs),
        "Outlet drops": any("outlet" in d.lower() for d in descs),
        "Expansion joints": any("expansion" in d.lower() for d in descs),
    }
    print("\n  New line item checks:")
    all_pass = True
    for name, found in checks.items():
        status = "PASS" if found else "FAIL"
        if not found:
            all_pass = False
        print(f"    {status}: {name}")

    return all_pass


def test_drywall():
    print("\n" + "=" * 60)
    print("DRYWALL CALCULATOR TEST")
    print("=" * 60)
    from calc_drywall import calculate_drywall
    b = build_test_model()
    costs = load_costs()
    items = calculate_drywall(b, costs)

    total_mat = 0.0
    total_labor = 0.0
    for it in items:
        total_mat += it.material_total
        total_labor += it.labor_total
        print(f"  [{it.category:20s}] {it.description:50s} | qty={it.quantity:8.1f} {it.unit:6s} | mat=${it.material_total:8.2f} | labor=${it.labor_total:8.2f}")

    print(f"\n  TOTAL Material: ${total_mat:,.2f}")
    print(f"  TOTAL Labor:    ${total_labor:,.2f}")
    print(f"  GRAND TOTAL:    ${total_mat + total_labor:,.2f}")
    print(f"  Line items:     {len(items)}")

    # Verify new items
    descs = [it.description for it in items]
    checks = {
        "Multi-layer (2 layers)": any("2 layers" in d for d in descs),
        "Fire-rated sheets": any("fire-rated" in d.lower() or "type x" in d.lower() for d in descs),
        "Setting compound": any("setting" in d.lower() for d in descs),
        "Bullnose corner bead": any("bullnose" in d.lower() for d in descs),
        "L-bead/J-bead": any("l-bead" in d.lower() or "j-bead" in d.lower() for d in descs),
        "Access panels": any("access panel" in d.lower() for d in descs),
        "GA-214 finish level": any("ga-214" in d.lower() or "finish level" in d.lower() for d in descs),
    }
    print("\n  New line item checks:")
    all_pass = True
    for name, found in checks.items():
        status = "PASS" if found else "FAIL"
        if not found:
            all_pass = False
        print(f"    {status}: {name}")

    return all_pass


def test_backward_compat():
    print("\n" + "=" * 60)
    print("BACKWARD COMPATIBILITY TEST")
    print("=" * 60)
    from calc_roofing import calculate_roofing
    from calc_drywall import calculate_drywall

    # Minimal model without any new fields
    b = BuildingModel()
    b.walls = [
        Wall(id="w1", floor=1, wall_type="exterior", length=Dimension(30, 0),
             height=Dimension(9, 0), thickness="2x6"),
    ]
    b.rooms = [
        Room(floor=1, name="Room", length=Dimension(15, 0),
             width=Dimension(15, 0), ceiling_height=Dimension(9, 0)),
    ]
    b.roof_sections = [
        RoofSection(id="rs1", section_type="gable", horizontal_area=500, pitch=5),
    ]
    b.roof_ridge_lf = 30.0
    b.roof_eave_lf = 60.0
    b.roof_rake_lf = 40.0
    b.roof_material = "architectural_shingle"
    b.has_ridge_vent = True

    costs = load_costs()

    try:
        roofing_items = calculate_roofing(b, costs)
        print(f"  Roofing: {len(roofing_items)} items — PASS")
    except Exception as e:
        print(f"  Roofing: FAIL — {e}")
        return False

    try:
        drywall_items = calculate_drywall(b, costs)
        print(f"  Drywall: {len(drywall_items)} items — PASS")
    except Exception as e:
        print(f"  Drywall: FAIL — {e}")
        return False

    return True


def test_serialization():
    print("\n" + "=" * 60)
    print("SERIALIZATION ROUNDTRIP TEST")
    print("=" * 60)
    b = build_test_model()
    d = b.to_dict()
    b2 = BuildingModel.from_dict(d)

    checks = {
        "chimney_count": b2.chimney_count == 1,
        "skylight_count": b2.skylight_count == 2,
        "pipe_boot_count": b2.pipe_boot_count == 4,
        "roof_complexity": b2.roof_complexity == "standard",
        "step_flashing_lf": b2.step_flashing_lf == 24.0,
        "access_panel_count": b2.access_panel_count == 2,
        "l_bead_lf": b2.l_bead_lf == 16.0,
        "wall drywall_layers": b2.walls[4].drywall_layers == 2,
        "wall drywall_finish_level": b2.walls[4].drywall_finish_level == 1,
        "room ceiling_drywall_type": b2.rooms[1].ceiling_drywall_type == "moisture_resistant",
        "room ceiling_finish_level": b2.rooms[2].ceiling_finish_level == 3,
        "gutter_guard": b2.gutter_runs[0].gutter_guard == True,
        "gutter_guard_type": b2.gutter_runs[0].gutter_guard_type == "micro_mesh",
        "end_caps": b2.gutter_runs[0].end_caps == 2,
        "underlayment_type": b2.roof_sections[0].underlayment_type == "synthetic",
        "shingle_type": b2.roof_sections[0].shingle_type == "architectural",
    }

    all_pass = True
    for name, passed in checks.items():
        status = "PASS" if passed else "FAIL"
        if not passed:
            all_pass = False
        print(f"  {status}: {name}")

    return all_pass


if __name__ == "__main__":
    results = []
    results.append(("Serialization", test_serialization()))
    results.append(("Backward Compat", test_backward_compat()))
    results.append(("Roofing", test_roofing()))
    results.append(("Drywall", test_drywall()))

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    all_pass = True
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        if not passed:
            all_pass = False
        print(f"  {status}: {name}")

    sys.exit(0 if all_pass else 1)
