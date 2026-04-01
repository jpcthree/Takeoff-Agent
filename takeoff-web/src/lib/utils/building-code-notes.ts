/**
 * Generate building code notes from a BuildingModel for each trade.
 *
 * Pure function — no side effects, no API calls. Reads fields from the
 * BuildingModel JSON (as stored in the project store) and produces
 * trade-keyed note sections referencing relevant IRC / IECC codes.
 */

import type { NoteSection } from '@/lib/api/python-service';

// ---------------------------------------------------------------------------
// IECC Prescriptive R-Value Requirements by Climate Zone
// Source: 2021 IECC Residential Table R402.1.2 (simplified)
// ---------------------------------------------------------------------------

interface ClimateRequirements {
  wallCavity: string;
  wallContinuous: string;
  ceilingAttic: string;
  floor: string;
  basementWall: string;
  slabEdge: string;
  crawlspaceWall: string;
  rimJoist: string;
}

const IECC_REQUIREMENTS: Record<string, ClimateRequirements> = {
  '1': {
    wallCavity: 'R-13', wallContinuous: 'None required',
    ceilingAttic: 'R-30', floor: 'R-13',
    basementWall: 'R-0', slabEdge: 'R-0', crawlspaceWall: 'R-0', rimJoist: 'R-13',
  },
  '2': {
    wallCavity: 'R-13', wallContinuous: 'None required',
    ceilingAttic: 'R-38', floor: 'R-13',
    basementWall: 'R-0', slabEdge: 'R-0', crawlspaceWall: 'R-0', rimJoist: 'R-13',
  },
  '3': {
    wallCavity: 'R-20 or R-13+R-5ci', wallContinuous: 'R-5ci (if R-13 cavity)',
    ceilingAttic: 'R-38', floor: 'R-19',
    basementWall: 'R-5ci or R-13', slabEdge: 'R-0', crawlspaceWall: 'R-5ci or R-13', rimJoist: 'R-13',
  },
  '4': {
    wallCavity: 'R-20 or R-13+R-5ci', wallContinuous: 'R-5ci (if R-13 cavity)',
    ceilingAttic: 'R-49', floor: 'R-19',
    basementWall: 'R-10ci or R-13', slabEdge: 'R-10', crawlspaceWall: 'R-10ci or R-13', rimJoist: 'R-15',
  },
  '5': {
    wallCavity: 'R-20 or R-13+R-5ci', wallContinuous: 'R-5ci (if R-13 cavity)',
    ceilingAttic: 'R-49', floor: 'R-30',
    basementWall: 'R-15ci or R-19', slabEdge: 'R-10', crawlspaceWall: 'R-15ci or R-19', rimJoist: 'R-15',
  },
  '6': {
    wallCavity: 'R-20+R-5ci or R-13+R-10ci', wallContinuous: 'R-5ci min',
    ceilingAttic: 'R-49', floor: 'R-30',
    basementWall: 'R-15ci or R-19', slabEdge: 'R-10', crawlspaceWall: 'R-15ci or R-19', rimJoist: 'R-20',
  },
  '7': {
    wallCavity: 'R-20+R-5ci or R-13+R-10ci', wallContinuous: 'R-5ci min',
    ceilingAttic: 'R-49', floor: 'R-38',
    basementWall: 'R-15ci or R-19', slabEdge: 'R-10', crawlspaceWall: 'R-15ci or R-19', rimJoist: 'R-20',
  },
  '8': {
    wallCavity: 'R-20+R-5ci or R-13+R-10ci', wallContinuous: 'R-5ci min',
    ceilingAttic: 'R-49', floor: 'R-38',
    basementWall: 'R-15ci or R-19', slabEdge: 'R-10', crawlspaceWall: 'R-15ci or R-19', rimJoist: 'R-20',
  },
};

// ---------------------------------------------------------------------------
// Fenestration Requirements by Climate Zone
// Source: 2021 IECC Residential Table R402.1.2
// ---------------------------------------------------------------------------

interface FenestrationRequirements {
  uFactor: string;
  shgc: string;
}

const FENESTRATION_REQUIREMENTS: Record<string, FenestrationRequirements> = {
  '1': { uFactor: '0.50', shgc: '0.25' },
  '2': { uFactor: '0.40', shgc: '0.25' },
  '3': { uFactor: '0.30', shgc: '0.25' },
  '4': { uFactor: '0.30', shgc: '0.40' },
  '5': { uFactor: '0.30', shgc: 'NR' },
  '6': { uFactor: '0.30', shgc: 'NR' },
  '7': { uFactor: '0.30', shgc: 'NR' },
  '8': { uFactor: '0.30', shgc: 'NR' },
};

// ---------------------------------------------------------------------------
// Helper to safely read nested fields from the opaque BuildingModel dict
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function get(obj: Record<string, unknown>, path: string, fallback: any): any {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return fallback;
    current = (current as Record<string, unknown>)[part];
  }
  return current ?? fallback;
}

function getClimateZoneBase(zone: string): string {
  // "4A" → "4", "5" → "5"
  return zone.replace(/[A-Za-z]/g, '').trim() || '4';
}

// ---------------------------------------------------------------------------
// Per-Trade Note Generators
// ---------------------------------------------------------------------------

function insulationNotes(bm: Record<string, unknown>): NoteSection[] {
  const zone = get(bm, 'climate_zone', '');
  const edition = get(bm, 'iecc_code_edition', '2021');
  const zoneBase = getClimateZoneBase(zone || '4');
  const reqs = IECC_REQUIREMENTS[zoneBase] || IECC_REQUIREMENTS['4'];

  const title = `IECC ${edition} Prescriptive Requirements — Climate Zone ${zone || zoneBase} (Table R402.1.2)`;
  const lines: string[] = [];

  // Climate zone default warning
  if (!zone) {
    lines.push('⚠ Climate zone not specified on plans — defaulting to Zone 4 (2021 IECC). Verify with local jurisdiction.');
  }

  lines.push(
    `Exterior wall cavity: ${reqs.wallCavity}`,
    `Exterior wall continuous insulation: ${reqs.wallContinuous}`,
    `Ceiling / attic: ${reqs.ceilingAttic}`,
    `Floor over unconditioned space: ${reqs.floor}`,
  );

  const hasBasement = get(bm, 'basement_wall_insulation', false);
  const foundationType = get(bm, 'foundation.type', '');
  if (hasBasement || foundationType === 'basement') {
    lines.push(`Basement wall: ${reqs.basementWall}`);
  }

  const hasSlab = get(bm, 'slab_edge_insulation', false) || foundationType === 'slab';
  if (hasSlab && parseInt(zoneBase) >= 4) {
    lines.push(`Slab edge (heated slab): ${reqs.slabEdge}, depth per local amendment`);
  }

  const hasCrawl = get(bm, 'crawlspace_wall_insulation', false) || foundationType === 'crawlspace';
  if (hasCrawl) {
    lines.push(`Crawlspace wall: ${reqs.crawlspaceWall}`);
  }

  lines.push(`Rim joist: ${reqs.rimJoist}`);

  // Air barrier & leakage
  lines.push('Air barrier required at building thermal envelope (IECC R402.4)');
  const zoneNum = parseInt(zoneBase);
  if (zoneNum >= 3) {
    lines.push('Air leakage: max 3 ACH50 (IECC R402.4.1.2)');
  } else {
    lines.push('Air leakage: max 5 ACH50 (IECC R402.4.1.2)');
  }

  // Vapor retarder
  if (zoneNum >= 5) {
    lines.push('Class I or II vapor retarder required on warm side of insulation (IRC R702.7)');
  } else if (zoneNum === 4) {
    lines.push('Class I, II, or III vapor retarder required (IRC R702.7) — Class III only with vented cladding');
  }

  // Duct insulation
  if (zoneNum >= 4) {
    lines.push('Ducts in unconditioned spaces: R-8 supply, R-6 return (IECC R403.3.1)');
  } else {
    lines.push('Ducts in unconditioned spaces: R-6 minimum (IECC R403.3.1)');
  }

  // Fenestration
  const fenReqs = FENESTRATION_REQUIREMENTS[zoneBase];
  if (fenReqs) {
    lines.push(`Window U-factor: max ${fenReqs.uFactor} (IECC Table R402.1.2)`);
    if (fenReqs.shgc !== 'NR') {
      lines.push(`Window SHGC: max ${fenReqs.shgc} (IECC Table R402.1.2)`);
    }
  }

  return [{ title, lines }];
}

function drywallNotes(bm: Record<string, unknown>): NoteSection[] {
  const lines: string[] = [];

  // Check for garage walls
  const walls = get(bm, 'walls', []);
  const hasGarageWalls = walls.some((w: unknown) => {
    const wall = w as Record<string, unknown>;
    return wall.is_fire_rated === true || wall.drywall_type === 'fire_rated_5_8';
  });
  const rooms = get(bm, 'rooms', []);
  const hasGarage = rooms.some((r: unknown) => (r as Record<string, unknown>).is_garage === true);

  if (hasGarageWalls || hasGarage) {
    lines.push('Garage-to-dwelling separation: 1/2" gypsum board or 5/8" Type X required (IRC R302.6)');
    lines.push('Garage ceiling below habitable space: 5/8" Type X required (IRC R302.6)');
  }

  // Fire-rated assemblies
  const fireRatedWalls = walls.filter((w: unknown) => (w as Record<string, unknown>).is_fire_rated === true);
  if (fireRatedWalls.length > 0) {
    lines.push(`${fireRatedWalls.length} fire-rated wall assembly(ies) identified — verify UL design number for layer count and fastening`);
  }

  // Moisture-resistant areas
  const hasBathrooms = rooms.some((r: unknown) => (r as Record<string, unknown>).is_bathroom === true);
  if (hasBathrooms) {
    lines.push('Moisture-resistant gypsum board (green board) or cement board at wet areas (IRC R702.3.8)');
    lines.push('Cement board or equivalent required at tub/shower surrounds (IRC R702.4)');
  }

  // Finish levels & installation
  lines.push('GA-214 Finish Levels: Level 4 standard for painted surfaces, Level 5 for critical lighting');
  lines.push('Screw spacing: max 12" OC on ceilings, 16" OC on walls (GA-216)');
  lines.push('Control joints required at max 30 LF spans, all doorframes, and dissimilar substrates (GA-216)');

  if (lines.length === 0) {
    lines.push('Standard 1/2" gypsum board on all interior walls and ceilings (IRC R702.3)');
  }

  return [{ title: 'Drywall Code Requirements (IRC R702, GA-214/216)', lines }];
}

function roofingNotes(bm: Record<string, unknown>): NoteSection[] {
  const zone = get(bm, 'climate_zone', '');
  const zoneBase = parseInt(getClimateZoneBase(zone || '4'));
  const pitch = get(bm, 'roof.pitch', 0);
  const material = get(bm, 'roof.material', '');
  const lines: string[] = [];

  // Ice barrier
  if (zoneBase >= 4) {
    lines.push('Ice barrier (ice & water shield) required at eaves extending min 24" past interior wall line (IRC R905.1.2)');
  }
  if (zoneBase >= 6) {
    lines.push('Extended ice barrier coverage recommended for severe climate — consider full deck in valleys');
  }

  // Underlayment
  lines.push('Underlayment: ASTM D226 Type II felt or ASTM D4869 synthetic required (IRC R905.1.1)');

  // Pitch-specific
  if (pitch > 0 && pitch < 3) {
    lines.push(`Low-slope roof (${pitch}/12): requires modified bitumen, TPO, EPDM, or built-up roofing system`);
  } else if (pitch >= 3 && pitch <= 4) {
    lines.push(`Moderate slope (${pitch}/12): double underlayment layer recommended for asphalt shingles`);
  }

  // Material-specific
  if (material.includes('shingle')) {
    lines.push('Asphalt shingles: ASTM D3462 compliance, min 110 mph wind rating in high-wind zones (IRC R905.2)');
    lines.push('Min roof slope for asphalt shingles: 2:12 with double underlayment, 4:12 standard (IRC R905.2.2)');
    lines.push('Fastening: 4 nails per shingle standard, 6 nails in high-wind zones >110 mph (IRC R905.2.6)');
    lines.push('Starter strip and hip/ridge caps required per manufacturer specs');
  } else if (material.includes('metal')) {
    lines.push('Metal roofing: ASTM E1592 structural attachment, thermal movement allowance required (IRC R905.10)');
    lines.push('Min slope for metal roofing: 3:12 with lapped non-soldered seams (IRC R905.10.2)');
  }

  // Ventilation
  const hasRidgeVent = get(bm, 'roof.has_ridge_vent', false);
  lines.push(`Attic ventilation: 1:150 ratio (or 1:300 with balanced intake/exhaust) (IRC R806.2)`);
  if (hasRidgeVent) {
    lines.push('Ridge vent with matched soffit intake provides balanced ventilation');
  }

  // Flashing
  lines.push('Step and counter flashing required at all roof-to-wall intersections (IRC R905.2.8.3)');
  lines.push('Pipe boot flashing at all penetrations (IRC R903.3)');

  return [{ title: 'Roofing Code Requirements', lines }];
}

function framingNotes(bm: Record<string, unknown>): NoteSection[] {
  const lines: string[] = [];
  const walls = get(bm, 'walls', []);
  const stories = get(bm, 'stories', 1);

  // Stud spacing
  const spacings = new Set(walls.map((w: unknown) => (w as Record<string, unknown>).stud_spacing).filter(Boolean));
  if (spacings.size > 0) {
    lines.push(`Stud spacing: ${Array.from(spacings).join(', ')}" o.c. as noted on plans (IRC R602.3)`);
  }

  // Wall thickness
  const thicknesses = new Set(walls.map((w: unknown) => (w as Record<string, unknown>).thickness).filter(Boolean));
  if (thicknesses.size > 0) {
    lines.push(`Wall framing: ${Array.from(thicknesses).join(', ')} as scheduled`);
  }

  // Multi-story
  if (stories > 1) {
    lines.push(`${stories}-story structure: verify bearing point stacking and header sizing per structural plans`);
    lines.push('Double top plates required unless single top plate with approved connectors (IRC R602.3.2)');
  }

  // Headers
  lines.push('Headers sized per IRC Table R602.7 or per structural engineer specs on plans');

  // Shear walls
  const shearWalls = walls.filter((w: unknown) => (w as Record<string, unknown>).wall_type === 'shear');
  if (shearWalls.length > 0) {
    lines.push(`${shearWalls.length} shear wall(s) identified — verify nailing schedule and hold-down per structural`);
  }

  // Bracing
  lines.push('Wall bracing per IRC R602.10 — verify method and spacing on plans');

  // Fire blocking
  lines.push('Fire blocking required at all concealed spaces, soffits, and stair stringers (IRC R302.11)');

  return [{ title: 'Framing Code Requirements', lines }];
}

function electricalNotes(bm: Record<string, unknown>): NoteSection[] {
  const lines: string[] = [];
  const rooms = get(bm, 'rooms', []);
  const sqft = get(bm, 'sqft', 0);

  // Service size
  if (sqft > 3000) {
    lines.push('Consider 200A service panel for homes over 3,000 SF (NEC 220.82)');
  } else {
    lines.push('Minimum 100A service panel for single-family dwelling (NEC 230.79)');
  }

  // AFCI
  lines.push('AFCI protection required for all habitable rooms: bedrooms, living rooms, family rooms, dining rooms, dens, sunrooms, closets, hallways (NEC 210.12)');

  // GFCI
  lines.push('GFCI protection required: bathrooms, kitchens (within 6\' of sink), garages, outdoors, crawl spaces, unfinished basements, laundry areas (NEC 210.8)');

  // Bathrooms
  const bathrooms = rooms.filter((r: unknown) => (r as Record<string, unknown>).is_bathroom === true);
  if (bathrooms.length > 0) {
    lines.push(`${bathrooms.length} bathroom(s): dedicated 20A circuit required for each bathroom receptacle(s) (NEC 210.11(C)(3))`);
    lines.push('Bathroom exhaust fan required: min 50 CFM intermittent or 20 CFM continuous (IRC M1505.4)');
  }

  // Kitchen
  const kitchens = rooms.filter((r: unknown) => (r as Record<string, unknown>).is_kitchen === true);
  if (kitchens.length > 0) {
    lines.push('Kitchen: two 20A small appliance branch circuits required (NEC 210.11(C)(1))');
    lines.push('Kitchen: dedicated circuit for dishwasher, disposal, refrigerator recommended');
  }

  // Smoke/CO
  lines.push('Interconnected smoke alarms in all bedrooms, outside sleeping areas, and each floor (IRC R314)');
  lines.push('Carbon monoxide alarms required outside sleeping areas and each floor with fuel-burning appliances (IRC R315)');

  // Tamper resistant
  lines.push('Tamper-resistant receptacles required throughout dwelling (NEC 406.12)');

  return [{ title: 'Electrical Code Requirements', lines }];
}

function plumbingNotes(bm: Record<string, unknown>): NoteSection[] {
  const lines: string[] = [];
  const rooms = get(bm, 'rooms', []);

  const bathrooms = rooms.filter((r: unknown) => (r as Record<string, unknown>).is_bathroom === true);
  const kitchens = rooms.filter((r: unknown) => (r as Record<string, unknown>).is_kitchen === true);

  lines.push(`${bathrooms.length} bathroom(s), ${kitchens.length} kitchen(s) identified — size DWV per fixture unit count (IRC P3004)`);

  // Water heater
  lines.push('Water heater: T&P relief valve with discharge pipe to within 6" of floor or exterior (IRC P2803.6)');
  lines.push('Gas water heater: direct vent or power vent required per appliance specs');

  // Venting
  lines.push('Each fixture requires individual or common vent per IRC Chapter 31');
  lines.push('AAV (Air Admittance Valves) permitted where allowed by local jurisdiction (IRC P3114)');

  // Water supply
  lines.push('Water supply sizing per IRC Table P2903.6 based on fixture count and distance');
  lines.push('Shutoff valves required at each fixture (IRC P2903.9.3)');

  // Anti-scald
  lines.push('Anti-scald valves (thermostatic mixing) required at tub/shower (IRC P2708.4)');

  // Cleanouts
  lines.push('Cleanouts required at base of each stack, every direction change >45°, and every 100\' of horizontal run (IRC P3005.2)');

  return [{ title: 'Plumbing Code Requirements', lines }];
}

function hvacNotes(bm: Record<string, unknown>): NoteSection[] {
  const lines: string[] = [];
  const zone = get(bm, 'climate_zone', '');
  const zoneBase = parseInt(getClimateZoneBase(zone || '4'));

  // Manual J/D/S
  lines.push('Equipment sizing per ACCA Manual J load calculation (IRC M1401.3)');
  lines.push('Duct sizing per ACCA Manual D (IRC M1601.1)');

  // Duct insulation
  if (zoneBase >= 4) {
    lines.push(`Climate Zone ${zoneBase}: supply ducts in unconditioned spaces insulated to min R-8, return ducts min R-6 (IRC N1103.3)`);
  } else {
    lines.push('Supply ducts in unconditioned spaces insulated to min R-6 (IRC N1103.3)');
  }

  // Duct sealing
  lines.push('All duct joints and seams sealed with mastic or UL 181-rated tape (IRC M1601.4)');
  lines.push('Duct leakage testing may be required: max 4 CFM25/100 SF to outside (IECC R403.3)');

  // Combustion air
  lines.push('Combustion air required for fuel-burning equipment per IRC G2407');

  // Return air
  lines.push('Return air pathways required for all closed rooms — transfer grilles or jump ducts (IRC M1602)');

  // Refrigerant lines
  lines.push('Refrigerant lines insulated per manufacturer specs, min 3/4" wall thickness');

  return [{ title: 'HVAC Code Requirements', lines }];
}

function exteriorNotes(bm: Record<string, unknown>): NoteSection[] {
  const lines: string[] = [];
  const sidingType = get(bm, 'siding_type', '');

  // Weather barrier
  lines.push('Weather-resistant barrier (WRB) required behind all exterior cladding (IRC R703.1)');
  lines.push('WRB must be lapped shingle-style, integrated with window/door flashing');

  // Flashing
  lines.push('Flashing required at all windows, doors, deck ledger, roof-to-wall, and penetrations (IRC R703.4)');
  lines.push('Kickout flashing at all roof-to-wall terminations to prevent moisture intrusion');

  // Siding-specific
  if (sidingType.includes('fiber_cement')) {
    lines.push('Fiber cement siding: min 6" clearance from grade, caulk all butt joints, prime cut ends');
  } else if (sidingType.includes('vinyl')) {
    lines.push('Vinyl siding: ASTM D3679, allow for thermal expansion at all connections');
  } else if (sidingType.includes('wood')) {
    lines.push('Wood siding: prime all sides before installation, maintain 6" clearance from grade');
  } else if (sidingType.includes('brick') || sidingType.includes('stone')) {
    lines.push('Masonry veneer: 1" air gap, weep holes at base and above openings per IRC R703.8');
  }

  // Soffit & fascia
  lines.push('Soffit ventilation openings must align with attic ventilation plan (IRC R806)');

  // Trim
  lines.push('All exterior trim sealed and painted/stained on all surfaces including cut ends');

  return [{ title: 'Exterior Code Requirements', lines }];
}

function interiorNotes(bm: Record<string, unknown>): NoteSection[] {
  const lines: string[] = [];
  const rooms = get(bm, 'rooms', []);

  // Flooring transitions
  const floorFinishes = new Set(
    rooms.map((r: unknown) => (r as Record<string, unknown>).floor_finish).filter(Boolean)
  );
  if (floorFinishes.size > 1) {
    lines.push(`${floorFinishes.size} floor finish types — transition strips required at material changes`);
  }

  // Stair handrails
  const stories = get(bm, 'stories', 1);
  if (stories > 1) {
    lines.push('Handrails required on stairs: 34-38" height, graspable profile (IRC R311.7.8)');
    lines.push('Guards required where walking surface is 30"+ above grade: min 36" height (IRC R312.1)');
  }

  // Egress windows
  lines.push('Egress window required in each sleeping room: min 5.7 SF opening, max 44" sill height (IRC R310.1)');

  // Doors
  lines.push('Exterior doors: min 3\'-0" x 6\'-8" required at primary egress (IRC R311.2)');

  // Paint / finishes
  lines.push('Interior primer and paint per manufacturer specs — two coats finish recommended');

  // Baseboard / casing
  lines.push('Base and casing trim installed per finish schedule on plans');

  return [{ title: 'Interior Finish Code Requirements', lines }];
}

function gutterNotes(bm: Record<string, unknown>): NoteSection[] {
  const lines: string[] = [];
  const roofArea = get(bm, 'roof.total_area_sf', 0);

  // Sizing
  if (roofArea > 1200) {
    lines.push('6" K-style gutters recommended for roof drainage areas over 600 SF per run (SMACNA guidelines)');
  } else {
    lines.push('5" K-style gutters adequate for roof drainage areas up to 600 SF per run (SMACNA guidelines)');
  }

  // Slope
  lines.push('Min gutter slope: 1/16" per linear foot toward outlet for proper drainage');

  // Downspouts
  lines.push('Downspout spacing: one 2x3 or 3x4 downspout per 40 LF of gutter run');

  // Discharge
  lines.push('Downspout extensions: min 6 ft from foundation or connected to storm drainage (IRC R801.3)');

  // Expansion
  lines.push('Expansion joints required every 40 LF for aluminum gutters (SMACNA)');

  // End caps & seaming
  lines.push('Sealed end caps at all gutter terminations; seamless preferred to minimize leak points');

  // Guards
  const gutterRuns = get(bm, 'gutter_runs', []);
  const hasGuards = gutterRuns.some((g: unknown) => (g as Record<string, unknown>).gutter_guard === true);
  if (hasGuards) {
    lines.push('Gutter guards specified — verify compatibility with roof material and pitch');
  }

  return [{ title: 'Gutter & Downspout Requirements (IRC R903.3, SMACNA)', lines }];
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Generate building code notes keyed by trade from a BuildingModel.
 *
 * Returns an object like:
 * ```
 * {
 *   insulation: [{ title: "IECC 2021...", lines: [...] }],
 *   drywall: [{ title: "Drywall Code...", lines: [...] }],
 *   ...
 * }
 * ```
 */
export function generateCodeNotes(
  buildingModel: Record<string, unknown>
): Record<string, NoteSection[]> {
  const notes: Record<string, NoteSection[]> = {};

  notes.insulation = insulationNotes(buildingModel);
  notes.drywall = drywallNotes(buildingModel);
  notes.roofing = roofingNotes(buildingModel);
  notes.framing = framingNotes(buildingModel);
  notes.electrical = electricalNotes(buildingModel);
  notes.plumbing = plumbingNotes(buildingModel);
  notes.hvac = hvacNotes(buildingModel);
  notes.exterior = exteriorNotes(buildingModel);
  notes.interior = interiorNotes(buildingModel);

  notes.gutters = gutterNotes(buildingModel);

  return notes;
}
