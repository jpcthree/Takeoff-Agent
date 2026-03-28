#!/usr/bin/env python3
"""
property_lookup.py — API orchestrator for existing-home estimates.

Takes a street address, queries public APIs for property data and building
geometry, and returns a unified PropertyData object.

Data source priority:
  1. Google Geocoding API (address → lat/lng)  — requires API key
     Fallback: US Census Geocoder (free, no key)
  2. Google Solar API (roof segments, footprint) — requires API key
  3. OpenStreetMap Overpass API (building footprint) — free, no key
  4. Colorado Geospatial Portal (assessor data)   — free, CO only
     Future: ATTOM Data API (national, $95/mo)
"""
from __future__ import annotations

import json
import math
import os
import time
from dataclasses import dataclass, field
from pathlib import Path

try:
    import requests
except ImportError:
    raise SystemExit(
        "The 'requests' library is required.  Install with:\n"
        "  pip install requests"
    )

# ── Config paths ────────────────────────────────────────────────────────────
_ROOT = Path(__file__).resolve().parents[4]  # Takeoff Agent root
_CONFIG_DIR = _ROOT / "config"
_API_KEYS_FILE = _CONFIG_DIR / "api_keys.json"

# ── Timeouts & retries ─────────────────────────────────────────────────────
_TIMEOUT = 15  # seconds per HTTP request
_RETRY_DELAY = 1.0


# ── PropertyData ────────────────────────────────────────────────────────────
@dataclass
class PropertyData:
    """Unified property data from all API sources."""

    # Location
    address: str = ""
    lat: float = 0.0
    lng: float = 0.0

    # Assessor / property record data
    year_built: int = 0
    total_sqft: float = 0.0
    finished_sqft: float = 0.0
    lot_sqft: float = 0.0
    stories: int = 1
    bedrooms: int = 0
    bathrooms: float = 0.0
    basement: str = ""            # "full", "partial", "crawlspace", "none", ""
    basement_sqft: float = 0.0
    garage: str = ""              # "attached", "detached", "none", ""
    garage_sqft: float = 0.0
    roof_type: str = ""           # "gable", "hip", "flat", "mixed"
    roof_material: str = ""       # "asphalt_shingle", "metal", "tile"
    exterior_wall_material: str = ""  # "frame", "brick", "stucco", "vinyl"
    construction_type: str = ""       # "frame", "masonry", "steel"
    heating_type: str = ""
    cooling_type: str = ""
    foundation_type: str = ""      # "full_basement", "crawlspace", "slab", ""

    # Property value (from assessor)
    total_value: float = 0.0       # Total assessed property value
    land_value: float = 0.0        # Appraised land value
    improvement_value: float = 0.0 # Appraised improvement value

    # Sale history
    last_sale_date: str = ""       # "YYYY-MM-DD"
    last_sale_price: float = 0.0

    # Google Solar API
    solar_roof_segments: list = field(default_factory=list)
    # Each: {"pitch_deg": float, "azimuth_deg": float, "area_m2": float}
    building_footprint_area_m2: float = 0.0
    solar_imagery_quality: str = ""  # "HIGH", "MEDIUM", "LOW"

    # Building footprint polygon (from OSM or Microsoft)
    footprint_polygon: list = field(default_factory=list)
    # List of [lng, lat] coordinate pairs
    footprint_height_m: float = 0.0

    # Provenance tracking
    sources: dict = field(default_factory=dict)
    # key → source name, e.g. {"year_built": "co_gis", "roof_segments": "google_solar"}
    warnings: list = field(default_factory=list)


# ── API Key Loader ──────────────────────────────────────────────────────────
def _load_api_keys() -> dict:
    """Load API keys from env vars first, then config/api_keys.json."""
    keys = {"google_api_key": "", "attom_api_key": "", "anthropic_api_key": "", "rapidapi_key": ""}

    # Env vars take priority
    keys["google_api_key"] = os.environ.get("GOOGLE_API_KEY", "")
    keys["attom_api_key"] = os.environ.get("ATTOM_API_KEY", "")
    keys["anthropic_api_key"] = os.environ.get("ANTHROPIC_API_KEY", "")
    keys["rapidapi_key"] = os.environ.get("RAPIDAPI_KEY", "")

    # Fall back to JSON file
    try:
        with open(_API_KEYS_FILE) as f:
            file_keys = json.load(f)
        for k in keys:
            if not keys[k]:
                keys[k] = file_keys.get(k, "")
    except (FileNotFoundError, json.JSONDecodeError):
        pass

    return keys


# ── 1. Geocoding ────────────────────────────────────────────────────────────
def geocode_address(address: str, google_api_key: str = "") -> tuple[float, float, str]:
    """
    Geocode an address → (lat, lng, source).
    Tries Google Geocoding first, then US Census, then Nominatim (OSM).
    """
    # Try Google Geocoding API
    if google_api_key:
        try:
            resp = requests.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={"address": address, "key": google_api_key},
                timeout=_TIMEOUT,
            )
            data = resp.json()
            if data.get("status") == "OK" and data.get("results"):
                loc = data["results"][0]["geometry"]["location"]
                return loc["lat"], loc["lng"], "google_geocoding"
        except Exception as e:
            pass  # Fall through to Census

    # Fallback 1: US Census Geocoder (free, no key)
    try:
        resp = requests.get(
            "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
            params={
                "address": address,
                "benchmark": "Public_AR_Current",
                "format": "json",
            },
            timeout=_TIMEOUT,
        )
        data = resp.json()
        matches = data.get("result", {}).get("addressMatches", [])
        if matches:
            coords = matches[0]["coordinates"]
            return coords["y"], coords["x"], "us_census"
    except Exception:
        pass

    # Fallback 2: Nominatim / OpenStreetMap (free, no key, 1 req/sec policy)
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": address,
                "format": "json",
                "limit": 1,
                "countrycodes": "us",
            },
            headers={"User-Agent": "TakeoffEstimator/1.0 (construction-estimating)"},
            timeout=_TIMEOUT,
        )
        data = resp.json()
        if data and len(data) > 0:
            return float(data[0]["lat"]), float(data[0]["lon"]), "nominatim"
    except Exception:
        pass

    raise LookupError(
        f"Could not geocode address: {address}\n"
        "Ensure the address is complete (street, city, state, zip)."
    )


# ── 2. Google Solar API ────────────────────────────────────────────────────
def lookup_solar_insights(lat: float, lng: float, google_api_key: str) -> dict:
    """
    Query Google Solar API for building insights (roof segments, footprint).
    Returns dict with keys: roof_segments, footprint_area_m2, imagery_quality.
    Returns empty dict if unavailable.
    """
    if not google_api_key:
        return {}

    try:
        resp = requests.get(
            "https://solar.googleapis.com/v1/buildingInsights:findClosest",
            params={
                "location.latitude": lat,
                "location.longitude": lng,
                "requiredQuality": "LOW",  # Accept any quality level
                "key": google_api_key,
            },
            timeout=_TIMEOUT,
        )
        if resp.status_code != 200:
            return {}

        data = resp.json()
        result = {
            "roof_segments": [],
            "footprint_area_m2": 0.0,
            "imagery_quality": data.get("imageryQuality", ""),
        }

        # Extract roof segment stats
        solar_potential = data.get("solarPotential", {})
        for seg in solar_potential.get("roofSegmentStats", []):
            stats = seg.get("stats", {})
            result["roof_segments"].append({
                "pitch_deg": seg.get("pitchDegrees", 0),
                "azimuth_deg": seg.get("azimuthDegrees", 0),
                "area_m2": stats.get("areaMeters2", 0),
            })

        # Whole-roof area (fallback to sum of segments if wholeRoofStats is 0)
        whole_roof = solar_potential.get("wholeRoofStats", {}).get("stats", {})
        footprint_area = whole_roof.get("areaMeters2", 0)
        if footprint_area <= 0 and result["roof_segments"]:
            # Sum segment areas as fallback
            footprint_area = sum(s["area_m2"] for s in result["roof_segments"])
        result["footprint_area_m2"] = footprint_area

        return result

    except Exception:
        return {}


# ── 3. Building Footprint (OSM Overpass) ────────────────────────────────────
def lookup_building_footprint(lat: float, lng: float) -> dict:
    """
    Query OpenStreetMap Overpass API for the building footprint polygon
    nearest to the given coordinates.
    Returns dict with keys: polygon (list of [lng, lat]), height_m.
    Returns empty dict if not found.
    """
    # Search within 30m radius
    query = f"""
    [out:json][timeout:10];
    (
      way["building"](around:30,{lat},{lng});
      relation["building"](around:30,{lat},{lng});
    );
    out body;
    >;
    out skel qt;
    """

    try:
        resp = requests.post(
            "https://overpass-api.de/api/interpreter",
            data={"data": query},
            timeout=_TIMEOUT,
        )
        if resp.status_code != 200:
            return {}

        data = resp.json()
        elements = data.get("elements", [])

        # Build node lookup
        nodes = {}
        for el in elements:
            if el["type"] == "node":
                nodes[el["id"]] = (el["lon"], el["lat"])

        # Find the first way with building tag
        for el in elements:
            if el["type"] == "way" and "building" in el.get("tags", {}):
                polygon = []
                for nd_id in el.get("nodes", []):
                    if nd_id in nodes:
                        polygon.append(list(nodes[nd_id]))

                height_m = 0.0
                tags = el.get("tags", {})
                if "height" in tags:
                    try:
                        height_m = float(tags["height"].replace("m", "").strip())
                    except ValueError:
                        pass
                elif "building:levels" in tags:
                    try:
                        height_m = float(tags["building:levels"]) * 3.0  # ~3m per story
                    except ValueError:
                        pass

                if polygon:
                    return {"polygon": polygon, "height_m": height_m}

        return {}

    except Exception:
        return {}


# ── 4. Colorado Geospatial Portal (Assessor Data) ──────────────────────────
def lookup_co_property_details(address: str, lat: float = 0, lng: float = 0) -> dict:
    """
    Query Colorado's public parcel data via ArcGIS REST services.
    Returns dict with assessor fields or empty dict if not found.

    This queries the Denver county assessor data first (most common use case),
    then falls back to the statewide parcels layer.
    """
    result = {}

    # Try Denver Open Data first (more detailed for Denver addresses)
    result = _query_denver_assessor(address, lat, lng)
    if result:
        return result

    # Fallback: Colorado statewide parcels
    result = _query_co_statewide_parcels(lat, lng)
    return result


def _parse_denver_address(address: str) -> tuple[str, str, str]:
    """
    Parse a street address into (number, direction, street_name) for Denver GIS.
    Example: "1927 N Meade St, Denver, CO 80204" → ("1927", "N", "MEADE")
    """
    import re
    # Take only the street line (before first comma)
    street = address.split(",")[0].strip().upper()

    # Match: number [direction] street_name [suffix]
    m = re.match(r"(\d+)\s+([NSEW]\.?\s+)?(.+)", street)
    if not m:
        return "", "", ""

    number = m.group(1)
    direction = (m.group(2) or "").strip().replace(".", "")
    street_rest = m.group(3).strip()

    # Remove common suffixes (ST, AVE, BLVD, DR, CT, PL, WAY, CIR, LN, RD)
    street_name = re.sub(
        r"\s+(ST|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|CT|COURT|PL|PLACE|WAY|CIR|CIRCLE|LN|LANE|RD|ROAD|PKWY|PARKWAY)\.?$",
        "", street_rest
    ).strip()

    return number, direction, street_name


def _query_denver_assessor(address: str, lat: float, lng: float) -> dict:
    """
    Query Denver's residential characteristics table via ArcGIS REST API.

    Uses the ODC_real_property_residential_characteristics table (table index 59).
    This is a non-spatial table — queried by address components (SITE_NBR, SITE_DIR, SITE_NAME).

    Fields available:
        CCYRBLT (year built), AREA_ABG (above-grade SF), BSMT_AREA, FBSMT_SQFT,
        GRD_AREA (ground floor), STORY, STYLE_CN, BED_RMS, FULL_B, HLF_B,
        LAND_SQFT, TOTAL_VALUE
    """
    number, direction, street_name = _parse_denver_address(address)
    if not number or not street_name:
        return {}

    try:
        url = (
            "https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/"
            "ODC_real_property_residential_characteristics/FeatureServer/59/query"
        )

        # Build WHERE clause — direction may or may not be present
        if direction:
            where = f"SITE_NBR='{number}' AND SITE_DIR='{direction}' AND SITE_NAME='{street_name}'"
        else:
            where = f"SITE_NBR='{number}' AND SITE_NAME='{street_name}'"

        params = {
            "where": where,
            "outFields": (
                "PARID,SITE_NBR,SITE_DIR,SITE_NAME,SITE_MODE,"
                "CCYRBLT,AREA_ABG,BSMT_AREA,FBSMT_SQFT,GRD_AREA,"
                "STORY,STYLE_CN,BED_RMS,FULL_B,HLF_B,LAND_SQFT,"
                "TOTAL_VALUE,ASMT_APPR_LAND,ASMT_APPR_IMPR,D_CLASS_CN"
            ),
            "returnGeometry": "false",
            "f": "json",
            "resultRecordCount": 5,
        }

        resp = requests.get(url, params=params, timeout=_TIMEOUT)
        if resp.status_code != 200:
            return {}

        data = resp.json()
        features = data.get("features", [])
        if not features:
            # Try without direction
            if direction:
                params["where"] = f"SITE_NBR='{number}' AND SITE_NAME='{street_name}'"
                resp = requests.get(url, params=params, timeout=_TIMEOUT)
                data = resp.json()
                features = data.get("features", [])
            if not features:
                return {}

        # Take the first match
        attrs = features[0].get("attributes", {})
        return _parse_denver_assessor(attrs)

    except Exception:
        return {}


def _parse_denver_assessor(attrs: dict) -> dict:
    """Parse Denver residential characteristics attributes into our standard format."""
    result = {}

    # Year built
    if attrs.get("CCYRBLT"):
        try:
            result["year_built"] = int(attrs["CCYRBLT"])
        except (ValueError, TypeError):
            pass

    # Above-grade area (total finished SF above grade)
    if attrs.get("AREA_ABG"):
        try:
            result["total_sqft"] = float(attrs["AREA_ABG"])
        except (ValueError, TypeError):
            pass

    # Ground floor area
    if attrs.get("GRD_AREA"):
        try:
            result["ground_floor_sqft"] = float(attrs["GRD_AREA"])
        except (ValueError, TypeError):
            pass

    # Stories — parse from STORY field or STYLE_CN
    if attrs.get("STORY"):
        try:
            result["stories"] = max(1, int(float(attrs["STORY"])))
        except (ValueError, TypeError):
            pass
    if "stories" not in result and attrs.get("STYLE_CN"):
        style = str(attrs["STYLE_CN"]).upper()
        if "2 STORY" in style or "TWO" in style:
            result["stories"] = 2
        elif "3 STORY" in style or "THREE" in style or "TRI" in style:
            result["stories"] = 3
        elif "BI-LEVEL" in style or "SPLIT" in style:
            result["stories"] = 2
        elif "1 STORY" in style or "RANCH" in style or "BUNGALOW" in style:
            result["stories"] = 1

    # Style
    if attrs.get("STYLE_CN"):
        result["style"] = str(attrs["STYLE_CN"])

    # Bedrooms
    if attrs.get("BED_RMS"):
        try:
            result["bedrooms"] = int(attrs["BED_RMS"])
        except (ValueError, TypeError):
            pass

    # Bathrooms (full + half)
    full_b = 0
    hlf_b = 0
    if attrs.get("FULL_B"):
        try:
            full_b = int(attrs["FULL_B"])
        except (ValueError, TypeError):
            pass
    if attrs.get("HLF_B"):
        try:
            hlf_b = int(attrs["HLF_B"])
        except (ValueError, TypeError):
            pass
    if full_b or hlf_b:
        result["bathrooms"] = full_b + hlf_b * 0.5

    # Lot size
    if attrs.get("LAND_SQFT"):
        try:
            result["lot_sqft"] = float(attrs["LAND_SQFT"])
        except (ValueError, TypeError):
            pass

    # Basement — infer from BSMT_AREA or FBSMT_SQFT
    bsmt_area = 0
    fbsmt = 0
    if attrs.get("BSMT_AREA"):
        try:
            bsmt_area = float(attrs["BSMT_AREA"])
        except (ValueError, TypeError):
            pass
    if attrs.get("FBSMT_SQFT"):
        try:
            fbsmt = float(attrs["FBSMT_SQFT"])
        except (ValueError, TypeError):
            pass

    if bsmt_area > 0:
        if fbsmt > 0 and fbsmt >= bsmt_area * 0.5:
            result["basement"] = "full"
        elif fbsmt > 0:
            result["basement"] = "partial"
        else:
            result["basement"] = "full"  # has basement area but no finished area
        result["basement_sqft"] = bsmt_area
        result["foundation_type"] = "full_basement"
    else:
        result["basement"] = "none"
        result["foundation_type"] = "unknown"  # could be slab or crawlspace — needs heuristic

    # Property value
    for field_name, result_key in [
        ("TOTAL_VALUE", "total_value"),
        ("ASMT_APPR_LAND", "land_value"),
        ("ASMT_APPR_IMPR", "improvement_value"),
    ]:
        if attrs.get(field_name):
            try:
                result[result_key] = float(attrs[field_name])
            except (ValueError, TypeError):
                pass

    return result


def _query_co_statewide_parcels(lat: float, lng: float) -> dict:
    """Query Colorado statewide parcels layer as fallback."""
    if not lat or not lng:
        return {}

    try:
        url = (
            "https://services.arcgis.com/YseQBnl2jq0lrUV5/arcgis/rest/services/"
            "Colorado_Public_Parcels/FeatureServer/0/query"
        )
        params = {
            "geometry": f"{lng},{lat}",
            "geometryType": "esriGeometryPoint",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "*",
            "returnGeometry": "false",
            "f": "json",
            "inSR": "4326",
        }
        resp = requests.get(url, params=params, timeout=_TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            features = data.get("features", [])
            if features:
                attrs = features[0].get("attributes", {})
                result = {}
                # Statewide parcel fields are less standardized
                for k, v in attrs.items():
                    k_up = k.upper()
                    if "YEAR" in k_up and "BUILT" in k_up and v:
                        try:
                            result["year_built"] = int(v)
                        except (ValueError, TypeError):
                            pass
                    elif "SQFT" in k_up and "BLDG" in k_up and v:
                        try:
                            result["total_sqft"] = float(v)
                        except (ValueError, TypeError):
                            pass
                return result

        return {}

    except Exception:
        return {}


# ── ATTOM Stub (future) ────────────────────────────────────────────────────
# ── 5. RapidAPI Property Lookup (National Fallback) ────────────────────────
def _lookup_rapidapi_property(
    address: str, lat: float, lng: float, rapidapi_key: str
) -> dict:
    """
    Query RapidAPI 'Realty in US' (apidojo) for property details + sale history.
    Two-step: auto-complete address → get property detail.
    Returns dict with standard property fields.
    """
    if not rapidapi_key:
        return {}

    _HEADERS = {
        "X-RapidAPI-Key": rapidapi_key,
        "X-RapidAPI-Host": "realty-in-us.p.rapidapi.com",
    }

    try:
        # Step 1: Search for property by address to get property_id
        print(f"    → Searching Realty-in-US for: {address}")
        search_resp = requests.get(
            "https://realty-in-us.p.rapidapi.com/locations/v2/auto-complete",
            params={"input": address, "limit": "1"},
            headers=_HEADERS,
            timeout=_TIMEOUT,
        )
        if search_resp.status_code != 200:
            print(f"    ✗ Address search failed: HTTP {search_resp.status_code}")
            return {}

        search_data = search_resp.json()
        autocomplete = search_data.get("autocomplete", [])
        if not autocomplete:
            print("    ✗ No address matches found")
            return {}

        # Extract property_id from first match
        first_match = autocomplete[0]
        mpr_id = first_match.get("mpr_id", "")
        if not mpr_id:
            print(f"    ✗ No mpr_id in match: {first_match.get('full_address', ['?'])}")
            return {}

        print(f"    → Found property ID: {mpr_id}")

        # Step 2: Get property detail
        detail_resp = requests.get(
            "https://realty-in-us.p.rapidapi.com/properties/v3/detail",
            params={"property_id": mpr_id},
            headers=_HEADERS,
            timeout=_TIMEOUT,
        )
        if detail_resp.status_code != 200:
            print(f"    ✗ Property detail failed: HTTP {detail_resp.status_code}")
            return {}

        detail_data = detail_resp.json()

        # Navigate to property data — typically under data.home
        prop = detail_data
        if isinstance(prop, dict):
            for key in ("data", "home", "property"):
                if key in prop and isinstance(prop[key], dict):
                    prop = prop[key]
            # data.home is the common nesting
            if "home" in prop and isinstance(prop["home"], dict):
                prop = prop["home"]

        result = {}

        # ── Basic fields ──────────────────────────────────────────────
        desc = prop.get("description", {}) or {}
        result["year_built"] = _safe_int(desc.get("year_built") or prop.get("year_built"))
        result["total_sqft"] = _safe_float(desc.get("sqft") or desc.get("lot_sqft") or prop.get("sqft"))
        result["bedrooms"] = _safe_int(desc.get("beds") or prop.get("beds"))
        result["bathrooms"] = _safe_float(desc.get("baths") or prop.get("baths"))
        result["stories"] = _safe_int(desc.get("stories") or prop.get("stories"))
        result["lot_sqft"] = _safe_float(desc.get("lot_sqft") or prop.get("lot_sqft"))

        # Garage
        garage_val = desc.get("garage") or prop.get("garage")
        if garage_val:
            result["garage"] = str(garage_val)

        # ── Roof ──────────────────────────────────────────────────────
        roof_val = desc.get("roof") or prop.get("roof")
        if roof_val and isinstance(roof_val, str):
            result["roof_material"] = roof_val.strip().lower().replace(" ", "_")
        elif roof_val and isinstance(roof_val, dict):
            if roof_val.get("material"):
                result["roof_material"] = str(roof_val["material"]).strip().lower().replace(" ", "_")
            if roof_val.get("type"):
                result["roof_type"] = str(roof_val["type"]).strip().lower().replace(" ", "_")

        # ── Foundation / Basement ─────────────────────────────────────
        basement_val = desc.get("basement") or prop.get("basement")
        if basement_val and isinstance(basement_val, str) and basement_val.lower() not in ("none", "no"):
            result["basement"] = basement_val.strip().lower()
        foundation_val = desc.get("foundation") or prop.get("foundation")
        if foundation_val:
            result["foundation_type"] = str(foundation_val).strip().lower()

        # ── Sale history ──────────────────────────────────────────────
        # Check property_history for most recent sale
        history = prop.get("property_history", []) or []
        for event in history:
            if not isinstance(event, dict):
                continue
            event_name = (event.get("event_name") or "").lower()
            if "sold" in event_name or "closed" in event_name:
                date_val = event.get("date")
                price_val = event.get("price")
                if date_val:
                    result["last_sale_date"] = str(date_val)
                if price_val:
                    result["last_sale_price"] = _safe_float(price_val)
                break  # most recent sale found

        # Fallback: check top-level sold fields
        if not result.get("last_sale_price"):
            for pkey in ("last_sold_price", "sold_price", "list_price"):
                v = prop.get(pkey)
                if v:
                    result["last_sale_price"] = _safe_float(v)
                    if result["last_sale_price"]:
                        break
        if not result.get("last_sale_date"):
            for dkey in ("last_sold_date", "sold_date", "last_update_date"):
                v = prop.get(dkey)
                if v:
                    result["last_sale_date"] = str(v)
                    break

        # ── Assessed value ────────────────────────────────────────────
        tax_record = prop.get("tax_history", [])
        if isinstance(tax_record, list) and tax_record:
            latest_tax = tax_record[0]
            if isinstance(latest_tax, dict):
                assessed = latest_tax.get("assessment", {}) or {}
                total_val = assessed.get("total") or assessed.get("building")
                if total_val:
                    result["total_value"] = _safe_float(total_val)
                land_val = assessed.get("land")
                if land_val:
                    result["land_value"] = _safe_float(land_val)
                improvement_val = assessed.get("building")
                if improvement_val:
                    result["improvement_value"] = _safe_float(improvement_val)

        # Remove None/0 values
        result = {k: v for k, v in result.items() if v}

        return result

    except Exception as e:
        print(f"    ✗ RapidAPI lookup failed: {e}")
        return {}


def _safe_int(val) -> int:
    """Convert to int, return 0 on failure."""
    if val is None:
        return 0
    try:
        return int(val)
    except (ValueError, TypeError):
        return 0


def _safe_float(val) -> float:
    """Convert to float, return 0.0 on failure."""
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def lookup_attom_property(address: str, api_key: str) -> dict:
    """
    Query ATTOM Data API for comprehensive property details.
    NOT WIRED UP — stub for future integration ($95/mo).

    Endpoint: https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/detail
    Returns: year_built, beds, baths, stories, sqft, basement, roof_type,
             construction_type, exterior_wall_material, garage, heating, cooling.
    """
    if not api_key:
        return {}

    # Future implementation:
    # headers = {"apikey": api_key, "Accept": "application/json"}
    # params = {"address1": street, "address2": city_state_zip}
    # resp = requests.get(url, headers=headers, params=params, timeout=_TIMEOUT)
    # ... parse response ...

    return {}


# ── Master Orchestrator ────────────────────────────────────────────────────
def lookup_property(address: str) -> PropertyData:
    """
    Master lookup: takes a street address, calls all available APIs,
    merges results into a unified PropertyData.

    Degrades gracefully when APIs are unavailable:
      Full:    Google Geocoding + Solar + OSM + CO GIS
      Partial: Census Geocoder + Solar (no property details)
      Minimal: Census Geocoder only (all heuristic)
    """
    keys = _load_api_keys()
    prop = PropertyData(address=address)

    # ── Step 1: Geocode ─────────────────────────────────────────────────
    print(f"  Geocoding: {address}")
    try:
        prop.lat, prop.lng, geo_source = geocode_address(
            address, keys["google_api_key"]
        )
        prop.sources["geocode"] = geo_source
        print(f"    → {prop.lat:.6f}, {prop.lng:.6f} (via {geo_source})")
    except LookupError as e:
        prop.warnings.append(str(e))
        print(f"    ✗ Geocoding failed: {e}")
        return prop  # Can't proceed without coordinates

    # ── Step 2: Google Solar API ────────────────────────────────────────
    print("  Querying Google Solar API...")
    solar = lookup_solar_insights(prop.lat, prop.lng, keys["google_api_key"])
    if solar:
        prop.solar_roof_segments = solar.get("roof_segments", [])
        prop.building_footprint_area_m2 = solar.get("footprint_area_m2", 0)
        prop.solar_imagery_quality = solar.get("imagery_quality", "")
        prop.sources["roof_geometry"] = "google_solar"
        n_segs = len(prop.solar_roof_segments)
        print(f"    → {n_segs} roof segments, {prop.building_footprint_area_m2:.0f} m² footprint")
    else:
        prop.warnings.append("Google Solar API unavailable — roof geometry will be estimated from era defaults.")
        prop.sources["roof_geometry"] = "estimated"
        print("    ✗ No Solar data (API key missing or building not found)")

    # ── Step 3: Building Footprint (OSM) ────────────────────────────────
    print("  Querying OpenStreetMap for building footprint...")
    time.sleep(0.5)  # Be polite to Overpass API
    footprint = lookup_building_footprint(prop.lat, prop.lng)
    if footprint:
        prop.footprint_polygon = footprint.get("polygon", [])
        prop.footprint_height_m = footprint.get("height_m", 0)
        if "roof_geometry" not in prop.sources or prop.sources["roof_geometry"] == "estimated":
            prop.sources["footprint"] = "osm_overpass"
        else:
            prop.sources["footprint"] = "osm_overpass"
        n_pts = len(prop.footprint_polygon)
        print(f"    → Polygon with {n_pts} vertices, height={prop.footprint_height_m:.1f}m")
    else:
        prop.warnings.append("OSM building footprint not found — envelope will be estimated from SF and stories.")
        prop.sources["footprint"] = "estimated"
        print("    ✗ No OSM footprint found")

    # ── Step 4: Property Details (CO GIS) ───────────────────────────────
    print("  Querying Colorado assessor data...")
    co_data = lookup_co_property_details(address, prop.lat, prop.lng)
    if co_data:
        if co_data.get("year_built"):
            prop.year_built = co_data["year_built"]
            prop.sources["year_built"] = "co_gis"
        if co_data.get("total_sqft"):
            prop.total_sqft = co_data["total_sqft"]
            prop.sources["total_sqft"] = "co_gis"
        if co_data.get("stories"):
            prop.stories = co_data["stories"]
            prop.sources["stories"] = "co_gis"
        if co_data.get("bedrooms"):
            prop.bedrooms = co_data["bedrooms"]
            prop.sources["bedrooms"] = "co_gis"
        if co_data.get("bathrooms"):
            prop.bathrooms = co_data["bathrooms"]
            prop.sources["bathrooms"] = "co_gis"
        if co_data.get("basement"):
            prop.basement = co_data["basement"]
            prop.sources["basement"] = "co_gis"
        if co_data.get("garage"):
            prop.garage = co_data["garage"]
            prop.sources["garage"] = "co_gis"
        if co_data.get("lot_sqft"):
            prop.lot_sqft = co_data["lot_sqft"]
            prop.sources["lot_sqft"] = "co_gis"
        if co_data.get("basement_sqft"):
            prop.basement_sqft = co_data["basement_sqft"]
        if co_data.get("foundation_type"):
            prop.foundation_type = co_data["foundation_type"]
            prop.sources["foundation_type"] = "co_gis"
        if co_data.get("total_value"):
            prop.total_value = co_data["total_value"]
            prop.sources["total_value"] = "co_gis"
        if co_data.get("land_value"):
            prop.land_value = co_data["land_value"]
        if co_data.get("improvement_value"):
            prop.improvement_value = co_data["improvement_value"]

        found = [k for k in co_data if co_data[k]]
        print(f"    → Found: {', '.join(found)}")
    else:
        prop.warnings.append("Colorado GIS data not available — using era-based heuristics for all property details.")
        print("    ✗ No CO GIS data found")

    # ── Step 4b: RapidAPI National Fallback ─────────────────────────────
    # If CO GIS returned mostly empty data, try RapidAPI for national coverage
    _core_fields = [prop.year_built, prop.total_sqft, prop.bedrooms, prop.bathrooms]
    _has_property_data = sum(1 for v in _core_fields if v) >= 2
    if not _has_property_data and keys.get("rapidapi_key"):
        print("  Querying RapidAPI for property details (national fallback)...")
        rapid_data = _lookup_rapidapi_property(
            address, prop.lat, prop.lng, keys["rapidapi_key"]
        )
        if rapid_data:
            for field_name in [
                "year_built", "total_sqft", "stories", "bedrooms", "bathrooms",
                "lot_sqft", "basement", "garage", "foundation_type",
                "roof_type", "roof_material", "total_value", "land_value",
                "improvement_value",
            ]:
                val = rapid_data.get(field_name)
                if val and not getattr(prop, field_name, None):
                    setattr(prop, field_name, val)
                    prop.sources[field_name] = "rapidapi"
            # Sale history (always from RapidAPI if available)
            if rapid_data.get("last_sale_date"):
                prop.last_sale_date = rapid_data["last_sale_date"]
                prop.sources["last_sale"] = "rapidapi"
            if rapid_data.get("last_sale_price"):
                prop.last_sale_price = rapid_data["last_sale_price"]
            found = [k for k in rapid_data if rapid_data[k]]
            print(f"    → Found: {', '.join(found)}")
        else:
            print("    ✗ No RapidAPI data found")
    elif not _has_property_data:
        prop.warnings.append("No property data API available — using era-based heuristics.")

    # Also try RapidAPI just for sale history even if CO GIS had property data
    if not prop.last_sale_date and keys.get("rapidapi_key") and _has_property_data:
        print("  Querying RapidAPI for sale history...")
        rapid_data = _lookup_rapidapi_property(
            address, prop.lat, prop.lng, keys["rapidapi_key"]
        )
        if rapid_data.get("last_sale_date"):
            prop.last_sale_date = rapid_data["last_sale_date"]
            prop.last_sale_price = rapid_data.get("last_sale_price", 0)
            prop.sources["last_sale"] = "rapidapi"
            print(f"    → Last sale: {prop.last_sale_date} for ${prop.last_sale_price:,.0f}")
        else:
            print("    ✗ No sale history found")

    # ── Summary ─────────────────────────────────────────────────────────
    print("\n  Property Data Summary:")
    print(f"    Address:     {prop.address}")
    print(f"    Location:    {prop.lat:.6f}, {prop.lng:.6f}")
    print(f"    Year Built:  {prop.year_built or 'unknown'}")
    print(f"    Total SF:    {prop.total_sqft or 'unknown'}")
    print(f"    Stories:     {prop.stories}")
    print(f"    Beds/Baths:  {prop.bedrooms}/{prop.bathrooms}")
    print(f"    Basement:    {prop.basement or 'unknown'}")
    print(f"    Foundation:  {prop.foundation_type or 'unknown'}")
    print(f"    Garage:      {prop.garage or 'unknown'}")
    if prop.total_value:
        print(f"    Value:       ${prop.total_value:,.0f}")
    print(f"    Roof segs:   {len(prop.solar_roof_segments)}")
    print(f"    Footprint:   {'polygon' if prop.footprint_polygon else 'none'}")
    print(f"    Sources:     {prop.sources}")
    if prop.warnings:
        print(f"    Warnings:    {len(prop.warnings)}")
        for w in prop.warnings:
            print(f"      - {w}")

    return prop


# ── Property Images ────────────────────────────────────────────────────────
def classify_roof_material(satellite_image_path: str, anthropic_api_key: str = "") -> dict:
    """
    Analyze a satellite/aerial image to identify the roof material.

    Uses Claude's vision API to classify the roof from above. Returns a dict:
      {
        "material": "asphalt_shingle",    # normalized material key
        "confidence": "high",             # high / medium / low
        "description": "Dark gray asphalt shingles with visible tab lines",
        "color": "dark_gray",
        "condition": "good",              # good / fair / poor / unknown
        "source": "claude_vision"
      }

    Falls back to empty dict if no API key or analysis fails.
    """
    if not anthropic_api_key or not satellite_image_path:
        return {}

    if not os.path.exists(satellite_image_path):
        return {}

    try:
        import anthropic
        import base64

        # Read image and encode as base64
        with open(satellite_image_path, "rb") as f:
            raw_bytes = f.read()
        image_data = base64.standard_b64encode(raw_bytes).decode("utf-8")

        # Detect actual media type from file magic bytes (not extension)
        if raw_bytes[:8] == b'\x89PNG\r\n\x1a\n':
            media_type = "image/png"
        elif raw_bytes[:2] == b'\xff\xd8':
            media_type = "image/jpeg"
        elif raw_bytes[:4] == b'RIFF' and raw_bytes[8:12] == b'WEBP':
            media_type = "image/webp"
        elif raw_bytes[:3] == b'GIF':
            media_type = "image/gif"
        else:
            media_type = "image/jpeg"  # fallback

        client = anthropic.Anthropic(api_key=anthropic_api_key)

        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "This is a satellite/aerial image of a residential property. "
                            "Analyze the ROOF ONLY. Respond with EXACTLY this JSON format, nothing else:\n"
                            "{\n"
                            '  "material": "<one of: asphalt_shingle, metal_standing_seam, metal_corrugated, '
                            'clay_tile, concrete_tile, wood_shake, slate, flat_membrane_tpo, flat_membrane_epdm, '
                            'composite, unknown>",\n'
                            '  "confidence": "<high, medium, or low>",\n'
                            '  "description": "<1-2 sentence description of what you see>",\n'
                            '  "color": "<dominant roof color>",\n'
                            '  "condition": "<good, fair, poor, or unknown based on visible wear/damage>"\n'
                            "}"
                        ),
                    },
                ],
            }],
        )

        # Parse the JSON response
        response_text = message.content[0].text.strip()
        # Handle potential markdown code blocks
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()

        result = json.loads(response_text)
        result["source"] = "claude_vision"
        return result

    except Exception as e:
        print(f"    ✗ Roof classification failed: {e}")
        return {}


def fetch_property_images(
    lat: float, lng: float, address: str,
    google_api_key: str, output_dir: str,
) -> dict[str, str]:
    """
    Fetch street view and satellite images for a property.

    Returns dict with keys "street_view" and "satellite" → file paths (or "" on failure).
    """
    results = {"street_view": "", "satellite": ""}
    if not google_api_key or not lat or not lng:
        return results

    os.makedirs(output_dir, exist_ok=True)

    # Street View Static API
    try:
        url = (
            f"https://maps.googleapis.com/maps/api/streetview"
            f"?size=640x480&location={lat},{lng}&key={google_api_key}"
        )
        resp = requests.get(url, timeout=_TIMEOUT)
        if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image"):
            path = os.path.join(output_dir, "street_view.jpg")
            with open(path, "wb") as f:
                f.write(resp.content)
            results["street_view"] = path
    except Exception as e:
        print(f"    ✗ Street View fetch failed: {e}")

    # Maps Static API — satellite aerial view
    try:
        url = (
            f"https://maps.googleapis.com/maps/api/staticmap"
            f"?center={lat},{lng}&zoom=20&size=640x640"
            f"&maptype=satellite&key={google_api_key}"
        )
        resp = requests.get(url, timeout=_TIMEOUT)
        if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image"):
            path = os.path.join(output_dir, "satellite.jpg")
            with open(path, "wb") as f:
                f.write(resp.content)
            results["satellite"] = path
    except Exception as e:
        print(f"    ✗ Satellite image fetch failed: {e}")

    # Fallback: OpenStreetMap static tile if both Google images failed
    if not results["street_view"] and not results["satellite"]:
        try:
            import math
            zoom = 18
            n = 2 ** zoom
            x_tile = int((lng + 180.0) / 360.0 * n)
            lat_rad = math.radians(lat)
            y_tile = int((1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * n)
            url = f"https://tile.openstreetmap.org/{zoom}/{x_tile}/{y_tile}.png"
            resp = requests.get(
                url, timeout=_TIMEOUT,
                headers={"User-Agent": "TakeoffEstimator/1.0 (construction-estimating)"},
            )
            if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image"):
                path = os.path.join(output_dir, "osm_map.png")
                with open(path, "wb") as f:
                    f.write(resp.content)
                results["satellite"] = path
                print("    → Using OSM map tile as fallback image")
        except Exception as e:
            print(f"    ✗ OSM tile fallback failed: {e}")

    return results


# ── CLI test ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python property_lookup.py '<full address>'")
        print("Example: python property_lookup.py '1927 N Meade St, Denver, CO 80204'")
        sys.exit(1)

    addr = " ".join(sys.argv[1:])
    print(f"\nLooking up: {addr}\n")
    prop = lookup_property(addr)
    print("\nDone.")
