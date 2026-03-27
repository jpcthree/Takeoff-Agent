#!/usr/bin/env python3
"""
Insulation Takeoff for Courtyard Duplex
3434, 3432, & 3432 1/2 Quivas St, Denver CO 80211

Climate Zone 5B — IECC 2021
"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))

from models import BuildingModel, Wall, Room, Opening, Dimension

# ============================================================================
# BUILD MODEL
# ============================================================================
b = BuildingModel()
b.project_name = "Courtyard Duplex — 3432 Quivas St"
b.project_address = "3434, 3432, & 3432 1/2 N. Quivas St, Denver CO 80211"
b.stories = 3  # Basement + Level 1 + Level 2 (main house)
b.sqft = 4200  # ~1,400 SF x 3 floors main house

# ── OPENINGS (windows & doors — estimated from schedule A0.03) ─────────────
# Main house windows (approx 30 across all floors)
b.openings = [
    # Basement windows (small, egress)
    Opening(id="bsmt_win", opening_type="window", width=Dimension(3, 0), height=Dimension(3, 0), quantity=6),
    # Level 1 windows
    Opening(id="l1_win_n", opening_type="window", width=Dimension(4, 0), height=Dimension(5, 0), quantity=4),
    Opening(id="l1_win_s", opening_type="window", width=Dimension(4, 0), height=Dimension(5, 0), quantity=4),
    Opening(id="l1_win_e", opening_type="window", width=Dimension(3, 0), height=Dimension(5, 0), quantity=2),
    Opening(id="l1_win_w", opening_type="window", width=Dimension(5, 0), height=Dimension(7, 0), quantity=2),
    # Level 1 doors
    Opening(id="l1_door_w", opening_type="door", width=Dimension(3, 0), height=Dimension(7, 0), quantity=2),
    Opening(id="l1_door_s", opening_type="door", width=Dimension(6, 0), height=Dimension(7, 0), quantity=2),  # sliding
    # Level 2 windows
    Opening(id="l2_win_n", opening_type="window", width=Dimension(4, 0), height=Dimension(5, 0), quantity=4),
    Opening(id="l2_win_s", opening_type="window", width=Dimension(4, 0), height=Dimension(5, 0), quantity=4),
    Opening(id="l2_win_e", opening_type="window", width=Dimension(3, 0), height=Dimension(5, 0), quantity=2),
    Opening(id="l2_win_w", opening_type="window", width=Dimension(3, 0), height=Dimension(5, 0), quantity=2),
    # ADU windows
    Opening(id="adu_win_n", opening_type="window", width=Dimension(4, 0), height=Dimension(5, 0), quantity=2),
    Opening(id="adu_win_s", opening_type="window", width=Dimension(4, 0), height=Dimension(5, 0), quantity=2),
    Opening(id="adu_win_e", opening_type="window", width=Dimension(5, 0), height=Dimension(6, 0), quantity=2),
    Opening(id="adu_win_w", opening_type="window", width=Dimension(3, 0), height=Dimension(5, 0), quantity=1),
    Opening(id="adu_door", opening_type="door", width=Dimension(3, 0), height=Dimension(7, 0), quantity=1),
    # Garage doors (not in thermal envelope walls, but on garage exterior)
    Opening(id="gar_door1", opening_type="door", width=Dimension(9, 0), height=Dimension(7, 0), quantity=2),
]

# ── EXTERIOR WALLS — BASEMENT (W1A/W1B: furred concrete, R-19 CC spray) ────
b.walls = [
    Wall(id="bsmt_n", floor=0, wall_type="exterior", location="north",
         length=Dimension(56, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="spray_foam_closed", insulation_r_value=19.0,
         interior_finish="drywall", exterior_finish="none",
         sheathing_type="none",
         openings=["bsmt_win"],
         drywall_type="standard_1_2"),
    Wall(id="bsmt_s", floor=0, wall_type="exterior", location="south",
         length=Dimension(56, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="spray_foam_closed", insulation_r_value=19.0,
         interior_finish="drywall", exterior_finish="none",
         sheathing_type="none",
         drywall_type="standard_1_2"),
    Wall(id="bsmt_e", floor=0, wall_type="exterior", location="east",
         length=Dimension(25, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="spray_foam_closed", insulation_r_value=19.0,
         interior_finish="drywall", exterior_finish="none",
         sheathing_type="none",
         drywall_type="standard_1_2"),
    Wall(id="bsmt_w", floor=0, wall_type="exterior", location="west",
         length=Dimension(25, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="spray_foam_closed", insulation_r_value=19.0,
         interior_finish="drywall", exterior_finish="none",
         sheathing_type="none",
         drywall_type="standard_1_2"),

    # ── EXTERIOR WALLS — LEVEL 1 (W3/W4/W5: CC spray R-20 + ZIP-R6) ────────
    Wall(id="l1_n", floor=1, wall_type="exterior", location="north",
         length=Dimension(56, 0), height=Dimension(10, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="spray_foam_closed", insulation_r_value=20.0,
         continuous_insulation_type="rigid_polyiso", continuous_insulation_r_value=6.0,
         continuous_insulation_thickness=1.5,
         interior_finish="drywall", exterior_finish="siding",
         sheathing_type="OSB",
         openings=["l1_win_n"],
         drywall_type="standard_1_2"),
    Wall(id="l1_s", floor=1, wall_type="exterior", location="south",
         length=Dimension(56, 0), height=Dimension(10, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="spray_foam_closed", insulation_r_value=20.0,
         continuous_insulation_type="rigid_polyiso", continuous_insulation_r_value=6.0,
         continuous_insulation_thickness=1.5,
         interior_finish="drywall", exterior_finish="siding",
         sheathing_type="OSB",
         openings=["l1_win_s", "l1_door_s"],
         drywall_type="standard_1_2"),
    Wall(id="l1_e", floor=1, wall_type="exterior", location="east",
         length=Dimension(25, 0), height=Dimension(10, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="spray_foam_closed", insulation_r_value=20.0,
         continuous_insulation_type="rigid_polyiso", continuous_insulation_r_value=6.0,
         continuous_insulation_thickness=1.5,
         interior_finish="drywall", exterior_finish="brick",
         sheathing_type="OSB",
         openings=["l1_win_e"],
         drywall_type="standard_1_2"),
    Wall(id="l1_w", floor=1, wall_type="exterior", location="west",
         length=Dimension(25, 0), height=Dimension(10, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="spray_foam_closed", insulation_r_value=20.0,
         continuous_insulation_type="rigid_polyiso", continuous_insulation_r_value=6.0,
         continuous_insulation_thickness=1.5,
         interior_finish="drywall", exterior_finish="siding",
         sheathing_type="OSB",
         openings=["l1_win_w", "l1_door_w"],
         drywall_type="standard_1_2"),

    # ── EXTERIOR WALLS — LEVEL 2 (same as Level 1) ─────────────────────────
    Wall(id="l2_n", floor=2, wall_type="exterior", location="north",
         length=Dimension(56, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="spray_foam_closed", insulation_r_value=20.0,
         continuous_insulation_type="rigid_polyiso", continuous_insulation_r_value=6.0,
         continuous_insulation_thickness=1.5,
         interior_finish="drywall", exterior_finish="siding",
         sheathing_type="OSB",
         openings=["l2_win_n"],
         drywall_type="standard_1_2"),
    Wall(id="l2_s", floor=2, wall_type="exterior", location="south",
         length=Dimension(56, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="spray_foam_closed", insulation_r_value=20.0,
         continuous_insulation_type="rigid_polyiso", continuous_insulation_r_value=6.0,
         continuous_insulation_thickness=1.5,
         interior_finish="drywall", exterior_finish="siding",
         sheathing_type="OSB",
         openings=["l2_win_s"],
         drywall_type="standard_1_2"),
    Wall(id="l2_e", floor=2, wall_type="exterior", location="east",
         length=Dimension(25, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="spray_foam_closed", insulation_r_value=20.0,
         continuous_insulation_type="rigid_polyiso", continuous_insulation_r_value=6.0,
         continuous_insulation_thickness=1.5,
         interior_finish="drywall", exterior_finish="brick",
         sheathing_type="OSB",
         openings=["l2_win_e"],
         drywall_type="standard_1_2"),
    Wall(id="l2_w", floor=2, wall_type="exterior", location="west",
         length=Dimension(25, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="spray_foam_closed", insulation_r_value=20.0,
         continuous_insulation_type="rigid_polyiso", continuous_insulation_r_value=6.0,
         continuous_insulation_thickness=1.5,
         interior_finish="drywall", exterior_finish="siding",
         sheathing_type="OSB",
         openings=["l2_win_w"],
         drywall_type="standard_1_2"),

    # ── ADU EXTERIOR WALLS (R-21 batt per wall schedule) ────────────────────
    Wall(id="adu_n", floor=2, wall_type="exterior", location="ADU north",
         length=Dimension(22, 0), height=Dimension(9, 0), thickness="2x6",
         stud_spacing=16.0,
         insulation_type="batt", insulation_r_value=21.0,
         interior_finish="drywall", exterior_finish="siding",
         sheathing_type="OSB",
         openings=["adu_win_n"],
         drywall_type="standard_1_2"),
    Wall(id="adu_s", floor=2, wall_type="exterior", location="ADU south",
         length=Dimension(22, 0), height=Dimension(9, 0), thickness="2x6",
         stud_spacing=16.0,
         insulation_type="batt", insulation_r_value=21.0,
         interior_finish="drywall", exterior_finish="siding",
         sheathing_type="OSB",
         openings=["adu_win_s"],
         drywall_type="standard_1_2"),
    Wall(id="adu_e", floor=2, wall_type="exterior", location="ADU east",
         length=Dimension(25, 0), height=Dimension(9, 0), thickness="2x6",
         stud_spacing=16.0,
         insulation_type="batt", insulation_r_value=21.0,
         interior_finish="drywall", exterior_finish="siding",
         sheathing_type="OSB",
         openings=["adu_win_e"],
         drywall_type="standard_1_2"),
    Wall(id="adu_w", floor=2, wall_type="exterior", location="ADU west",
         length=Dimension(25, 0), height=Dimension(9, 0), thickness="2x6",
         stud_spacing=16.0,
         insulation_type="batt", insulation_r_value=21.0,
         interior_finish="drywall", exterior_finish="siding",
         sheathing_type="OSB",
         openings=["adu_win_w", "adu_door"],
         drywall_type="standard_1_2"),

    # ── PARTY WALL W17 (between Unit 01 & 02, batt, 2-hr fire rated) ───────
    Wall(id="party_bsmt", floor=0, wall_type="party", location="party wall",
         length=Dimension(25, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0, is_fire_rated=True, fire_rating_hours=2.0,
         insulation_type="batt", insulation_r_value=13.0,
         sound_insulation=True, sound_insulation_type="fiberglass_batt", sound_insulation_r_value=13.0,
         interior_finish="drywall",
         drywall_type="fire_rated_5_8"),
    Wall(id="party_l1", floor=1, wall_type="party", location="party wall",
         length=Dimension(25, 0), height=Dimension(10, 0), thickness="2x4",
         stud_spacing=16.0, is_fire_rated=True, fire_rating_hours=2.0,
         insulation_type="batt", insulation_r_value=13.0,
         sound_insulation=True, sound_insulation_type="fiberglass_batt", sound_insulation_r_value=13.0,
         interior_finish="drywall",
         drywall_type="fire_rated_5_8"),
    Wall(id="party_l2", floor=2, wall_type="party", location="party wall",
         length=Dimension(25, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0, is_fire_rated=True, fire_rating_hours=2.0,
         insulation_type="batt", insulation_r_value=13.0,
         sound_insulation=True, sound_insulation_type="fiberglass_batt", sound_insulation_r_value=13.0,
         interior_finish="drywall",
         drywall_type="fire_rated_5_8"),

    # ── INTERIOR SOUND WALLS — Bedrooms & Bathrooms (W13/W14) ──────────────
    # Basement: 2 bedrooms + 2 bathrooms per unit = 4 BR + 4 BA walls
    Wall(id="sound_bsmt_br", floor=0, wall_type="interior", location="bedrooms",
         length=Dimension(60, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="none", insulation_r_value=0,
         sound_insulation=True, sound_insulation_type="fiberglass_batt", sound_insulation_r_value=11.0,
         interior_finish="drywall",
         drywall_type="standard_1_2"),
    Wall(id="sound_bsmt_ba", floor=0, wall_type="interior", location="bathrooms",
         length=Dimension(40, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="none", insulation_r_value=0,
         sound_insulation=True, sound_insulation_type="fiberglass_batt", sound_insulation_r_value=11.0,
         interior_finish="drywall",
         drywall_type="moisture_resistant"),
    # Level 2: primary bedrooms + guest bedrooms + bathrooms
    Wall(id="sound_l2_br", floor=2, wall_type="interior", location="bedrooms",
         length=Dimension(80, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="none", insulation_r_value=0,
         sound_insulation=True, sound_insulation_type="fiberglass_batt", sound_insulation_r_value=11.0,
         interior_finish="drywall",
         drywall_type="standard_1_2"),
    Wall(id="sound_l2_ba", floor=2, wall_type="interior", location="bathrooms",
         length=Dimension(50, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="none", insulation_r_value=0,
         sound_insulation=True, sound_insulation_type="fiberglass_batt", sound_insulation_r_value=11.0,
         interior_finish="drywall",
         drywall_type="moisture_resistant"),
    # ADU: 1 bedroom + 1 bathroom
    Wall(id="sound_adu_br", floor=2, wall_type="interior", location="ADU bedroom",
         length=Dimension(20, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="none", insulation_r_value=0,
         sound_insulation=True, sound_insulation_type="fiberglass_batt", sound_insulation_r_value=11.0,
         interior_finish="drywall",
         drywall_type="standard_1_2"),
    Wall(id="sound_adu_ba", floor=2, wall_type="interior", location="ADU bathroom",
         length=Dimension(15, 0), height=Dimension(9, 0), thickness="2x4",
         stud_spacing=16.0,
         insulation_type="none", insulation_r_value=0,
         sound_insulation=True, sound_insulation_type="fiberglass_batt", sound_insulation_r_value=11.0,
         interior_finish="drywall",
         drywall_type="moisture_resistant"),

    # ── GARAGE WALLS (fire-rated separation to ADU stair) ───────────────────
    Wall(id="gar_to_adu", floor=1, wall_type="fire_rated", location="garage-to-ADU",
         length=Dimension(10, 0), height=Dimension(9, 0), thickness="2x6",
         stud_spacing=16.0, is_fire_rated=True, fire_rating_hours=1.0,
         insulation_type="batt", insulation_r_value=21.0,
         interior_finish="drywall",
         drywall_type="fire_rated_5_8"),
]

# ── ROOMS (for ceiling areas and room-based inference) ──────────────────────
b.rooms = [
    # Basement rooms (Unit 01 + Unit 02)
    Room(name="Bsmt Bedroom 01-1", floor=0, length=Dimension(12,0), width=Dimension(11,0),
         ceiling_height=Dimension(9,0), is_bathroom=False),
    Room(name="Bsmt Bedroom 01-2", floor=0, length=Dimension(12,0), width=Dimension(10,0),
         ceiling_height=Dimension(9,0)),
    Room(name="Bsmt Bathroom 01", floor=0, length=Dimension(9,0), width=Dimension(5,0),
         ceiling_height=Dimension(9,0), is_bathroom=True),
    Room(name="Bsmt Mechanical 01", floor=0, length=Dimension(8,0), width=Dimension(6,0),
         ceiling_height=Dimension(9,0)),
    Room(name="Bsmt Laundry 01", floor=0, length=Dimension(8,0), width=Dimension(6,0),
         ceiling_height=Dimension(9,0)),
    Room(name="Bsmt Bedroom 02-1", floor=0, length=Dimension(12,0), width=Dimension(11,0),
         ceiling_height=Dimension(9,0)),
    Room(name="Bsmt Bedroom 02-2", floor=0, length=Dimension(12,0), width=Dimension(10,0),
         ceiling_height=Dimension(9,0)),
    Room(name="Bsmt Bathroom 02", floor=0, length=Dimension(9,0), width=Dimension(8,0),
         ceiling_height=Dimension(9,0), is_bathroom=True),
    Room(name="Bsmt Mechanical 02", floor=0, length=Dimension(8,0), width=Dimension(6,0),
         ceiling_height=Dimension(9,0)),
    # Level 1 rooms
    Room(name="Living/Dining 01", floor=1, length=Dimension(18,0), width=Dimension(14,0),
         ceiling_height=Dimension(10,0)),
    Room(name="Kitchen 01", floor=1, length=Dimension(12,0), width=Dimension(10,0),
         ceiling_height=Dimension(10,0), is_kitchen=True),
    Room(name="Living/Dining 02", floor=1, length=Dimension(18,0), width=Dimension(14,0),
         ceiling_height=Dimension(10,0)),
    Room(name="Kitchen 02", floor=1, length=Dimension(12,0), width=Dimension(10,0),
         ceiling_height=Dimension(10,0), is_kitchen=True),
    Room(name="Garage 01", floor=1, length=Dimension(12,0), width=Dimension(20,0),
         ceiling_height=Dimension(9,0), is_garage=True),
    Room(name="Garage 02", floor=1, length=Dimension(12,0), width=Dimension(20,0),
         ceiling_height=Dimension(9,0), is_garage=True),
    # Level 2 rooms
    Room(name="Primary Bedroom 01", floor=2, length=Dimension(14,0), width=Dimension(12,0),
         ceiling_height=Dimension(9,0)),
    Room(name="Primary Bath 01", floor=2, length=Dimension(10,0), width=Dimension(8,0),
         ceiling_height=Dimension(9,0), is_bathroom=True),
    Room(name="Guest Bedroom 01", floor=2, length=Dimension(12,0), width=Dimension(10,0),
         ceiling_height=Dimension(9,0)),
    Room(name="Laundry 01", floor=2, length=Dimension(7,0), width=Dimension(6,0),
         ceiling_height=Dimension(9,0)),
    Room(name="Primary Bedroom 02", floor=2, length=Dimension(14,0), width=Dimension(12,0),
         ceiling_height=Dimension(9,0)),
    Room(name="Primary Bath 02", floor=2, length=Dimension(10,0), width=Dimension(8,0),
         ceiling_height=Dimension(9,0), is_bathroom=True),
    Room(name="Guest Bedroom 02", floor=2, length=Dimension(12,0), width=Dimension(10,0),
         ceiling_height=Dimension(9,0)),
    # ADU rooms
    Room(name="ADU Living/Kitchen", floor=2, length=Dimension(18,0), width=Dimension(14,0),
         ceiling_height=Dimension(9,0), is_kitchen=True),
    Room(name="ADU Bedroom", floor=2, length=Dimension(12,0), width=Dimension(11,0),
         ceiling_height=Dimension(9,0)),
    Room(name="ADU Bathroom", floor=2, length=Dimension(8,0), width=Dimension(6,0),
         ceiling_height=Dimension(9,0), is_bathroom=True),
]

# ── ROOF — Flat roofs, R-60 closed cell spray foam ────────────────────────
b.has_attic = False
b.has_cathedral_ceiling = True  # flat roof = insulation at roof deck (same as cathedral)
b.roof_insulation_type = "spray_foam_closed"
b.roof_insulation_r_value = 60
b.attic_area = 0  # no attic
b.attic_insulation_type = "none"

# Roof sections needed for total_roof_area() — flat roofs, pitch=0
from models import RoofSection
b.roof_sections = [
    RoofSection(id="main_roof", section_type="flat", horizontal_area=1400, pitch=0),
    RoofSection(id="adu_roof", section_type="flat", horizontal_area=550, pitch=0),
]

# ── BASEMENT / FOUNDATION ───────────────────────────────────────────────────
b.basement_wall_insulation = True
b.basement_wall_insulation_type = "spray_foam_closed"
b.basement_wall_insulation_r_value = 19.0
b.basement_wall_insulation_location = "interior"
# Basement wall area: already captured in exterior walls above
# But also set the dedicated field for the calculator
b.basement_wall_area = 0  # handled by walls[] array

# ── SLAB EDGE INSULATION (R-10, 2' depth per IECC) ─────────────────────────
b.slab_edge_insulation = True
b.slab_edge_insulation_r_value = 10.0
b.slab_edge_insulation_type = "xps"
b.slab_edge_insulation_depth = 2.0
b.slab_edge_perimeter = 162.0  # main house basement perimeter (2*(56+25))

# ── FLOOR OVER UNCONDITIONED (ADU over garages) ────────────────────────────
b.floor_over_unconditioned = True
b.floor_over_unconditioned_type = "batt"
b.floor_over_unconditioned_r_value = 38.0
b.floor_over_unconditioned_area = 500.0  # ADU floor over garage ~500 SF

# ── GARAGE CEILING INSULATION (garage ceiling below ADU) ────────────────────
b.garage_ceiling_insulation = True
b.garage_ceiling_insulation_type = "batt"
b.garage_ceiling_insulation_r_value = 38.0
b.garage_ceiling_area = 500.0

# ── GARAGE WALL INSULATION (garage-to-ADU stair) ───────────────────────────
b.garage_wall_insulation = True
b.garage_wall_insulation_type = "batt"
b.garage_wall_insulation_r_value = 21.0
b.garage_wall_area = 90.0  # ~10' wall × 9' height

# ── RIM JOIST INSULATION ───────────────────────────────────────────────────
b.rim_joist_insulation = True
b.rim_joist_insulation_type = "spray_foam_closed"
b.rim_joist_insulation_r_value = 20.0
b.rim_joist_perimeter = 162.0  # at each floor transition

# ── AIR SEALING, VAPOR BARRIER, HOUSE WRAP ─────────────────────────────────
b.air_sealing = True  # per IECC 2021, closed cell spray foam = air barrier
b.vapor_barrier = True  # basement slab vapor barrier
b.house_wrap = True  # "specified building wrap" per wall assemblies

# ============================================================================
# LOAD COSTS & RUN INSULATION CALCULATOR
# ============================================================================
costs_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "config", "default_costs.json")
with open(os.path.abspath(costs_path)) as f:
    costs = json.load(f)

from calc_insulation import calculate_insulation

items = calculate_insulation(b, costs)

# ============================================================================
# PRINT RESULTS
# ============================================================================
print("=" * 80)
print(f"INSULATION TAKEOFF — {b.project_name}")
print(f"{b.project_address}")
print("=" * 80)

total_mat = 0.0
total_labor = 0.0
current_cat = ""

for it in items:
    if it.category != current_cat:
        if current_cat:
            print()
        current_cat = it.category
        print(f"\n  ── {current_cat} {'─' * (60 - len(current_cat))}")

    total_mat += it.material_total
    total_labor += it.labor_total
    print(f"    {it.description:55s} | qty={it.quantity:8.1f} {it.unit:5s} | mat=${it.material_total:9.2f} | labor=${it.labor_total:9.2f}")

print(f"\n{'=' * 80}")
print(f"  TOTAL Material:  ${total_mat:>12,.2f}")
print(f"  TOTAL Labor:     ${total_labor:>12,.2f}")
print(f"  GRAND TOTAL:     ${total_mat + total_labor:>12,.2f}")
print(f"  Line items:      {len(items)}")
print("=" * 80)

# ============================================================================
# EXPORT TO XLSX
# ============================================================================
from export_xlsx import export_estimate

output_dir = os.path.expanduser("~/Downloads")
output_path = os.path.join(output_dir, "3432_Quivas_Duplex_Insulation_Takeoff.xlsx")

notes = [
    ("Key Specifications", [
        "Climate Zone 5B — Denver, CO — IECC 2021 + Denver Amendments",
        "Exterior Walls: R-20 closed cell spray foam + R-6 ZIP-R continuous insulation (R-26 total)",
        "Basement Walls: R-19 closed cell spray foam on furred concrete (W1A/W1B assemblies)",
        "ADU Exterior Walls: R-21 fiberglass batt in 2×6 framing",
        "Flat Roof: R-60 closed cell spray foam at roof deck underside (~1,950 SF total)",
        "Floor Over Unconditioned: R-38 fiberglass batt (ADU over garage)",
        "Slab Edge: R-10 XPS, 2' depth per IECC",
        "Rim Joist: R-20 closed cell spray foam",
        "Party Wall (W17): 2-hr fire rated, R-13 batt + acoustical separation",
        "Interior Sound Walls (W13/W14): R-11 acoustical batt at bedrooms and bathrooms",
    ]),
    ("Assumptions", [
        "Wall dimensions estimated from architectural floor plans (A1.01–A1.03)",
        "Window/door quantities estimated from window/door schedules (A0.03)",
        "Roof areas estimated from roof plan; all roofs are flat with parapets",
        "10% waste factor applied to batt and rigid insulation",
        "5% waste factor applied to spray foam (board feet)",
        "House wrap covers all above-grade exterior wall area",
        "Air sealing included per IECC 2021 air barrier requirements",
        "Vapor barrier included for basement slab only",
        "Labor rate based on Denver metro market rates",
    ]),
    ("Not Included", [
        "Mechanical equipment (HVAC, ductwork, plumbing, electrical)",
        "Framing, drywall, roofing, gutters, exterior finishes",
        "Fireproofing / firestopping at penetrations (separate trade)",
        "Blower door testing / HERS rating verification",
        "Permits, design fees, general conditions",
        "Structural insulated panels (SIPs) or ICF systems",
        "Interior trim, paint, flooring, fixtures",
    ]),
]

export_estimate(
    items,
    output_path,
    project_name=b.project_name,
    project_address=b.project_address,
    notes=notes,
)
print(f"\nSpreadsheet saved: {output_path}")
