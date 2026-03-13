"""
Construction Takeoff Agent - Building Data Models

Complete data model for representing a building extracted from construction plans.
All measurements are stored in decimal feet internally.
"""

from __future__ import annotations
import json
import math
from dataclasses import dataclass, field, asdict
from typing import List, Optional, Tuple
from enum import Enum


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class WallType(str, Enum):
    EXTERIOR = "exterior"
    INTERIOR = "interior"
    PARTY = "party"
    SHEAR = "shear"
    FIRE_RATED = "fire_rated"

class CeilingType(str, Enum):
    FLAT = "flat"
    VAULTED = "vaulted"
    TRAY = "tray"
    CATHEDRAL = "cathedral"
    COFFERED = "coffered"
    DROPPED = "dropped"

class FloorFinish(str, Enum):
    HARDWOOD = "hardwood"
    TILE = "tile"
    CARPET = "carpet"
    VINYL_PLANK = "vinyl_plank"
    LAMINATE = "laminate"
    CONCRETE = "concrete"
    EPOXY = "epoxy"

class InsulationType(str, Enum):
    BATT = "batt"
    BLOWN = "blown"
    SPRAY_FOAM_OPEN = "spray_foam_open"
    SPRAY_FOAM_CLOSED = "spray_foam_closed"
    RIGID = "rigid"
    NONE = "none"

class RoofStyle(str, Enum):
    GABLE = "gable"
    HIP = "hip"
    SHED = "shed"
    FLAT = "flat"
    GAMBREL = "gambrel"
    MANSARD = "mansard"
    DUTCH_HIP = "dutch_hip"

class RoofMaterial(str, Enum):
    ASPHALT_SHINGLE = "asphalt_shingle"
    METAL_STANDING_SEAM = "metal_standing_seam"
    METAL_CORRUGATED = "metal_corrugated"
    CLAY_TILE = "clay_tile"
    CONCRETE_TILE = "concrete_tile"
    SLATE = "slate"
    MEMBRANE_TPO = "membrane_tpo"
    MEMBRANE_EPDM = "membrane_epdm"
    BUILT_UP = "built_up"

class FoundationType(str, Enum):
    SLAB = "slab"
    CRAWLSPACE = "crawlspace"
    FULL_BASEMENT = "full_basement"
    PIER = "pier"
    DAYLIGHT_BASEMENT = "daylight_basement"

class SidingType(str, Enum):
    VINYL = "vinyl"
    FIBER_CEMENT = "fiber_cement"
    WOOD_CLAPBOARD = "wood_clapboard"
    WOOD_SHINGLE = "wood_shingle"
    BRICK = "brick"
    STONE = "stone"
    STUCCO = "stucco"
    METAL = "metal"
    NONE = "none"

class PaintFinish(str, Enum):
    FLAT = "flat"
    EGGSHELL = "eggshell"
    SATIN = "satin"
    SEMI_GLOSS = "semi_gloss"
    GLOSS = "gloss"

class HVACEquipmentType(str, Enum):
    FURNACE_AC = "furnace_ac"
    HEAT_PUMP = "heat_pump"
    MINI_SPLIT = "mini_split"
    BOILER = "boiler"
    GEOTHERMAL = "geothermal"
    ROOFTOP_UNIT = "rooftop_unit"
    PTAC = "ptac"

class DuctMaterial(str, Enum):
    SHEET_METAL = "sheet_metal"
    FLEX = "flex"
    FIBERGLASS_DUCT_BOARD = "fiberglass_duct_board"

class WaterHeaterType(str, Enum):
    TANK_GAS = "tank_gas"
    TANK_ELECTRIC = "tank_electric"
    TANKLESS_GAS = "tankless_gas"
    TANKLESS_ELECTRIC = "tankless_electric"
    HEAT_PUMP_HYBRID = "heat_pump_hybrid"

class SupplyLineType(str, Enum):
    COPPER = "copper"
    PEX = "pex"
    CPVC = "cpvc"

class DrainLineType(str, Enum):
    PVC = "pvc"
    ABS = "abs"
    CAST_IRON = "cast_iron"

class BuildingType(str, Enum):
    RESIDENTIAL = "residential"
    COMMERCIAL = "commercial"
    INDUSTRIAL = "industrial"
    MIXED_USE = "mixed_use"

class MeasurementSource(str, Enum):
    MEASURED = "measured"
    ESTIMATED = "estimated"
    USER_PROVIDED = "user_provided"
    DEFAULT = "default"


# ---------------------------------------------------------------------------
# Dimension helper
# ---------------------------------------------------------------------------

@dataclass
class Dimension:
    """Stores a measurement. Internally uses decimal feet."""
    feet: int = 0
    inches: float = 0.0
    source: str = "measured"  # measured, estimated, user_provided, default

    @property
    def total_feet(self) -> float:
        return self.feet + (self.inches / 12.0)

    @property
    def total_inches(self) -> float:
        return (self.feet * 12.0) + self.inches

    @classmethod
    def from_feet(cls, total: float, source: str = "measured") -> Dimension:
        ft = int(total)
        inches = (total - ft) * 12.0
        return cls(feet=ft, inches=round(inches, 4), source=source)

    @classmethod
    def from_inches(cls, total: float, source: str = "measured") -> Dimension:
        ft = int(total // 12)
        inches = total % 12
        return cls(feet=ft, inches=round(inches, 4), source=source)

    def to_dict(self) -> dict:
        return {"feet": self.feet, "inches": self.inches, "source": self.source}

    @classmethod
    def from_dict(cls, d: dict) -> Dimension:
        return cls(feet=d.get("feet", 0), inches=d.get("inches", 0.0),
                   source=d.get("source", "measured"))

    def __str__(self) -> str:
        if self.inches == 0:
            return f"{self.feet}'-0\""
        return f"{self.feet}'-{self.inches:.0f}\""


# ---------------------------------------------------------------------------
# Openings (windows & doors)
# ---------------------------------------------------------------------------

@dataclass
class Opening:
    id: str = ""
    opening_type: str = "window"  # window, door
    width: Dimension = field(default_factory=Dimension)
    height: Dimension = field(default_factory=Dimension)
    quantity: int = 1
    style: str = ""  # double_hung, casement, slider, entry, interior, bi_fold, pocket, garage, etc.
    material: str = ""  # vinyl, wood, fiberglass, steel, hollow_core, solid_core, etc.
    location: str = ""  # room name or exterior face
    header_size: str = ""  # 2x6, 2x8, 2x10, 2x12, LVL
    rough_opening_width: Optional[Dimension] = None
    rough_opening_height: Optional[Dimension] = None

    def __post_init__(self):
        if self.rough_opening_width is None:
            # RO is typically opening + 2" width, + 2" height
            w_inches = self.width.total_inches + 2.0
            h_inches = self.height.total_inches + 2.0
            self.rough_opening_width = Dimension.from_inches(w_inches, "estimated")
            self.rough_opening_height = Dimension.from_inches(h_inches, "estimated")
        if not self.header_size:
            span = self.rough_opening_width.total_inches
            if span <= 48:
                self.header_size = "2x6"
            elif span <= 72:
                self.header_size = "2x8"
            elif span <= 96:
                self.header_size = "2x10"
            elif span <= 120:
                self.header_size = "2x12"
            else:
                self.header_size = "LVL"

    @property
    def area_sqft(self) -> float:
        return self.width.total_feet * self.height.total_feet

    def to_dict(self) -> dict:
        return {
            "id": self.id, "opening_type": self.opening_type,
            "width": self.width.to_dict(), "height": self.height.to_dict(),
            "quantity": self.quantity, "style": self.style, "material": self.material,
            "location": self.location, "header_size": self.header_size,
            "rough_opening_width": self.rough_opening_width.to_dict() if self.rough_opening_width else None,
            "rough_opening_height": self.rough_opening_height.to_dict() if self.rough_opening_height else None,
        }

    @classmethod
    def from_dict(cls, d: dict) -> Opening:
        obj = cls(
            id=d.get("id", ""), opening_type=d.get("opening_type", "window"),
            width=Dimension.from_dict(d.get("width", {})),
            height=Dimension.from_dict(d.get("height", {})),
            quantity=d.get("quantity", 1), style=d.get("style", ""),
            material=d.get("material", ""), location=d.get("location", ""),
            header_size=d.get("header_size", ""),
            rough_opening_width=Dimension.from_dict(d["rough_opening_width"]) if d.get("rough_opening_width") else None,
            rough_opening_height=Dimension.from_dict(d["rough_opening_height"]) if d.get("rough_opening_height") else None,
        )
        return obj


# ---------------------------------------------------------------------------
# Walls
# ---------------------------------------------------------------------------

@dataclass
class Wall:
    id: str = ""
    wall_type: str = "exterior"  # exterior, interior, party, shear, fire_rated
    floor: int = 1
    location: str = ""  # north, south, east, west, or room name
    length: Dimension = field(default_factory=Dimension)
    height: Dimension = field(default_factory=lambda: Dimension(feet=8, inches=0))
    thickness: str = "2x4"  # 2x4, 2x6, 2x8
    stud_spacing: float = 16.0  # inches OC
    openings: List[str] = field(default_factory=list)  # list of Opening.id
    insulation_type: str = "batt"
    insulation_r_value: float = 13.0
    is_fire_rated: bool = False
    fire_rating_hours: float = 0.0
    sheathing_type: str = "OSB"  # OSB, plywood, none
    interior_finish: str = "drywall"  # drywall, cement_board, none
    exterior_finish: str = "siding"  # siding, brick, stucco, stone, none
    # Sound insulation (for interior walls)
    sound_insulation: bool = False
    sound_insulation_type: str = ""  # "fiberglass_batt", "mineral_wool"
    sound_insulation_r_value: float = 0.0
    # Drywall type override (explicit per-wall control)
    drywall_type: str = ""  # "standard_1_2", "moisture_resistant", "fire_rated_5_8", "cement_board", "mold_resistant"

    @property
    def gross_area_sqft(self) -> float:
        return self.length.total_feet * self.height.total_feet

    @property
    def is_exterior(self) -> bool:
        return self.wall_type == "exterior"

    def net_area_sqft(self, openings_list: List[Opening]) -> float:
        """Gross area minus opening areas for openings on this wall."""
        opening_area = sum(
            o.area_sqft * o.quantity for o in openings_list
            if o.id in self.openings
        )
        return max(0, self.gross_area_sqft - opening_area)

    def to_dict(self) -> dict:
        return {
            "id": self.id, "wall_type": self.wall_type, "floor": self.floor,
            "location": self.location,
            "length": self.length.to_dict(), "height": self.height.to_dict(),
            "thickness": self.thickness, "stud_spacing": self.stud_spacing,
            "openings": self.openings,
            "insulation_type": self.insulation_type,
            "insulation_r_value": self.insulation_r_value,
            "is_fire_rated": self.is_fire_rated,
            "fire_rating_hours": self.fire_rating_hours,
            "sheathing_type": self.sheathing_type,
            "interior_finish": self.interior_finish,
            "exterior_finish": self.exterior_finish,
            "sound_insulation": self.sound_insulation,
            "sound_insulation_type": self.sound_insulation_type,
            "sound_insulation_r_value": self.sound_insulation_r_value,
            "drywall_type": self.drywall_type,
        }

    @classmethod
    def from_dict(cls, d: dict) -> Wall:
        return cls(
            id=d.get("id", ""), wall_type=d.get("wall_type", "exterior"),
            floor=d.get("floor", 1), location=d.get("location", ""),
            length=Dimension.from_dict(d.get("length", {})),
            height=Dimension.from_dict(d.get("height", {})),
            thickness=d.get("thickness", "2x4"),
            stud_spacing=d.get("stud_spacing", 16.0),
            openings=d.get("openings", []),
            insulation_type=d.get("insulation_type", "batt"),
            insulation_r_value=d.get("insulation_r_value", 13.0),
            is_fire_rated=d.get("is_fire_rated", False),
            fire_rating_hours=d.get("fire_rating_hours", 0.0),
            sheathing_type=d.get("sheathing_type", "OSB"),
            interior_finish=d.get("interior_finish", "drywall"),
            exterior_finish=d.get("exterior_finish", "siding"),
            sound_insulation=d.get("sound_insulation", False),
            sound_insulation_type=d.get("sound_insulation_type", ""),
            sound_insulation_r_value=d.get("sound_insulation_r_value", 0.0),
            drywall_type=d.get("drywall_type", ""),
        )


# ---------------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------------

@dataclass
class Room:
    name: str = ""
    floor: int = 1
    length: Dimension = field(default_factory=Dimension)
    width: Dimension = field(default_factory=Dimension)
    ceiling_height: Dimension = field(default_factory=lambda: Dimension(feet=8, inches=0))
    ceiling_type: str = "flat"  # flat, vaulted, tray, cathedral, coffered, dropped
    floor_type: str = "hardwood"
    walls: List[str] = field(default_factory=list)  # references to Wall.id
    is_bathroom: bool = False
    is_kitchen: bool = False
    is_garage: bool = False
    is_utility: bool = False
    trim_baseboard: str = "3.25_mdf"  # type/size
    trim_crown: str = ""  # empty = no crown
    trim_casing: str = "2.25_mdf"
    paint_walls: str = "latex"
    paint_ceiling: str = "latex"
    paint_finish: str = "eggshell"

    @property
    def floor_area_sqft(self) -> float:
        return self.length.total_feet * self.width.total_feet

    @property
    def ceiling_area_sqft(self) -> float:
        if self.ceiling_type == "flat":
            return self.floor_area_sqft
        elif self.ceiling_type == "vaulted" or self.ceiling_type == "cathedral":
            return self.floor_area_sqft * 1.15  # rough estimate for sloped ceiling
        elif self.ceiling_type == "tray":
            return self.floor_area_sqft * 1.1
        elif self.ceiling_type == "coffered":
            return self.floor_area_sqft * 1.2
        return self.floor_area_sqft

    @property
    def perimeter_ft(self) -> float:
        return 2 * (self.length.total_feet + self.width.total_feet)

    def to_dict(self) -> dict:
        return {
            "name": self.name, "floor": self.floor,
            "length": self.length.to_dict(), "width": self.width.to_dict(),
            "ceiling_height": self.ceiling_height.to_dict(),
            "ceiling_type": self.ceiling_type, "floor_type": self.floor_type,
            "walls": self.walls,
            "is_bathroom": self.is_bathroom, "is_kitchen": self.is_kitchen,
            "is_garage": self.is_garage, "is_utility": self.is_utility,
            "trim_baseboard": self.trim_baseboard, "trim_crown": self.trim_crown,
            "trim_casing": self.trim_casing,
            "paint_walls": self.paint_walls, "paint_ceiling": self.paint_ceiling,
            "paint_finish": self.paint_finish,
        }

    @classmethod
    def from_dict(cls, d: dict) -> Room:
        return cls(
            name=d.get("name", ""), floor=d.get("floor", 1),
            length=Dimension.from_dict(d.get("length", {})),
            width=Dimension.from_dict(d.get("width", {})),
            ceiling_height=Dimension.from_dict(d.get("ceiling_height", {})),
            ceiling_type=d.get("ceiling_type", "flat"),
            floor_type=d.get("floor_type", "hardwood"),
            walls=d.get("walls", []),
            is_bathroom=d.get("is_bathroom", False),
            is_kitchen=d.get("is_kitchen", False),
            is_garage=d.get("is_garage", False),
            is_utility=d.get("is_utility", False),
            trim_baseboard=d.get("trim_baseboard", "3.25_mdf"),
            trim_crown=d.get("trim_crown", ""),
            trim_casing=d.get("trim_casing", "2.25_mdf"),
            paint_walls=d.get("paint_walls", "latex"),
            paint_ceiling=d.get("paint_ceiling", "latex"),
            paint_finish=d.get("paint_finish", "eggshell"),
        )


# ---------------------------------------------------------------------------
# Roof
# ---------------------------------------------------------------------------

@dataclass
class RoofSection:
    id: str = ""
    section_type: str = "gable"  # gable, hip, shed, flat, gambrel, mansard, dutch_hip
    pitch: float = 6.0  # rise per 12 run (e.g., 6 means 6:12)
    horizontal_area: float = 0.0  # sq ft (plan-view footprint)
    material: str = "asphalt_shingle"
    ridge_length: float = 0.0  # linear feet
    hip_length: float = 0.0
    valley_length: float = 0.0
    eave_length: float = 0.0
    rake_length: float = 0.0

    @property
    def slope_factor(self) -> float:
        """Multiplier to convert horizontal area to actual sloped area."""
        return math.sqrt(1 + (self.pitch / 12.0) ** 2)

    @property
    def actual_area(self) -> float:
        return self.horizontal_area * self.slope_factor

    def to_dict(self) -> dict:
        return {
            "id": self.id, "section_type": self.section_type,
            "pitch": self.pitch, "horizontal_area": self.horizontal_area,
            "material": self.material,
            "ridge_length": self.ridge_length, "hip_length": self.hip_length,
            "valley_length": self.valley_length, "eave_length": self.eave_length,
            "rake_length": self.rake_length,
        }

    @staticmethod
    def _to_float(val, fallback: float = 0.0) -> float:
        """Convert a value that may be a Dimension dict, float, or int to float."""
        if isinstance(val, dict):
            # Dimension format: {"feet": N, "inches": N}
            return float(val.get("feet", 0)) + float(val.get("inches", 0)) / 12.0
        if isinstance(val, (int, float)):
            return float(val)
        return fallback

    @classmethod
    def from_dict(cls, d: dict) -> RoofSection:
        tf = cls._to_float
        pitch = tf(d.get("pitch", 6.0))

        # horizontal_area is the plan-view footprint; total_area_sf is sloped area.
        # If only total_area_sf is provided, convert back to horizontal by dividing
        # out the slope factor so actual_area property doesn't double-count.
        horiz = tf(d.get("horizontal_area", 0.0))
        if horiz <= 0:
            total_sf = tf(d.get("total_area_sf", 0.0))
            if total_sf > 0 and pitch > 0:
                slope_factor = math.sqrt(1 + (pitch / 12.0) ** 2)
                horiz = total_sf / slope_factor
            else:
                horiz = total_sf  # fallback: treat as horizontal

        return cls(
            id=d.get("id", ""), section_type=d.get("section_type", d.get("style", "gable")),
            pitch=pitch,
            horizontal_area=horiz,
            material=d.get("material", "asphalt_shingle"),
            ridge_length=tf(d.get("ridge_length", 0.0)),
            hip_length=tf(d.get("hip_length", 0.0)),
            valley_length=tf(d.get("valley_length", 0.0)),
            eave_length=tf(d.get("eave_length", 0.0)),
            rake_length=tf(d.get("rake_length", 0.0)),
        )


# ---------------------------------------------------------------------------
# Foundation
# ---------------------------------------------------------------------------

@dataclass
class Foundation:
    foundation_type: str = "slab"  # slab, crawlspace, full_basement, pier, daylight_basement
    perimeter: float = 0.0  # linear feet
    area: float = 0.0  # sq ft
    depth: float = 0.0  # feet (wall height for basement/crawl)
    footing_width: Dimension = field(default_factory=lambda: Dimension(feet=1, inches=8))
    footing_depth: Dimension = field(default_factory=lambda: Dimension(feet=0, inches=12))
    wall_thickness: str = "8_inch_cmu"  # 8_inch_cmu, 10_inch_poured, 12_inch_poured
    waterproofing: bool = False
    drain_tile: bool = False
    slab_thickness: Dimension = field(default_factory=lambda: Dimension(feet=0, inches=4))

    def to_dict(self) -> dict:
        return {
            "foundation_type": self.foundation_type,
            "perimeter": self.perimeter, "area": self.area, "depth": self.depth,
            "footing_width": self.footing_width.to_dict(),
            "footing_depth": self.footing_depth.to_dict(),
            "wall_thickness": self.wall_thickness,
            "waterproofing": self.waterproofing, "drain_tile": self.drain_tile,
            "slab_thickness": self.slab_thickness.to_dict(),
        }

    @classmethod
    def from_dict(cls, d: dict) -> Foundation:
        return cls(
            foundation_type=d.get("foundation_type", "slab"),
            perimeter=d.get("perimeter", 0.0), area=d.get("area", 0.0),
            depth=d.get("depth", 0.0),
            footing_width=Dimension.from_dict(d.get("footing_width", {})),
            footing_depth=Dimension.from_dict(d.get("footing_depth", {})),
            wall_thickness=d.get("wall_thickness", "8_inch_cmu"),
            waterproofing=d.get("waterproofing", False),
            drain_tile=d.get("drain_tile", False),
            slab_thickness=Dimension.from_dict(d.get("slab_thickness", {})),
        )


# ---------------------------------------------------------------------------
# Stairs
# ---------------------------------------------------------------------------

@dataclass
class StairCase:
    id: str = ""
    floors_connected: List[int] = field(default_factory=lambda: [1, 2])
    total_rise: Dimension = field(default_factory=lambda: Dimension(feet=8, inches=0))
    num_risers: int = 14
    num_treads: int = 13
    width: Dimension = field(default_factory=lambda: Dimension(feet=3, inches=0))
    stringer_count: int = 3
    material: str = "dimensional_lumber"
    has_landing: bool = False
    railing: bool = True

    def to_dict(self) -> dict:
        return {
            "id": self.id, "floors_connected": self.floors_connected,
            "total_rise": self.total_rise.to_dict(),
            "num_risers": self.num_risers, "num_treads": self.num_treads,
            "width": self.width.to_dict(), "stringer_count": self.stringer_count,
            "material": self.material, "has_landing": self.has_landing,
            "railing": self.railing,
        }

    @classmethod
    def from_dict(cls, d: dict) -> StairCase:
        return cls(
            id=d.get("id", ""), floors_connected=d.get("floors_connected", [1, 2]),
            total_rise=Dimension.from_dict(d.get("total_rise", {})),
            num_risers=d.get("num_risers", 14), num_treads=d.get("num_treads", 13),
            width=Dimension.from_dict(d.get("width", {})),
            stringer_count=d.get("stringer_count", 3),
            material=d.get("material", "dimensional_lumber"),
            has_landing=d.get("has_landing", False),
            railing=d.get("railing", True),
        )


# ---------------------------------------------------------------------------
# HVAC
# ---------------------------------------------------------------------------

@dataclass
class DuctRun:
    size: str = "6x10"  # e.g., 6x10, 8_round, 10x12
    length: float = 0.0  # linear feet
    duct_type: str = "supply"  # supply, return, trunk, exhaust
    material: str = "sheet_metal"

    def to_dict(self) -> dict:
        return {"size": self.size, "length": self.length,
                "duct_type": self.duct_type, "material": self.material}

    @classmethod
    def from_dict(cls, d: dict) -> DuctRun:
        return cls(**{k: d.get(k, v) for k, v in
                      {"size": "6x10", "length": 0.0,
                       "duct_type": "supply", "material": "sheet_metal"}.items()})


@dataclass
class Register:
    size: str = "4x10"
    register_type: str = "supply"  # supply, return, transfer, exhaust
    location: str = ""
    style: str = "floor"  # floor, ceiling, wall, baseboard
    quantity: int = 1

    def to_dict(self) -> dict:
        return {"size": self.size, "register_type": self.register_type,
                "location": self.location, "style": self.style,
                "quantity": self.quantity}

    @classmethod
    def from_dict(cls, d: dict) -> Register:
        return cls(**{k: d.get(k, v) for k, v in
                      {"size": "4x10", "register_type": "supply",
                       "location": "", "style": "floor", "quantity": 1}.items()})


@dataclass
class HVACSystem:
    equipment_type: str = "furnace_ac"
    heating_btu: int = 80000
    cooling_tons: float = 3.0
    duct_runs: List[DuctRun] = field(default_factory=list)
    supply_registers: List[Register] = field(default_factory=list)
    return_grilles: List[Register] = field(default_factory=list)
    thermostats: int = 1
    condensate_drains: int = 1
    refrigerant_line_sets: int = 1
    exhaust_fans: int = 0
    zoning: bool = False
    num_zones: int = 1

    def to_dict(self) -> dict:
        return {
            "equipment_type": self.equipment_type,
            "heating_btu": self.heating_btu, "cooling_tons": self.cooling_tons,
            "duct_runs": [d.to_dict() for d in self.duct_runs],
            "supply_registers": [r.to_dict() for r in self.supply_registers],
            "return_grilles": [r.to_dict() for r in self.return_grilles],
            "thermostats": self.thermostats,
            "condensate_drains": self.condensate_drains,
            "refrigerant_line_sets": self.refrigerant_line_sets,
            "exhaust_fans": self.exhaust_fans,
            "zoning": self.zoning, "num_zones": self.num_zones,
        }

    @classmethod
    def from_dict(cls, d: dict) -> HVACSystem:
        return cls(
            equipment_type=d.get("equipment_type", "furnace_ac"),
            heating_btu=d.get("heating_btu", 80000),
            cooling_tons=d.get("cooling_tons", 3.0),
            duct_runs=[DuctRun.from_dict(x) for x in d.get("duct_runs", [])],
            supply_registers=[Register.from_dict(x) for x in d.get("supply_registers", [])],
            return_grilles=[Register.from_dict(x) for x in d.get("return_grilles", [])],
            thermostats=d.get("thermostats", 1),
            condensate_drains=d.get("condensate_drains", 1),
            refrigerant_line_sets=d.get("refrigerant_line_sets", 1),
            exhaust_fans=d.get("exhaust_fans", 0),
            zoning=d.get("zoning", False), num_zones=d.get("num_zones", 1),
        )


# ---------------------------------------------------------------------------
# Electrical
# ---------------------------------------------------------------------------

@dataclass
class Circuit:
    circuit_number: int = 0
    circuit_type: str = "general_15a"  # general_15a, general_20a, dedicated_20a, dedicated_30a, dedicated_40a, dedicated_50a
    wire_gauge: str = "14/2"  # 14/2, 12/2, 10/2, 10/3, 8/3, 6/3
    estimated_length: float = 50.0  # feet
    breaker_type: str = "standard"  # standard, afci, gfci, dual_function

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> Circuit:
        return cls(**{k: d.get(k, v) for k, v in
                      {"circuit_number": 0, "circuit_type": "general_15a",
                       "wire_gauge": "14/2", "estimated_length": 50.0,
                       "breaker_type": "standard"}.items()})


@dataclass
class ElectricalDevice:
    device_type: str = "standard_outlet"
    # outlet types: standard_outlet, gfci_outlet, afci_outlet, dedicated_outlet, usb_outlet, floor_outlet
    # switch types: single_switch, 3way_switch, 4way_switch, dimmer_switch, smart_switch, occupancy_sensor
    location: str = ""
    quantity: int = 1
    gang: int = 1  # 1, 2, 3, 4

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> ElectricalDevice:
        return cls(**{k: d.get(k, v) for k, v in
                      {"device_type": "standard_outlet", "location": "",
                       "quantity": 1, "gang": 1}.items()})


@dataclass
class LightFixture:
    fixture_type: str = "recessed_6in"
    # recessed_4in, recessed_6in, pendant, flush_mount, semi_flush, chandelier,
    # vanity_bar, under_cabinet, track, exterior_wall, exterior_post, can_light
    location: str = ""
    quantity: int = 1
    is_led: bool = True

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> LightFixture:
        return cls(**{k: d.get(k, v) for k, v in
                      {"fixture_type": "recessed_6in", "location": "",
                       "quantity": 1, "is_led": True}.items()})


@dataclass
class ElectricalSystem:
    panel_main_amps: int = 200
    panel_sub: int = 0  # number of sub-panels
    sub_panel_amps: int = 100
    circuits: List[Circuit] = field(default_factory=list)
    outlets: List[ElectricalDevice] = field(default_factory=list)
    switches: List[ElectricalDevice] = field(default_factory=list)
    fixtures: List[LightFixture] = field(default_factory=list)
    smoke_detectors: int = 0
    co_detectors: int = 0
    doorbell: bool = True
    garage_door_opener: int = 0
    ev_charger: bool = False
    generator_transfer_switch: bool = False

    @property
    def total_outlets(self) -> int:
        return sum(d.quantity for d in self.outlets)

    @property
    def total_switches(self) -> int:
        return sum(d.quantity for d in self.switches)

    @property
    def total_fixtures(self) -> int:
        return sum(f.quantity for f in self.fixtures)

    def to_dict(self) -> dict:
        return {
            "panel_main_amps": self.panel_main_amps,
            "panel_sub": self.panel_sub,
            "sub_panel_amps": self.sub_panel_amps,
            "circuits": [c.to_dict() for c in self.circuits],
            "outlets": [o.to_dict() for o in self.outlets],
            "switches": [s.to_dict() for s in self.switches],
            "fixtures": [f.to_dict() for f in self.fixtures],
            "smoke_detectors": self.smoke_detectors,
            "co_detectors": self.co_detectors,
            "doorbell": self.doorbell,
            "garage_door_opener": self.garage_door_opener,
            "ev_charger": self.ev_charger,
            "generator_transfer_switch": self.generator_transfer_switch,
        }

    @classmethod
    def from_dict(cls, d: dict) -> ElectricalSystem:
        return cls(
            panel_main_amps=d.get("panel_main_amps", 200),
            panel_sub=d.get("panel_sub", 0),
            sub_panel_amps=d.get("sub_panel_amps", 100),
            circuits=[Circuit.from_dict(c) for c in d.get("circuits", [])],
            outlets=[ElectricalDevice.from_dict(o) for o in d.get("outlets", [])],
            switches=[ElectricalDevice.from_dict(s) for s in d.get("switches", [])],
            fixtures=[LightFixture.from_dict(f) for f in d.get("fixtures", [])],
            smoke_detectors=d.get("smoke_detectors", 0),
            co_detectors=d.get("co_detectors", 0),
            doorbell=d.get("doorbell", True),
            garage_door_opener=d.get("garage_door_opener", 0),
            ev_charger=d.get("ev_charger", False),
            generator_transfer_switch=d.get("generator_transfer_switch", False),
        )


# ---------------------------------------------------------------------------
# Plumbing
# ---------------------------------------------------------------------------

@dataclass
class PlumbingFixture:
    fixture_type: str = "toilet"
    # toilet, lavatory, kitchen_sink, bathtub, shower, tub_shower_combo,
    # utility_sink, wet_bar_sink, laundry, dishwasher, ice_maker, floor_drain
    location: str = ""
    quantity: int = 1
    quality: str = "mid"  # builder, mid, high, luxury

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> PlumbingFixture:
        return cls(**{k: d.get(k, v) for k, v in
                      {"fixture_type": "toilet", "location": "",
                       "quantity": 1, "quality": "mid"}.items()})


@dataclass
class PlumbingSystem:
    fixtures: List[PlumbingFixture] = field(default_factory=list)
    water_heater_type: str = "tank_gas"
    water_heater_gallons: int = 50
    hose_bibs: int = 2
    supply_line_type: str = "pex"  # copper, pex, cpvc
    drain_line_type: str = "pvc"  # pvc, abs, cast_iron
    supply_total_feet: float = 0.0
    drain_total_feet: float = 0.0
    vent_total_feet: float = 0.0
    gas_line: bool = False
    gas_line_feet: float = 0.0
    sump_pump: bool = False
    water_softener: bool = False
    recirculating_pump: bool = False

    @property
    def total_fixtures(self) -> int:
        return sum(f.quantity for f in self.fixtures)

    def to_dict(self) -> dict:
        return {
            "fixtures": [f.to_dict() for f in self.fixtures],
            "water_heater_type": self.water_heater_type,
            "water_heater_gallons": self.water_heater_gallons,
            "hose_bibs": self.hose_bibs,
            "supply_line_type": self.supply_line_type,
            "drain_line_type": self.drain_line_type,
            "supply_total_feet": self.supply_total_feet,
            "drain_total_feet": self.drain_total_feet,
            "vent_total_feet": self.vent_total_feet,
            "gas_line": self.gas_line, "gas_line_feet": self.gas_line_feet,
            "sump_pump": self.sump_pump,
            "water_softener": self.water_softener,
            "recirculating_pump": self.recirculating_pump,
        }

    @classmethod
    def from_dict(cls, d: dict) -> PlumbingSystem:
        return cls(
            fixtures=[PlumbingFixture.from_dict(f) for f in d.get("fixtures", [])],
            water_heater_type=d.get("water_heater_type", "tank_gas"),
            water_heater_gallons=d.get("water_heater_gallons", 50),
            hose_bibs=d.get("hose_bibs", 2),
            supply_line_type=d.get("supply_line_type", "pex"),
            drain_line_type=d.get("drain_line_type", "pvc"),
            supply_total_feet=d.get("supply_total_feet", 0.0),
            drain_total_feet=d.get("drain_total_feet", 0.0),
            vent_total_feet=d.get("vent_total_feet", 0.0),
            gas_line=d.get("gas_line", False),
            gas_line_feet=d.get("gas_line_feet", 0.0),
            sump_pump=d.get("sump_pump", False),
            water_softener=d.get("water_softener", False),
            recirculating_pump=d.get("recirculating_pump", False),
        )


# ---------------------------------------------------------------------------
# Gutters
# ---------------------------------------------------------------------------

@dataclass
class GutterRun:
    id: str = ""
    length: float = 0.0  # linear feet
    size: str = "5_inch"  # 5_inch, 6_inch
    material: str = "aluminum"  # aluminum, copper, steel, vinyl
    location: str = ""  # e.g., "north eave", "south eave"
    downspouts: int = 1
    inside_miters: int = 0
    outside_miters: int = 0
    # Gutter profile
    style: str = "k_style"  # "k_style", "half_round", "box"
    color: str = ""  # e.g., "white", "brown", "bronze", "custom"
    # Downspout details
    downspout_size: str = "2x3"  # "2x3", "3x4", "4_round", "4x5", "box"
    downspout_material: str = ""  # defaults to match gutter material if empty
    downspout_color: str = ""  # defaults to match gutter color if empty

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> GutterRun:
        return cls(**{k: d.get(k, v) for k, v in
                      {"id": "", "length": 0.0, "size": "5_inch",
                       "material": "aluminum", "location": "",
                       "downspouts": 1, "inside_miters": 0,
                       "outside_miters": 0,
                       "style": "k_style", "color": "",
                       "downspout_size": "2x3",
                       "downspout_material": "",
                       "downspout_color": ""}.items()})


# ---------------------------------------------------------------------------
# Top-level Building Model
# ---------------------------------------------------------------------------

@dataclass
class BuildingModel:
    # Project info
    project_name: str = ""
    project_address: str = ""
    building_type: str = "residential"
    stories: int = 1
    total_sqft: float = 0.0
    conditioned_sqft: float = 0.0

    # Building components
    rooms: List[Room] = field(default_factory=list)
    walls: List[Wall] = field(default_factory=list)
    openings: List[Opening] = field(default_factory=list)
    roof_sections: List[RoofSection] = field(default_factory=list)
    foundation: Foundation = field(default_factory=Foundation)
    stairs: List[StairCase] = field(default_factory=list)

    # MEP systems
    hvac: Optional[HVACSystem] = None
    electrical: Optional[ElectricalSystem] = None
    plumbing: Optional[PlumbingSystem] = None

    # Exterior details
    eave_depth: Dimension = field(default_factory=lambda: Dimension(feet=1, inches=0))
    eave_perimeter: float = 0.0  # linear feet
    fascia_perimeter: float = 0.0
    gutter_runs: List[GutterRun] = field(default_factory=list)
    siding_type: str = "fiber_cement"
    house_wrap: bool = True
    vapor_barrier: bool = True

    # Attic / crawlspace
    attic_area: float = 0.0
    attic_access_points: int = 1
    attic_insulation_type: str = "blown"
    attic_insulation_r_value: float = 38.0
    crawlspace_area: float = 0.0
    crawlspace_height: Dimension = field(default_factory=lambda: Dimension(feet=3, inches=0))
    crawlspace_vapor_barrier: bool = True
    crawlspace_wall_insulation: bool = False
    crawlspace_wall_insulation_type: str = "rigid"  # "rigid", "spray_foam_closed"
    crawlspace_wall_insulation_r_value: float = 10.0
    crawlspace_perimeter: float = 0.0  # linear feet

    # Roof vs attic distinction for insulation
    has_attic: bool = True  # True = attic space exists (insulate attic floor)
    has_cathedral_ceiling: bool = False  # True = no attic, insulate roof deck
    roof_insulation_type: str = "none"  # for cathedral: "spray_foam_open", "spray_foam_closed", "rigid"
    roof_insulation_r_value: float = 0.0

    # Floor insulation for sound (between floors in multi-story)
    floor_sound_insulation: bool = False
    floor_sound_insulation_type: str = "batt"  # "batt", "mineral_wool"
    floor_sound_insulation_area: float = 0.0  # sf of floor between stories

    # Air sealing
    air_sealing: bool = False
    air_sealing_sqft: float = 0.0  # conditioned envelope area for sealing

    # Metadata
    scale: str = ""  # e.g., "1/4 inch = 1 foot"
    notes: List[str] = field(default_factory=list)

    # ------- Computed helpers -------

    @property
    def exterior_walls(self) -> List[Wall]:
        return [w for w in self.walls if w.wall_type == "exterior"]

    @property
    def interior_walls(self) -> List[Wall]:
        return [w for w in self.walls if w.wall_type != "exterior"]

    def total_exterior_wall_area(self) -> float:
        return sum(w.gross_area_sqft for w in self.exterior_walls)

    def total_interior_wall_area(self) -> float:
        return sum(w.gross_area_sqft for w in self.interior_walls)

    def net_exterior_wall_area(self) -> float:
        return sum(w.net_area_sqft(self.openings) for w in self.exterior_walls)

    def net_interior_wall_area(self) -> float:
        return sum(w.net_area_sqft(self.openings) for w in self.interior_walls)

    def total_roof_area(self) -> float:
        return sum(rs.actual_area for rs in self.roof_sections)

    def total_ceiling_area(self) -> float:
        return sum(r.ceiling_area_sqft for r in self.rooms)

    def total_floor_area(self) -> float:
        return sum(r.floor_area_sqft for r in self.rooms)

    def get_wall(self, wall_id: str) -> Optional[Wall]:
        for w in self.walls:
            if w.id == wall_id:
                return w
        return None

    def get_opening(self, opening_id: str) -> Optional[Opening]:
        for o in self.openings:
            if o.id == opening_id:
                return o
        return None

    def get_openings_for_wall(self, wall_id: str) -> List[Opening]:
        wall = self.get_wall(wall_id)
        if not wall:
            return []
        return [o for o in self.openings if o.id in wall.openings]

    def rooms_on_floor(self, floor: int) -> List[Room]:
        return [r for r in self.rooms if r.floor == floor]

    def walls_on_floor(self, floor: int) -> List[Wall]:
        return [w for w in self.walls if w.floor == floor]

    # ------- Serialization -------

    def to_dict(self) -> dict:
        return {
            "project_name": self.project_name,
            "project_address": self.project_address,
            "building_type": self.building_type,
            "stories": self.stories,
            "total_sqft": self.total_sqft,
            "conditioned_sqft": self.conditioned_sqft,
            "rooms": [r.to_dict() for r in self.rooms],
            "walls": [w.to_dict() for w in self.walls],
            "openings": [o.to_dict() for o in self.openings],
            "roof_sections": [rs.to_dict() for rs in self.roof_sections],
            "foundation": self.foundation.to_dict(),
            "stairs": [s.to_dict() for s in self.stairs],
            "hvac": self.hvac.to_dict() if self.hvac else None,
            "electrical": self.electrical.to_dict() if self.electrical else None,
            "plumbing": self.plumbing.to_dict() if self.plumbing else None,
            "eave_depth": self.eave_depth.to_dict(),
            "eave_perimeter": self.eave_perimeter,
            "fascia_perimeter": self.fascia_perimeter,
            "gutter_runs": [g.to_dict() for g in self.gutter_runs],
            "siding_type": self.siding_type,
            "house_wrap": self.house_wrap,
            "vapor_barrier": self.vapor_barrier,
            "attic_area": self.attic_area,
            "attic_access_points": self.attic_access_points,
            "attic_insulation_type": self.attic_insulation_type,
            "attic_insulation_r_value": self.attic_insulation_r_value,
            "crawlspace_area": self.crawlspace_area,
            "crawlspace_height": self.crawlspace_height.to_dict(),
            "crawlspace_vapor_barrier": self.crawlspace_vapor_barrier,
            "crawlspace_wall_insulation": self.crawlspace_wall_insulation,
            "crawlspace_wall_insulation_type": self.crawlspace_wall_insulation_type,
            "crawlspace_wall_insulation_r_value": self.crawlspace_wall_insulation_r_value,
            "crawlspace_perimeter": self.crawlspace_perimeter,
            "has_attic": self.has_attic,
            "has_cathedral_ceiling": self.has_cathedral_ceiling,
            "roof_insulation_type": self.roof_insulation_type,
            "roof_insulation_r_value": self.roof_insulation_r_value,
            "floor_sound_insulation": self.floor_sound_insulation,
            "floor_sound_insulation_type": self.floor_sound_insulation_type,
            "floor_sound_insulation_area": self.floor_sound_insulation_area,
            "air_sealing": self.air_sealing,
            "air_sealing_sqft": self.air_sealing_sqft,
            "scale": self.scale,
            "notes": self.notes,
        }

    @classmethod
    def _parse_roof_sections(cls, d: dict) -> list:
        """Parse roof data — handles both 'roof_sections' array and flat 'roof' object from Claude."""
        # Prefer explicit roof_sections array
        if d.get("roof_sections"):
            return [RoofSection.from_dict(rs) for rs in d["roof_sections"]]

        # Fall back to flat 'roof' object (Claude analysis schema)
        roof = d.get("roof")
        if isinstance(roof, dict):
            return [RoofSection.from_dict(roof)]

        return []

    @classmethod
    def from_dict(cls, d: dict) -> BuildingModel:
        return cls(
            project_name=d.get("project_name", ""),
            project_address=d.get("project_address", ""),
            building_type=d.get("building_type", "residential"),
            stories=d.get("stories", 1),
            total_sqft=d.get("total_sqft", d.get("sqft", 0.0)),
            conditioned_sqft=d.get("conditioned_sqft", 0.0),
            rooms=[Room.from_dict(r) for r in d.get("rooms", [])],
            walls=[Wall.from_dict(w) for w in d.get("walls", [])],
            openings=[Opening.from_dict(o) for o in d.get("openings", [])],
            roof_sections=cls._parse_roof_sections(d),
            foundation=Foundation.from_dict(d.get("foundation", {})),
            stairs=[StairCase.from_dict(s) for s in d.get("stairs", [])],
            hvac=HVACSystem.from_dict(d["hvac"]) if d.get("hvac") else None,
            electrical=ElectricalSystem.from_dict(d["electrical"]) if d.get("electrical") else None,
            plumbing=PlumbingSystem.from_dict(d["plumbing"]) if d.get("plumbing") else None,
            eave_depth=Dimension.from_dict(d.get("eave_depth", {})),
            eave_perimeter=d.get("eave_perimeter", 0.0),
            fascia_perimeter=d.get("fascia_perimeter", 0.0),
            gutter_runs=[GutterRun.from_dict(g) for g in d.get("gutter_runs", [])],
            siding_type=d.get("siding_type", "fiber_cement"),
            house_wrap=d.get("house_wrap", True),
            vapor_barrier=d.get("vapor_barrier", True),
            attic_area=d.get("attic_area", 0.0),
            attic_access_points=d.get("attic_access_points", 1),
            attic_insulation_type=d.get("attic_insulation_type", "blown"),
            attic_insulation_r_value=d.get("attic_insulation_r_value", 38.0),
            crawlspace_area=d.get("crawlspace_area", 0.0),
            crawlspace_height=Dimension.from_dict(d.get("crawlspace_height", {})),
            crawlspace_vapor_barrier=d.get("crawlspace_vapor_barrier", True),
            crawlspace_wall_insulation=d.get("crawlspace_wall_insulation", False),
            crawlspace_wall_insulation_type=d.get("crawlspace_wall_insulation_type", "rigid"),
            crawlspace_wall_insulation_r_value=d.get("crawlspace_wall_insulation_r_value", 10.0),
            crawlspace_perimeter=d.get("crawlspace_perimeter", 0.0),
            has_attic=d.get("has_attic", True),
            has_cathedral_ceiling=d.get("has_cathedral_ceiling", False),
            roof_insulation_type=d.get("roof_insulation_type", "none"),
            roof_insulation_r_value=d.get("roof_insulation_r_value", 0.0),
            floor_sound_insulation=d.get("floor_sound_insulation", False),
            floor_sound_insulation_type=d.get("floor_sound_insulation_type", "batt"),
            floor_sound_insulation_area=d.get("floor_sound_insulation_area", 0.0),
            air_sealing=d.get("air_sealing", False),
            air_sealing_sqft=d.get("air_sealing_sqft", 0.0),
            scale=d.get("scale", ""),
            notes=d.get("notes", []),
        )

    def to_json(self, filepath: str) -> None:
        with open(filepath, 'w') as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def from_json(cls, filepath: str) -> BuildingModel:
        with open(filepath, 'r') as f:
            return cls.from_dict(json.load(f))


# ---------------------------------------------------------------------------
# Line Item (output of trade calculators)
# ---------------------------------------------------------------------------

@dataclass
class LineItem:
    trade: str = ""
    category: str = ""
    description: str = ""
    quantity: float = 0.0
    unit: str = "ea"  # ea, lf, sf, bd_ft, roll, bag, box, gal, bundle, sheet, etc.
    material_unit_cost: float = 0.0
    material_total: float = 0.0
    labor_hours: float = 0.0
    labor_rate: float = 0.0
    labor_total: float = 0.0
    line_total: float = 0.0

    def calculate_totals(self) -> None:
        self.material_total = round(self.quantity * self.material_unit_cost, 2)
        self.labor_total = round(self.labor_hours * self.labor_rate, 2)
        self.line_total = round(self.material_total + self.labor_total, 2)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> LineItem:
        return cls(**d)
