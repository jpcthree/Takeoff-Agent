#!/usr/bin/env python3
"""
model_from_address.py — Heuristic engine that converts PropertyData into a
BuildingModel suitable for the existing takeoff calculators.

Uses era-based construction defaults, building footprint geometry, and
Google Solar roof data to infer walls, rooms, openings, roof sections,
and gutter runs for an existing home without plans.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

from models import (
    BuildingModel, Dimension, GutterRun, Opening, Room, RoofSection, Wall,
)
from property_lookup import PropertyData

# ── Config ──────────────────────────────────────────────────────────────────
_ROOT = Path(__file__).resolve().parents[4]
_ERA_FILE = _ROOT / "config" / "era_defaults.json"

# ── Constants ───────────────────────────────────────────────────────────────
M2_TO_SQFT = 10.7639
FT_PER_DEG_LAT = 364_000.0  # approximate at mid-latitudes


# ── Era Lookup ──────────────────────────────────────────────────────────────
def load_era_config() -> dict:
    with open(_ERA_FILE) as f:
        return json.load(f)


def find_era(year_built: int, eras: list[dict]) -> dict:
    """Find the matching era for a given year_built."""
    if year_built <= 0:
        # Unknown year — assume 1970s (median US housing stock)
        year_built = 1975
    for era in eras:
        lo, hi = era["range"]
        if lo <= year_built <= hi:
            return era
    # Fallback: last era
    return eras[-1]


# ── Polygon Geometry ────────────────────────────────────────────────────────
def _polygon_to_feet(polygon: list[list[float]], ref_lat: float) -> list[tuple[float, float]]:
    """Convert [lng, lat] polygon to [x_ft, y_ft] relative to centroid."""
    if not polygon:
        return []

    ft_per_deg_lng = FT_PER_DEG_LAT * math.cos(math.radians(ref_lat))

    # Centroid
    cx = sum(p[0] for p in polygon) / len(polygon)
    cy = sum(p[1] for p in polygon) / len(polygon)

    return [
        ((p[0] - cx) * ft_per_deg_lng, (p[1] - cy) * FT_PER_DEG_LAT)
        for p in polygon
    ]


def _polygon_perimeter(pts: list[tuple[float, float]]) -> float:
    """Perimeter of a polygon in feet."""
    if len(pts) < 3:
        return 0.0
    perim = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        perim += math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    return perim


def _polygon_area(pts: list[tuple[float, float]]) -> float:
    """Area of a polygon in sq ft (shoelace formula)."""
    if len(pts) < 3:
        return 0.0
    n = len(pts)
    area = 0.0
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def _bounding_box(pts: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    """Returns (min_x, min_y, max_x, max_y)."""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


# ── Foundation Heuristics ──────────────────────────────────────────────────
def _infer_foundation_type(year_built: int, zone_num: str, era_config: dict) -> str:
    """Infer foundation type from year built + climate zone when assessor data is missing."""
    heuristics = era_config.get("foundation_heuristics", {}).get("by_era_and_zone", [])
    for h in heuristics:
        lo, hi = h["era_range"]
        if lo <= year_built <= hi:
            return h.get("zone_defaults", {}).get(zone_num, "slab")
    # Fallback: use climate zone override
    zone_override = era_config.get("climate_zone_overrides", {}).get(zone_num, {})
    return zone_override.get("foundation_type_default", "slab")


# ── Envelope Geometry ───────────────────────────────────────────────────────
@dataclass
class EnvelopeGeometry:
    """Computed building envelope dimensions."""
    footprint_sqft: float = 0.0
    perimeter_ft: float = 0.0
    north_wall_ft: float = 0.0
    south_wall_ft: float = 0.0
    east_wall_ft: float = 0.0
    west_wall_ft: float = 0.0
    source: str = ""  # "polygon", "estimated"


def compute_envelope(prop: PropertyData, era: dict) -> EnvelopeGeometry:
    """
    Compute building envelope from available data.
    Uses footprint polygon if available, otherwise estimates from SF + stories.
    """
    env = EnvelopeGeometry()

    # ── Try polygon first ───────────────────────────────────────────────
    solar_sqft = prop.building_footprint_area_m2 * M2_TO_SQFT if prop.building_footprint_area_m2 > 0 else 0

    if prop.footprint_polygon and len(prop.footprint_polygon) >= 3:
        pts_ft = _polygon_to_feet(prop.footprint_polygon, prop.lat)
        poly_sqft = _polygon_area(pts_ft)

        # Sanity check: if Solar API footprint is available and OSM polygon
        # is less than 60% of it, the polygon likely missed part of the building.
        # Prefer Solar footprint in that case.
        if solar_sqft > 0 and poly_sqft < solar_sqft * 0.6:
            env.footprint_sqft = solar_sqft
            width = math.sqrt(env.footprint_sqft / 1.4)
            length = width * 1.4
            env.perimeter_ft = 2 * (width + length)
            env.north_wall_ft = length
            env.south_wall_ft = length
            env.east_wall_ft = width
            env.west_wall_ft = width
            env.source = "solar_footprint (OSM polygon too small)"
        else:
            env.footprint_sqft = poly_sqft
            env.perimeter_ft = _polygon_perimeter(pts_ft)

            # Split perimeter into 4 cardinal walls via bounding box
            min_x, min_y, max_x, max_y = _bounding_box(pts_ft)
            bb_width = max_x - min_x   # E-W dimension
            bb_depth = max_y - min_y   # N-S dimension

            env.north_wall_ft = bb_width
            env.south_wall_ft = bb_width
            env.east_wall_ft = bb_depth
            env.west_wall_ft = bb_depth
            env.source = "polygon"

    # ── Try Google Solar footprint area ─────────────────────────────────
    elif solar_sqft > 0:
        env.footprint_sqft = solar_sqft
        # Estimate rectangular with 1.4:1 aspect ratio
        width = math.sqrt(env.footprint_sqft / 1.4)
        length = width * 1.4
        env.perimeter_ft = 2 * (width + length)
        env.north_wall_ft = length
        env.south_wall_ft = length
        env.east_wall_ft = width
        env.west_wall_ft = width
        env.source = "solar_footprint"

    # ── Estimate from SF + stories ──────────────────────────────────────
    else:
        total_sf = prop.total_sqft or 1500.0  # conservative default
        stories = prop.stories or 1
        env.footprint_sqft = total_sf / stories

        width = math.sqrt(env.footprint_sqft / 1.4)
        length = width * 1.4
        env.perimeter_ft = 2 * (width + length)
        env.north_wall_ft = length
        env.south_wall_ft = length
        env.east_wall_ft = width
        env.west_wall_ft = width
        env.source = "estimated"

    return env


# ── Build Model ─────────────────────────────────────────────────────────────
def build_model(
    prop: PropertyData,
    era_config: dict | None = None,
    costs: dict | None = None,
    climate_zone: str = "5B",
) -> tuple[BuildingModel, list[str]]:
    """
    Build a complete BuildingModel from PropertyData + era heuristics.

    Returns:
        (BuildingModel, assumptions_list)
    """
    if era_config is None:
        era_config = load_era_config()

    eras = era_config["eras"]
    era = find_era(prop.year_built, eras)
    assumptions: list[str] = []

    # ── Basic model setup ───────────────────────────────────────────────
    m = BuildingModel()
    m.project_name = f"Existing Home Estimate — {prop.address}"
    m.project_address = prop.address
    m.climate_zone = climate_zone

    stories = prop.stories or 1
    m.stories = stories

    year_label = f"{era['label']} ({prop.year_built})" if prop.year_built else f"{era['label']} (year unknown, assumed ~1975)"
    assumptions.append(f"Construction era: {year_label}")

    # ── Envelope geometry (compute FIRST so we can derive total SF if needed) ─
    env = compute_envelope(prop, era)
    assumptions.append(
        f"Building envelope: {env.footprint_sqft:.0f} SF footprint, "
        f"{env.perimeter_ft:.0f} LF perimeter (source: {env.source})"
    )

    # ── Derive total SF ─────────────────────────────────────────────────
    # If we have a real footprint but no assessor SF, estimate from footprint × stories
    if prop.total_sqft:
        total_sqft = prop.total_sqft
    elif env.footprint_sqft > 0 and env.source != "estimated":
        total_sqft = env.footprint_sqft * stories
        assumptions.append(
            f"Total SF estimated from footprint: {env.footprint_sqft:.0f} SF × {stories} stories = {total_sqft:.0f} SF"
        )
    else:
        total_sqft = 1500.0
        assumptions.append("Total SF: defaulting to 1,500 SF (no assessor data or footprint)")

    m.total_sqft = total_sqft
    m.conditioned_sqft = total_sqft

    # ── Resolve foundation ──────────────────────────────────────────────
    has_basement = False
    has_crawlspace = False
    crawlspace_height_ft = 0.0
    basement_height = era.get("basement_height_ft", 0)
    zone_num = climate_zone[0] if climate_zone else "5"

    if prop.foundation_type == "full_basement":
        has_basement = True
        assumptions.append(f"Foundation: full basement (from assessor data — BSMT_AREA > 0)")
    elif prop.basement in ("full", "partial"):
        has_basement = True
        assumptions.append(f"Foundation: {prop.basement} basement (from assessor data)")
    elif prop.foundation_type == "unknown" or not prop.basement:
        # Assessor has no basement area — use era + climate zone heuristics
        inferred = _infer_foundation_type(prop.year_built or 1975, zone_num, era_config)
        if inferred == "full_basement":
            has_basement = True
            assumptions.append(
                f"Foundation: full basement inferred (Zone {zone_num} + {era['label']} era — "
                f"frost depth requires deep footings, basements typical)"
            )
        elif inferred == "crawlspace":
            has_crawlspace = True
            year = prop.year_built or 1975
            if year < 1960:
                crawlspace_height_ft = 2.5
            elif year < 1980:
                crawlspace_height_ft = 3.0
            else:
                crawlspace_height_ft = 3.5
            assumptions.append(
                f"Foundation: crawlspace inferred ({era['label']} era + Zone {zone_num}), "
                f"estimated {crawlspace_height_ft:.1f}' height"
            )
        else:
            assumptions.append(f"Foundation: slab-on-grade inferred ({era['label']} era + Zone {zone_num})")
    else:
        assumptions.append(f"Foundation: {prop.basement} (from assessor data — no basement)")

    # When assessor confirms a basement but era default has height=0 (era defaults to slab),
    # use a reasonable height for the era
    if has_basement and basement_height == 0:
        year = prop.year_built or 1975
        if year < 1960:
            basement_height = 7  # older basements: 7' typical
        elif year < 2000:
            basement_height = 8
        else:
            basement_height = 9
        assumptions.append(f"Basement height: {basement_height}' (estimated — assessor confirms basement but era default is slab)")

    ceiling_ht = era["ceiling_height_ft"]
    wall_framing = era["wall_framing"]
    stud_spacing = era.get("stud_spacing", 16)

    # ── Generate Openings ───────────────────────────────────────────────
    win_per_1000 = era["windows_per_1000sf"]
    window_count = max(4, int(total_sqft / 1000 * win_per_1000))
    win_w = era["avg_window_width_ft"]
    win_h = era["avg_window_height_ft"]

    door_count_ext = stories + 1  # front + back + side/garage
    door_w = era.get("avg_ext_door_width_ft", 3.0)
    door_h = era.get("avg_ext_door_height_ft", 6.67)

    m.openings = [
        Opening(
            id="win_standard",
            opening_type="window",
            width=Dimension.from_feet(win_w),
            height=Dimension.from_feet(win_h),
            quantity=window_count,
        ),
        Opening(
            id="door_ext",
            opening_type="door",
            width=Dimension.from_feet(door_w),
            height=Dimension.from_feet(door_h),
            quantity=door_count_ext,
        ),
    ]
    assumptions.append(
        f"Windows: {window_count} ({win_per_1000}/1000 SF × {total_sqft:.0f} SF), "
        f"each {win_w:.1f}' × {win_h:.1f}' ({era['window_type']})"
    )
    assumptions.append(f"Exterior doors: {door_count_ext}")

    # ── Distribute openings across walls ────────────────────────────────
    # Proportional to wall length: N+S get more (longer), E+W get fewer
    total_wall_lf = env.north_wall_ft + env.south_wall_ft + env.east_wall_ft + env.west_wall_ft
    wall_lengths = {
        "north": env.north_wall_ft,
        "south": env.south_wall_ft,
        "east": env.east_wall_ft,
        "west": env.west_wall_ft,
    }

    # Windows per wall (proportional)
    win_per_wall = {}
    remaining_wins = window_count
    for i, (direction, length) in enumerate(wall_lengths.items()):
        if i == len(wall_lengths) - 1:
            win_per_wall[direction] = remaining_wins
        else:
            count = max(1, round(window_count * length / total_wall_lf))
            win_per_wall[direction] = count
            remaining_wins -= count
    # Doors: front (south), back (north), side if >2
    door_per_wall = {"north": 1, "south": 1, "east": 0, "west": 0}
    if door_count_ext > 2:
        door_per_wall["east"] = 1

    # ── Generate Exterior Walls ─────────────────────────────────────────
    m.walls = []

    for floor_num in range(1, stories + 1):
        for direction, length in wall_lengths.items():
            # Build opening list for this wall
            wall_openings = []
            # Only put openings on this floor's walls (distribute evenly across floors)
            wins_this_wall = max(1, win_per_wall[direction] // stories)
            doors_this_wall = door_per_wall[direction] if floor_num == 1 else 0

            if wins_this_wall > 0:
                oid = f"win_f{floor_num}_{direction}"
                m.openings.append(Opening(
                    id=oid,
                    opening_type="window",
                    width=Dimension.from_feet(win_w),
                    height=Dimension.from_feet(win_h),
                    quantity=wins_this_wall,
                ))
                wall_openings.append(oid)

            if doors_this_wall > 0:
                oid = f"door_f{floor_num}_{direction}"
                m.openings.append(Opening(
                    id=oid,
                    opening_type="door",
                    width=Dimension.from_feet(door_w),
                    height=Dimension.from_feet(door_h),
                    quantity=doors_this_wall,
                ))
                wall_openings.append(oid)

            m.walls.append(Wall(
                id=f"ext_f{floor_num}_{direction}",
                floor=floor_num,
                wall_type="exterior",
                location=direction,
                length=Dimension.from_feet(length),
                height=Dimension.from_feet(ceiling_ht),
                thickness=wall_framing,
                stud_spacing=stud_spacing,
                insulation_type=era["wall_insulation_type"],
                insulation_r_value=float(era["wall_insulation_r"]),
                interior_finish="drywall",
                exterior_finish=era.get("exterior_material", "siding"),
                sheathing_type="plywood",
                drywall_type=era["drywall_type"],
                openings=wall_openings,
            ))

    # Remove the initial generic openings (replaced by per-wall openings)
    m.openings = [o for o in m.openings if o.id not in ("win_standard", "door_ext")]

    assumptions.append(
        f"Exterior walls: {wall_framing} @ {stud_spacing}\" OC, "
        f"R-{era['wall_insulation_r']} {era['wall_insulation_type']} insulation"
    )

    # ── Generate Basement Walls (if applicable) ─────────────────────────
    if has_basement and basement_height > 0:
        for direction, length in wall_lengths.items():
            m.walls.append(Wall(
                id=f"bsmt_{direction}",
                floor=0,
                wall_type="exterior",
                location=f"basement {direction}",
                length=Dimension.from_feet(length),
                height=Dimension.from_feet(basement_height),
                thickness="2x4",
                stud_spacing=16.0,
                insulation_type=era.get("basement_wall_insulation_type", "none"),
                insulation_r_value=float(era.get("basement_wall_insulation_r", 0)),
                interior_finish="drywall",
                exterior_finish="none",
                sheathing_type="none",
                drywall_type="standard_5_8",
            ))

        bsmt_r = era.get("basement_wall_insulation_r", 0)
        assumptions.append(
            f"Basement walls: {basement_height}' height, "
            f"R-{bsmt_r} {era.get('basement_wall_insulation_type', 'none')} insulation"
        )

    # ── Generate Interior Walls ─────────────────────────────────────────
    int_lf_ratio = era.get("interior_wall_lf_per_perim_ft", 0.75)
    total_floors = stories + (1 if has_basement else 0)

    for floor_num in range(0 if has_basement else 1, stories + 1):
        int_lf = env.perimeter_ft * int_lf_ratio

        # Split interior walls into functional groups
        # General partition walls
        m.walls.append(Wall(
            id=f"int_gen_f{floor_num}",
            floor=floor_num,
            wall_type="interior",
            location=f"Floor {floor_num} general partitions",
            length=Dimension.from_feet(int_lf * 0.7),
            height=Dimension.from_feet(ceiling_ht if floor_num > 0 else basement_height),
            thickness="2x4",
            stud_spacing=16.0,
            insulation_type="none",
            insulation_r_value=0,
            interior_finish="drywall",
            drywall_type=era["drywall_type"],
        ))

        # Bathroom/wet-area walls
        m.walls.append(Wall(
            id=f"int_bath_f{floor_num}",
            floor=floor_num,
            wall_type="interior",
            location=f"Floor {floor_num} bathroom/wet walls",
            length=Dimension.from_feet(int_lf * 0.3),
            height=Dimension.from_feet(ceiling_ht if floor_num > 0 else basement_height),
            thickness="2x4",
            stud_spacing=16.0,
            insulation_type="none",
            insulation_r_value=0,
            sound_insulation=True,
            sound_insulation_type="fiberglass_batt",
            sound_insulation_r_value=11.0,
            interior_finish="drywall",
            drywall_type="moisture_resistant",
        ))

    assumptions.append(
        f"Interior walls: {int_lf_ratio:.2f} × perimeter per floor "
        f"(~{env.perimeter_ft * int_lf_ratio:.0f} LF/floor), "
        f"30% moisture-resistant for wet areas"
    )

    # ── Generate Garage Walls (if applicable) ───────────────────────────
    if prop.garage or era.get("has_garage"):
        garage_sqft = prop.garage_sqft or era.get("garage_sqft_typical", 400)
        if garage_sqft > 0:
            gar_w = math.sqrt(garage_sqft / 1.2)
            gar_l = gar_w * 1.2

            # Garage-to-house fire separation wall
            m.walls.append(Wall(
                id="gar_sep",
                floor=1,
                wall_type="fire_rated",
                location="garage-to-house separation",
                length=Dimension.from_feet(gar_l),
                height=Dimension.from_feet(ceiling_ht),
                thickness="2x6",
                stud_spacing=16.0,
                is_fire_rated=True,
                fire_rating_hours=1.0,
                insulation_type="batt",
                insulation_r_value=21.0,
                interior_finish="drywall",
                drywall_type="fire_rated_5_8",
            ))

            # Garage exterior walls (3 sides — 4th is shared with house)
            for i, (loc, length) in enumerate([
                ("garage front", gar_w), ("garage left", gar_l), ("garage right", gar_l),
            ]):
                openings_list = []
                if i == 0:  # Front wall has garage door
                    gd_id = "garage_door"
                    m.openings.append(Opening(
                        id=gd_id, opening_type="door",
                        width=Dimension.from_feet(16.0),
                        height=Dimension.from_feet(7.0),
                        quantity=1,
                    ))
                    openings_list.append(gd_id)

                m.walls.append(Wall(
                    id=f"gar_{loc.replace(' ', '_')}",
                    floor=1,
                    wall_type="exterior",
                    location=loc,
                    length=Dimension.from_feet(length),
                    height=Dimension.from_feet(ceiling_ht),
                    thickness="2x6",
                    stud_spacing=16.0,
                    insulation_type="none",
                    insulation_r_value=0,
                    interior_finish="drywall",
                    exterior_finish="siding",
                    sheathing_type="plywood",
                    drywall_type="fire_rated_5_8",
                    openings=openings_list,
                ))

            assumptions.append(
                f"Garage: ~{garage_sqft:.0f} SF ({gar_w:.0f}' × {gar_l:.0f}'), "
                f"5/8\" Type X drywall, 1-hr fire-rated separation"
            )

    # ── Generate Rooms ──────────────────────────────────────────────────
    m.rooms = []
    alloc = era_config.get("room_allocation_pcts", {})
    ratios = era_config.get("room_aspect_ratios", {})

    bedrooms = prop.bedrooms or max(2, round(total_sqft / 600))
    bathrooms = prop.bathrooms or max(1.0, round(total_sqft / 800, 1))
    full_baths = int(bathrooms)
    half_baths = 1 if bathrooms - full_baths >= 0.5 else 0

    assumptions.append(f"Bedrooms: {bedrooms}, Bathrooms: {full_baths} full + {half_baths} half")

    # Determine floor SF allocation
    if has_basement:
        if prop.basement_sqft > 0:
            # Use assessor data when available
            bsmt_sf = prop.basement_sqft
            assumptions.append(f"Basement SF: {bsmt_sf:.0f} (from assessor data)")
        else:
            # Estimate from above-grade footprint (not polygon — use assessor SF / stories)
            est_footprint = total_sqft / stories if stories else total_sqft
            bsmt_sf = est_footprint * 0.8  # 80% of footprint is finished basement
            bsmt_sf = min(bsmt_sf, total_sqft * 0.4)  # cap at 40% of total
            assumptions.append(f"Basement SF: {bsmt_sf:.0f} (estimated at 80% of footprint)")
    else:
        bsmt_sf = 0

    # Distribute above-grade SF across floors
    # Denver assessor AREA_ABG is already above-grade — don't subtract basement again.
    # For non-assessor sources, total_sqft may include basement, so subtract it.
    if "co_gis" in prop.sources.get("total_sqft", ""):
        # Assessor AREA_ABG is already above-grade
        above_grade_sf = total_sqft
    elif prop.total_sqft:
        # Other sources (ATTOM, etc.) may include basement in total
        above_grade_sf = total_sqft - bsmt_sf
    else:
        # No assessor data — use polygon or estimate
        above_grade_sf = max(total_sqft - bsmt_sf, 500.0)
    above_grade_sf = max(above_grade_sf, 500.0)  # sanity floor
    sf_per_floor = above_grade_sf / stories if stories > 0 else above_grade_sf

    def _make_room(name: str, floor: int, pct: float, alloc_key: str,
                   is_bathroom: bool = False, is_kitchen: bool = False,
                   is_garage: bool = False, is_utility: bool = False):
        floor_sf = bsmt_sf if floor == 0 else sf_per_floor
        room_sf = floor_sf * pct
        ar = ratios.get(alloc_key, 1.2)
        w = math.sqrt(room_sf / ar)
        l = w * ar
        m.rooms.append(Room(
            name=name, floor=floor,
            length=Dimension.from_feet(l),
            width=Dimension.from_feet(w),
            ceiling_height=Dimension.from_feet(ceiling_ht if floor > 0 else basement_height),
            is_bathroom=is_bathroom,
            is_kitchen=is_kitchen,
            is_garage=is_garage,
            is_utility=is_utility,
        ))

    # ── Basement rooms ──────────────────────────────────────────────────
    if has_basement:
        _make_room("Basement Living", 0, 0.45, "living_room")
        _make_room("Basement Bedroom", 0, 0.20, "secondary_bedroom")
        _make_room("Basement Bath", 0, 0.08, "secondary_bathroom", is_bathroom=True)
        _make_room("Basement Utility", 0, 0.12, "laundry", is_utility=True)
        _make_room("Basement Hallway", 0, 0.10, "hallway_per_floor")
        _make_room("Basement Storage", 0, 0.05, "laundry", is_utility=True)

    # ── Level 1 rooms ───────────────────────────────────────────────────
    _make_room("Living Room", 1, alloc.get("living_room", 0.16), "living_room")
    _make_room("Kitchen", 1, alloc.get("kitchen", 0.11), "kitchen", is_kitchen=True)
    _make_room("Dining", 1, alloc.get("dining", 0.08), "dining")
    _make_room("Entry/Mudroom", 1, alloc.get("mudroom_entry", 0.04), "mudroom_entry")
    _make_room("L1 Hallway", 1, alloc.get("hallway_per_floor", 0.06), "hallway_per_floor")
    _make_room("Powder Room", 1, 0.03, "secondary_bathroom", is_bathroom=True)

    if stories == 1:
        # All bedrooms on L1
        primary_pct = alloc.get("primary_bedroom", 0.13)
        _make_room("Primary Bedroom", 1, primary_pct, "primary_bedroom")
        _make_room("Primary Bath", 1, alloc.get("primary_bathroom", 0.05), "primary_bathroom", is_bathroom=True)
        for i in range(1, bedrooms):
            _make_room(f"Bedroom {i + 1}", 1, alloc.get("secondary_bedroom", 0.09), "secondary_bedroom")
        _make_room("Laundry", 1, alloc.get("laundry", 0.03), "laundry")

        # Remaining SF as closets/misc
        remaining_pct = 1.0 - (
            alloc.get("living_room", 0.16) + alloc.get("kitchen", 0.11) +
            alloc.get("dining", 0.08) + alloc.get("mudroom_entry", 0.04) +
            alloc.get("hallway_per_floor", 0.06) + 0.03 + primary_pct +
            alloc.get("primary_bathroom", 0.05) +
            alloc.get("secondary_bedroom", 0.09) * (bedrooms - 1) +
            alloc.get("laundry", 0.03)
        )
        if remaining_pct > 0.02:
            _make_room("Closets/Misc", 1, remaining_pct, "living_room")

    # ── Level 2+ rooms (multi-story) ────────────────────────────────────
    if stories >= 2:
        _make_room("Primary Bedroom", 2, alloc.get("primary_bedroom", 0.13), "primary_bedroom")
        _make_room("Primary Bath", 2, alloc.get("primary_bathroom", 0.05), "primary_bathroom", is_bathroom=True)
        _make_room("Primary Closet", 2, 0.04, "laundry")
        for i in range(1, bedrooms):
            _make_room(f"Bedroom {i + 1}", 2, alloc.get("secondary_bedroom", 0.09), "secondary_bedroom")
        for i in range(full_baths - 1):
            _make_room(f"Bath {i + 2}", 2, alloc.get("secondary_bathroom", 0.04), "secondary_bathroom", is_bathroom=True)
        _make_room("L2 Hallway", 2, alloc.get("hallway_per_floor", 0.06), "hallway_per_floor")
        _make_room("Laundry", 2, alloc.get("laundry", 0.03), "laundry")

    # ── Garage room (for ceiling drywall) ───────────────────────────────
    if prop.garage or era.get("has_garage"):
        garage_sqft_val = prop.garage_sqft or era.get("garage_sqft_typical", 400)
        if garage_sqft_val > 0:
            gar_w = math.sqrt(garage_sqft_val / 1.2)
            gar_l = gar_w * 1.2
            m.rooms.append(Room(
                name="Garage", floor=1,
                length=Dimension.from_feet(gar_l),
                width=Dimension.from_feet(gar_w),
                ceiling_height=Dimension.from_feet(ceiling_ht),
                is_garage=True,
            ))

    # ── Generate Roof Sections ──────────────────────────────────────────
    m.roof_sections = []

    if prop.solar_roof_segments:
        # Use Google Solar data
        for i, seg in enumerate(prop.solar_roof_segments):
            pitch_deg = seg.get("pitch_deg", 0)
            # Convert degrees to rise:12
            pitch_rise = round(math.tan(math.radians(pitch_deg)) * 12, 1)
            area_sqft = seg.get("area_m2", 0) * M2_TO_SQFT

            # Solar API gives SLOPED area — convert to horizontal
            slope_factor = math.sqrt(1 + (pitch_rise / 12) ** 2) if pitch_rise > 0 else 1.0
            horiz_area = area_sqft / slope_factor

            m.roof_sections.append(RoofSection(
                id=f"roof_seg_{i + 1}",
                section_type="flat" if pitch_rise < 1 else "sloped",
                horizontal_area=round(horiz_area, 1),
                pitch=pitch_rise,
            ))

        n_segs = len(prop.solar_roof_segments)
        if n_segs <= 2:
            m.roof_complexity = "simple"
        elif n_segs <= 4:
            m.roof_complexity = "standard"
        elif n_segs <= 8:
            m.roof_complexity = "complex"
        else:
            m.roof_complexity = "very_complex"

        assumptions.append(
            f"Roof: {n_segs} segments from Google Solar API, "
            f"complexity={m.roof_complexity}"
        )
    else:
        # Estimate from era defaults
        pitch = era.get("roof_pitch", 6)
        style = era.get("roof_style", "gable")
        m.roof_sections.append(RoofSection(
            id="roof_main",
            section_type="flat" if pitch < 1 else "sloped",
            horizontal_area=round(env.footprint_sqft, 1),
            pitch=float(pitch),
        ))
        m.roof_complexity = "standard"
        assumptions.append(
            f"Roof: estimated {style} at {pitch}:12 pitch, "
            f"{env.footprint_sqft:.0f} SF horizontal area (from footprint)"
        )

    # ── Attic insulation ────────────────────────────────────────────────
    m.has_attic = era.get("roof_pitch", 6) >= 3  # Attic if pitched roof
    if m.has_attic:
        m.attic_insulation_type = era.get("attic_insulation_type", "blown")
        m.attic_insulation_r_value = float(era.get("attic_insulation_r", 30))
        # Attic floor area = above-grade footprint per floor, NOT the raw polygon
        # (polygon may include detached garage, patio, etc.)
        above_grade_footprint = above_grade_sf / stories if stories else above_grade_sf
        m.attic_area = above_grade_footprint
        assumptions.append(
            f"Attic: {above_grade_footprint:.0f} SF floor area, R-{m.attic_insulation_r_value:.0f} "
            f"{m.attic_insulation_type} insulation (estimated from era)"
        )
    else:
        m.has_cathedral_ceiling = True
        assumptions.append("Flat/low-slope roof — no traditional attic assumed")

    # ── Crawlspace ─────────────────────────────────────────────────────
    if has_crawlspace:
        above_grade_footprint = above_grade_sf / stories if stories else above_grade_sf
        m.crawlspace_area = above_grade_footprint
        m.crawlspace_height = Dimension(feet=int(crawlspace_height_ft),
                                         inches=int((crawlspace_height_ft % 1) * 12))
        m.crawlspace_perimeter = env.perimeter_ft
        m.foundation_type = "crawlspace"
        assumptions.append(
            f"Crawlspace: {above_grade_footprint:.0f} SF floor area, "
            f"{env.perimeter_ft:.0f} LF perimeter × {crawlspace_height_ft:.1f}' walls"
        )

    # ── Generate Gutter Runs ────────────────────────────────────────────
    m.gutter_runs = []
    # Eave length ≈ perimeter for hip roofs, ≈ 2 × (N+S walls) for gable
    style = era.get("roof_style", "gable")
    if style == "hip":
        total_gutter_lf = env.perimeter_ft
    elif style == "flat":
        # Flat roofs may have internal drains, but scupper/gutter at low edges
        total_gutter_lf = env.perimeter_ft * 0.5
    else:  # gable — gutters on eave sides (N+S typically)
        total_gutter_lf = env.north_wall_ft + env.south_wall_ft

    # Split into runs of max 40 LF
    max_run = 40.0
    gutter_size = "5_inch"
    gutter_material = "aluminum"
    gutter_style = "k_style"

    run_count = max(1, math.ceil(total_gutter_lf / max_run))
    run_length = total_gutter_lf / run_count

    for i in range(run_count):
        m.gutter_runs.append(GutterRun(
            id=f"gutter_{i + 1}",
            length=round(run_length, 1),
            size=gutter_size,
            material=gutter_material,
            style=gutter_style,
            downspouts=1,
            downspout_size="2x3",
            inside_miters=0,
            outside_miters=1,
            end_caps=2,
        ))

    assumptions.append(
        f"Gutters: {total_gutter_lf:.0f} LF total ({run_count} runs), "
        f"5\" aluminum K-style, 1 downspout per run"
    )

    # ── Air sealing / vapor / house wrap ────────────────────────────────
    m.air_sealing = True
    m.vapor_barrier = True if prop.year_built and prop.year_built >= 1980 else False
    m.house_wrap = True if prop.year_built and prop.year_built >= 1990 else False

    # ── Rim joist ───────────────────────────────────────────────────────
    if stories > 1 or has_basement:
        m.rim_joist_insulation = True
        m.rim_joist_insulation_type = "spray_foam_closed"
        m.rim_joist_insulation_r_value = 15.0
        transitions = stories + (1 if has_basement else 0) - 1
        m.rim_joist_perimeter = env.perimeter_ft * max(1, transitions)
        assumptions.append(f"Rim joist: {m.rim_joist_perimeter:.0f} LF × R-15 spray foam (upgrade recommendation)")

    # ── Garage ceiling insulation ───────────────────────────────────────
    if (prop.garage or era.get("has_garage")) and stories >= 2:
        garage_sqft_val = prop.garage_sqft or era.get("garage_sqft_typical", 400)
        m.garage_ceiling_insulation = True
        m.garage_ceiling_insulation_type = "batt"
        m.garage_ceiling_insulation_r_value = 38.0
        m.garage_ceiling_area = float(garage_sqft_val)
        assumptions.append(f"Garage ceiling: R-38 batt ({garage_sqft_val:.0f} SF) — living space above")

    # ── Floor sound insulation (multi-story) ────────────────────────────
    if stories > 1:
        m.floor_sound_insulation = True
        m.floor_sound_insulation_type = "fiberglass_batt"
        m.floor_sound_insulation_area = sf_per_floor
        assumptions.append(f"Floor sound insulation: {sf_per_floor:.0f} SF between floors")

    return m, assumptions


# ── CLI test ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    # Quick test with mock PropertyData
    prop = PropertyData(
        address="Test Home, Denver, CO",
        lat=39.75,
        lng=-105.0,
        year_built=1965,
        total_sqft=1800,
        stories=1,
        bedrooms=3,
        bathrooms=2.0,
        basement="full",
        garage="attached",
        garage_sqft=400,
    )

    era_config = load_era_config()
    model, assumptions = build_model(prop, era_config)

    print(f"\nModel: {model.project_name}")
    print(f"Walls: {len(model.walls)}")
    print(f"Rooms: {len(model.rooms)}")
    print(f"Openings: {len(model.openings)}")
    print(f"Roof sections: {len(model.roof_sections)}")
    print(f"Gutter runs: {len(model.gutter_runs)}")
    print(f"\nAssumptions ({len(assumptions)}):")
    for a in assumptions:
        print(f"  • {a}")
