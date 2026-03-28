# Construction Era Defaults — Residential Heuristics

Reference guide for estimating existing-home construction details based on
year built. Used by `model_from_address.py` when no building plans are available.

Data is stored in `config/era_defaults.json`. This document explains the
reasoning behind each era's defaults.

---

## How Year Built Drives Estimates

The year a home was built determines:
1. **Building code in effect** → insulation R-values, air sealing requirements
2. **Common framing practices** → wall thickness, stud spacing
3. **Available materials** → window types, insulation products, siding
4. **Typical floor plans** → ceiling heights, room sizes, garage presence
5. **Foundation type** → slab, crawlspace, or basement (also climate-dependent)

When we have a year built from assessor data, we match it to an era and apply
those defaults. When year is unknown, we default to ~1975 (median of US housing stock).

---

## Era Breakdown

### Pre-War (before 1945)
- **Framing**: Balloon framing with 2x4 studs. True dimensional lumber.
- **Insulation**: None to minimal. Homes rely on thermal mass and coal/gas heat.
- **Walls**: Plaster and lath interior, wood clapboard exterior.
- **Windows**: Single-pane wood, often with storm windows added later.
- **Foundation**: Full basement with stone or poured concrete walls. No insulation.
- **Ceiling height**: 9-10 feet (generous for era).
- **Gotchas**: Knob-and-tube wiring (don't blow insulation over it without remediation).
  Lead paint on all surfaces. Asbestos in pipe insulation, plaster, and some floor tiles.
- **Typical upgrades needed**: Everything. Dense-pack cellulose in walls, blown attic
  insulation, window replacement, air sealing are all high-ROI.

### Post-War / Early Ranch (1946–1959)
- **Framing**: Platform framing replacing balloon framing. 2x4 @ 16" OC.
- **Insulation**: R-7 fiberglass batt in walls (if any). R-11 attic batts.
- **Walls**: Drywall replacing plaster. 1/2" standard becoming norm.
- **Windows**: Single-pane aluminum sliders and awnings.
- **Foundation**: Slab-on-grade in warmer climates, basements in cold climates.
- **Ceiling height**: 8 feet (low, economical).
- **Gotchas**: Asbestos-containing materials in siding (transite), floor tiles (9x9"),
  pipe insulation, and some joint compounds. Test before disturbing.
- **Typical upgrades**: Attic insulation top-up, wall insulation retrofit,
  window replacement, rim joist sealing.

### Mid-Century (1960–1969)
- **Framing**: 2x4 @ 16" OC. Split-levels and bi-levels popular in Denver.
- **Insulation**: R-9 batt in walls. R-13 in attic.
- **Walls**: 1/2" drywall standard. Paneling common in basements/dens.
- **Windows**: Single-pane aluminum, larger openings trending.
- **Foundation**: Full basements standard in Denver/Zone 5. 7' ceilings.
- **Ceiling height**: 8 feet.
- **Gotchas**: Asbestos still widely used. Vermiculite attic insulation (Zonolite)
  may contain asbestos — test before disturbing. 1-car garages.
- **Typical upgrades**: Significant insulation improvements possible.
  Dense-pack cellulose in walls, blown attic to R-49+.

### Early Energy Crisis (1970–1979)
- **Framing**: 2x4 @ 16" OC. First energy codes emerging.
- **Insulation**: R-11 batt in walls. R-19 blown in attic. First real insulation focus.
- **Walls**: 1/2" drywall. Double-pane aluminum windows becoming standard.
- **Foundation**: Mix of crawlspace and basement depending on region.
- **Ceiling height**: 8 feet.
- **Key change**: 1973 oil embargo drove first insulation requirements. HUD Minimum
  Property Standards set R-11 walls, R-19 ceiling. UFFI (urea formaldehyde foam
  insulation) used for retrofit jobs — banned in 1982 due to off-gassing.
- **Typical upgrades**: Attic top-up to R-49+, air sealing at rim joists and attic
  bypasses, window upgrades from aluminum to vinyl.

### Late Energy Crisis / Early Code (1980–1989)
- **Framing**: 2x4 @ 16" OC. Model Energy Code (MEC) adopted.
- **Insulation**: R-11 batt in walls, R-22 blown attic, R-7 basement walls.
- **Walls**: 1/2" drywall. Vinyl windows replacing aluminum.
- **Foundation**: Full basements in Zone 5+ with first insulation requirements.
- **Ceiling height**: 8 feet.
- **Key changes**: MEC 1983 raised requirements. Vapor barriers becoming common.
  Housewrap (Tyvek) introduced 1980. Fiberglass batts improving in quality.
- **Typical upgrades**: Attic top-up to R-49+, wall cavity fill (dense-pack),
  basement wall insulation, air sealing.

### Pre-IECC Modern (1990–1999)
- **Framing**: 2x4 @ 16" OC. Some 2x6 in cold climates.
- **Insulation**: R-13 batt in walls (full cavity fill). R-30 blown attic.
- **Walls**: 1/2" drywall. Tyvek housewrap standard. Low-E glass available.
- **Foundation**: Full basements with R-11 walls in Zone 5+.
- **Ceiling height**: 8-9 feet (9' becoming premium feature).
- **Key changes**: Homes getting much larger (average 2,000+ SF). McMansion era.
  R-13 walls standard nationally. Beginning of energy audit industry.
- **Typical upgrades**: Attic top-up to R-49+, exterior continuous insulation
  at re-siding, air sealing, window upgrades to Low-E.

### Early 2000s (2000–2005)
- **Framing**: 2x4 @ 16" OC.
- **Insulation**: R-13 walls, R-30 attic, R-11 basement. Low-E windows common.
- **Walls**: 1/2" drywall. Fiber cement siding gaining share.
- **Foundation**: Full basements with 9' walls in Zone 5+.
- **Ceiling height**: 9 feet standard in new construction.
- **Key changes**: IECC 2003 adopted in many jurisdictions. First blower-door
  awareness but not yet mandatory. Spray foam gaining adoption.

### Early IECC (2006–2011)
- **Framing**: 2x4 @ 16" OC.
- **Insulation**: R-13 walls, R-38 attic (significant jump). R-13 basement.
- **Key changes**: IECC 2006 and 2009 significantly raised attic requirements.
  Air sealing requirements introduced. Blower door testing beginning.
  R-38 attic standard for Zone 5. First continuous insulation options mentioned.

### Modern IECC 2012–2020
- **Framing**: 2x6 @ 16" OC for Zone 5+ (required for R-20 cavity).
- **Insulation**: R-20 walls (or R-13+5ci). R-49 attic. R-15 basement.
- **Key changes**: 2x6 exterior walls required in cold climates. Continuous
  insulation option gaining popularity. 3 ACH50 air sealing mandatory.
  Blower door testing mandatory. Spray foam common. ERV/HRV for tight homes.

### Current Code IECC 2021+ / Denver 2025
- **Framing**: 2x6 @ 16" OC.
- **Insulation**: R-20+5ci or R-13+10ci walls. R-60 attic. R-15 basement.
- **Key changes**: Denver 2025 amendments add ERI performance path. R-60 attic
  standard. Continuous insulation nearly universal. Triple-pane windows in
  premium builds. Flat roofs popular in Denver new construction.

---

## Climate Zone Adjustments

The era defaults assume a "generic" US home. Climate zone overrides adjust:

### Zone 1-3 (Hot)
- Foundation: slab-on-grade (no basement)
- Lower wall insulation R-values needed
- Cooling-dominated: radiant barriers in attic more valuable than extra insulation
- Mold-resistant drywall more important

### Zone 4 (Mixed)
- Foundation: crawlspace or slab
- Moderate insulation needs
- Both heating and cooling relevant

### Zone 5 (Cold — Denver, Salt Lake City, Boise)
- Foundation: full basement standard (36" frost depth)
- Higher insulation R-values needed
- Heating-dominated: wall and attic insulation are highest ROI
- Vapor retarder on warm side of wall

### Zone 6-7 (Very Cold)
- Foundation: full basement with deep frost line
- Maximum insulation requirements
- Triple-pane windows cost-effective
- Continuous insulation critical to prevent thermal bridging

---

## Using This Data

When `model_from_address.py` builds a `BuildingModel` for an existing home:

1. **Year built** → selects the matching era from `era_defaults.json`
2. **Climate zone** → applies zone overrides
3. **Era defaults** populate: wall framing, insulation type/R-value, window type/count,
   ceiling height, drywall type, foundation type, roof pitch/style
4. **Assessor data** (if available) overrides: stories, SF, beds/baths, basement, garage
5. **Footprint polygon** (if available) overrides: wall lengths, perimeter, footprint area
6. **Google Solar** (if available) overrides: roof segments, pitch, area

The resulting estimate clearly marks every assumption and its source in the
Notes section of the XLSX output.
