/**
 * General trade knowledge notes and location-specific considerations.
 *
 * Pure functions — no side effects, no API calls. Complements building-code-notes.ts
 * which focuses on IRC/IECC code references. This file provides:
 * 1. Best practices & common knowledge per trade
 * 2. Regional/climate considerations based on project location
 */

import type { NoteSection } from '@/lib/api/python-service';

// ---------------------------------------------------------------------------
// Address Parsing
// ---------------------------------------------------------------------------

const STATE_ABBREVS = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
]);

/**
 * Extract 2-letter US state abbreviation from a full address string.
 * Handles: "123 Main St, Denver, CO 80202", "Denver, CO", "Washington, DC 20001"
 */
export function parseStateFromAddress(address: string): string | null {
  if (!address) return null;
  // Match state abbreviation: after a comma/space, 2 uppercase letters, optionally followed by ZIP
  const match = address.match(/[\s,]+([A-Z]{2})[\s,]*\d{0,5}\s*$/);
  if (match && STATE_ABBREVS.has(match[1])) return match[1];
  // Fallback: find any 2-letter state code in the string
  const parts = address.split(/[\s,]+/);
  for (const part of parts) {
    const upper = part.toUpperCase();
    if (STATE_ABBREVS.has(upper)) return upper;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Regional Lookup Sets
// ---------------------------------------------------------------------------

const SEISMIC_STATES = new Set(['CA', 'OR', 'WA', 'AK', 'HI', 'NV', 'UT', 'MT', 'ID', 'MO', 'AR', 'TN', 'SC']);
const HURRICANE_STATES = new Set(['FL', 'TX', 'LA', 'MS', 'AL', 'GA', 'SC', 'NC', 'VA', 'HI']);
const HIGH_WIND_STATES = new Set(['FL', 'TX', 'LA', 'MS', 'AL', 'GA', 'SC', 'NC', 'OK', 'KS', 'NE', 'SD', 'ND']);
const HIGH_HUMIDITY_STATES = new Set(['FL', 'LA', 'MS', 'AL', 'GA', 'SC', 'TX', 'HI', 'AR', 'TN']);
const TERMITE_HIGH_STATES = new Set(['FL', 'LA', 'MS', 'AL', 'GA', 'SC', 'TX', 'HI', 'CA', 'AZ', 'NM']);
const RADON_HIGH_STATES = new Set(['CO', 'IA', 'PA', 'OH', 'MN', 'IN', 'NE', 'ND', 'SD', 'MT', 'ID', 'KY', 'WV']);
const WILDFIRE_STATES = new Set(['CA', 'CO', 'OR', 'WA', 'MT', 'ID', 'NM', 'AZ', 'NV', 'UT']);
const EXTREME_HEAT_STATES = new Set(['AZ', 'NV', 'TX', 'CA', 'NM', 'FL', 'LA', 'MS', 'OK']);
const COASTAL_STATES = new Set(['FL', 'TX', 'LA', 'MS', 'AL', 'GA', 'SC', 'NC', 'VA', 'MD', 'DE', 'NJ', 'NY', 'CT', 'RI', 'MA', 'NH', 'ME', 'CA', 'OR', 'WA', 'HI', 'AK']);
const COLD_CLIMATE_STATES = new Set(['MN', 'WI', 'MI', 'ND', 'SD', 'MT', 'WY', 'VT', 'NH', 'ME', 'AK']);

// ---------------------------------------------------------------------------
// Trade Best Practices
// ---------------------------------------------------------------------------

const TRADE_KNOWLEDGE: Record<string, NoteSection[]> = {
  framing: [{
    title: 'Framing Best Practices',
    lines: [
      'Crown all studs and joists upward before installation — consistency prevents wavy walls and bouncy floors',
      'Check lumber moisture content (<19% for framing); wet lumber shrinks, causing nail pops and drywall cracks',
      'Stagger double top plate joints by at least 4 ft and overlap at corners and intersections',
      'Batch-cut headers, cripples, and jacks by size to improve efficiency and reduce waste',
      'Use a chalk line to verify plate layout before standing walls — catching errors early saves hours',
      'Install blocking for future cabinet, grab bar, and TV mounting locations per plans',
      'Verify window and door rough openings against manufacturer specs before framing — not plan dimensions alone',
      'Square each wall section before sheathing; a 3-4-5 triangle check at each corner is quick and reliable',
    ],
  }],
  insulation: [{
    title: 'Insulation Best Practices',
    lines: [
      'Seal all air penetrations (wiring, plumbing, HVAC) with fire-rated caulk or foam BEFORE insulating',
      'Never compress batt insulation to fit — compressed batts lose R-value proportionally',
      'Split batts around wires; do not push wires to front or back of cavity',
      'Ensure soffit baffles are installed in every rafter bay before blowing attic insulation',
      'Insulate rim joists thoroughly — they are one of the biggest thermal bridges in a home',
      'Spray foam in band joists and irregular cavities where batts cannot achieve full contact',
      'Install vapor retarder on correct side (warm-in-winter side) per climate zone requirements',
      'For blown-in: verify settled density meets manufacturer specs with a density check bag',
    ],
  }],
  drywall: [{
    title: 'Drywall Best Practices',
    lines: [
      'Hang ceilings first, then walls — wall sheets support ceiling edges and reduce visible seams',
      'Stagger joints between rows and between sides of a wall to minimize cracking at seams',
      'Use setting-type compound (hot mud) for first coat on joints and screwheads — faster cure, less shrinkage',
      'Back-block butt joints or use butt-joint reducers to prevent ridging at non-tapered edges',
      'Keep sheets 3/8" above floor level — moisture wicking from slab or subfloor damages bottom edges',
      'In high-traffic areas and garages, consider 5/8" board even where not code-required for added durability',
      'Control dust during sanding with a vacuum sander — dust contaminates HVAC equipment and finishes',
      'Apply primer-surfacer coat before paint to ensure uniform porosity and hide joint texture differences',
    ],
  }],
  roofing: [{
    title: 'Roofing Best Practices',
    lines: [
      'Install drip edge at eaves BEFORE underlayment, at rakes OVER underlayment (IRC R905.2.8.5)',
      'Work from eave to ridge, offsetting shingle joints by at least 6" course to course',
      'Use starter strip (not reversed shingles) for consistent sealant positioning at eaves and rakes',
      'Nail in the manufacturer\'s nailing zone — too high and shingles blow off, too low and tabs buckle',
      'Flash valleys with ice & water shield before shingle courses — open metal valleys last longest',
      'Install step flashing woven with shingle courses at roof-to-wall transitions, never one-piece flashing',
      'Ventilate attic with balanced intake (soffit) and exhaust (ridge) — unbalanced systems cause moisture issues',
      'Never roof over more than one layer of existing shingles — added weight stresses framing',
    ],
  }],
  electrical: [{
    title: 'Electrical Best Practices',
    lines: [
      'Label every circuit at the panel during rough-in — matching circuits later wastes hours',
      'Pull all wires for a room together during rough-in to avoid re-entering finished cavities',
      'Maintain minimum bend radius of 5x cable diameter to avoid damaging conductors',
      'Keep low-voltage (data, coax, speaker) wiring at least 12" from line-voltage runs to prevent interference',
      'Use nail plates where wire passes through studs within 1.25" of the face to protect from drywall screws',
      'Install dedicated circuits for high-draw appliances: microwave, dishwasher, disposal, HVAC, EV charger',
      'Pre-wire for future needs: EV charging (40A), home office, security cameras, smart home hub',
      'Take photos of all rough-in before drywall closes — invaluable for future service and remodels',
    ],
  }],
  plumbing: [{
    title: 'Plumbing Best Practices',
    lines: [
      'Slope all horizontal drain lines minimum 1/4" per foot (1/8" for 4" pipe) toward main stack',
      'Pressure test supply lines at 1.5x working pressure before closing walls — fix leaks when accessible',
      'Strap pipes at intervals per code to prevent movement, water hammer, and transmission of noise',
      'Insulate hot water supply lines (and cold in unconditioned spaces) to reduce energy loss and condensation',
      'Place cleanouts at base of each stack and at every direction change >45° for future maintenance',
      'Stub out with proper centerline dimensions per fixture manufacturer — not generic rough-in specs',
      'Use dielectric unions where dissimilar metals meet (copper to steel) to prevent galvanic corrosion',
      'Home-run (manifold) systems reduce pressure drop and allow individual fixture shutoffs',
    ],
  }],
  hvac: [{
    title: 'HVAC Best Practices',
    lines: [
      'Seal all duct joints with mastic or UL 181-rated tape BEFORE insulating — tape alone fails over time',
      'Right-size equipment per Manual J — oversized systems short-cycle, wasting energy and failing to dehumidify',
      'Support flex duct at max 5 ft intervals; avoid excess length and tight bends that restrict airflow',
      'Install filter-back return grilles sized to handle total system CFM without excessive pressure drop',
      'Maintain manufacturer clearances to combustibles for furnaces, water heaters, and flue pipes',
      'Provide return air pathways for all closed rooms — transfer grilles, jump ducts, or dedicated returns',
      'Commission system after install: measure static pressure, temperature split, and airflow at each register',
      'Locate thermostat on interior wall, away from supply registers, windows, and direct sunlight',
    ],
  }],
  exterior: [{
    title: 'Exterior Best Practices',
    lines: [
      'Back-prime (seal all 6 sides of) all siding, trim, and fascia before installation to prevent moisture intrusion',
      'Maintain minimum 6" clearance between siding and finish grade to prevent rot and termite entry',
      'Integrate WRB (house wrap) flashing with window/door openings in shingle-lap fashion — water must flow outward',
      'Use stainless steel or hot-dipped galvanized fasteners in coastal areas to prevent corrosion staining',
      'Caulk all butt joints and penetrations with high-quality polyurethane or silicone sealant',
      'Install kickout flashing at every roof-to-wall termination — the #1 missed detail causing water damage',
      'Allow thermal expansion gaps per manufacturer specs, especially for fiber cement and vinyl siding',
      'Prime and paint cut ends of fiber cement and wood trim immediately to prevent moisture wicking',
    ],
  }],
  interior: [{
    title: 'Interior Finish Best Practices',
    lines: [
      'Acclimate flooring materials in the space for 48-72 hours before installation per manufacturer specs',
      'Level subfloor to within 3/16" per 10 ft before installing hard flooring — lippage is unfixable once set',
      'Leave expansion gaps (typically 1/4-3/8") at all walls and fixed objects for floating floors',
      'Protect installed finishes (flooring, countertops, fixtures) with drop cloths and corner guards during remaining trades',
      'Install door casings before baseboard so base can butt cleanly into casing — easier scribing, cleaner joints',
      'Pre-finish or prime interior trim before installation for cleaner results and faster completion',
      'Use painter\'s caulk (not silicone) at trim-to-wall joints — paintable and produces clean lines',
      'Sequence interior work: paint walls → install flooring → install base/case → touch-up paint',
    ],
  }],
  gutters: [{
    title: 'Gutter Best Practices',
    lines: [
      'Slope gutters 1/16" per linear foot toward each downspout outlet for positive drainage',
      'Use seamless gutters wherever possible — seams are the #1 point of failure and leaking',
      'Size downspouts to handle roof drainage area: 3x4 for runs over 40 LF or roof areas over 600 SF',
      'Extend downspouts minimum 6 ft from foundation or connect to underground drainage system',
      'Install hidden hangers at max 24" OC (16" OC in snow country) for structural support',
      'Seal all end caps, miters, and outlets with gutter sealant — not silicone caulk which fails in UV',
      'Consider gutter guards in heavily wooded areas to reduce maintenance and prevent ice dam backup',
      'Ensure fascia board is sound before hanging gutters — rotted fascia cannot support loaded gutters',
    ],
  }],
};

// ---------------------------------------------------------------------------
// Location & Climate Notes
// ---------------------------------------------------------------------------

function getLocationNotes(trade: string, state: string | null, climateZone: string): string[] {
  const lines: string[] = [];
  const zoneNum = parseInt(climateZone.replace(/[A-Za-z]/g, '')) || 0;

  switch (trade.toLowerCase()) {
    case 'framing': {
      if (state && SEISMIC_STATES.has(state)) {
        lines.push('Seismic zone: verify hold-down, strap, and shear wall nailing schedule per structural engineer — local seismic amendments often exceed IRC minimums');
        lines.push('Simpson Strong-Tie or equivalent engineered connectors required at all critical connections in seismic regions');
      }
      if (state && HURRICANE_STATES.has(state)) {
        lines.push('High-wind region: hurricane straps/clips required at all roof-to-wall connections — verify Miami-Dade NOA or FL approval if in HVHZ');
        lines.push('Continuous load path from roof to foundation required in wind-borne debris regions');
      }
      if (zoneNum >= 6) {
        lines.push('Cold climate: consider 2x6 exterior walls for additional insulation depth and structural capacity');
      }
      if (state && TERMITE_HIGH_STATES.has(state)) {
        lines.push('High termite risk area: use pressure-treated lumber for all sill plates and consider borate-treated framing');
      }
      break;
    }
    case 'insulation': {
      if (zoneNum >= 5) {
        lines.push(`Climate Zone ${climateZone}: continuous exterior insulation strongly recommended to reduce thermal bridging — 2x6 cavity alone may not meet energy code`);
      }
      if (state && HIGH_HUMIDITY_STATES.has(state)) {
        lines.push('High-humidity region: open-cell spray foam in walls allows drying; avoid interior vapor barriers that trap moisture');
        lines.push('Consider dehumidification strategy — insulation alone does not address humidity loads in the Southeast');
      }
      if (zoneNum <= 2) {
        lines.push('Hot climate: radiant barrier in attic can reduce cooling loads 5-10% — most cost-effective insulation upgrade in southern states');
      }
      if (state && COLD_CLIMATE_STATES.has(state)) {
        lines.push('Extreme cold: pay special attention to air sealing at rim joists, attic hatches, and recessed lights — air leakage drives more heat loss than missing insulation');
      }
      break;
    }
    case 'drywall': {
      if (state && SEISMIC_STATES.has(state)) {
        lines.push('Seismic zone: float (do not fasten) drywall at ceiling-wall intersections and use control joints per GA-216 to prevent cracking during movement');
      }
      if (state && HIGH_HUMIDITY_STATES.has(state)) {
        lines.push('High-humidity region: use moisture-resistant (green board or purple board) in all bathrooms, laundry, and consider for exterior walls');
      }
      break;
    }
    case 'roofing': {
      if (state && HURRICANE_STATES.has(state)) {
        lines.push('Hurricane-prone region: use 6-nail pattern on all shingles, sealed-deck underlayment, and impact-rated materials if in wind-borne debris region');
        lines.push('Verify local wind speed requirements — many coastal jurisdictions require 130+ mph rated shingles');
      }
      if (zoneNum >= 5) {
        lines.push('Cold climate: full ice & water shield coverage from eave to 24" past interior wall line; consider extending in valleys and at dormers');
      }
      if (zoneNum >= 7) {
        lines.push('Heavy snow load region: verify structural capacity for local ground snow load — may require upgraded rafters/trusses');
      }
      if (state && EXTREME_HEAT_STATES.has(state)) {
        lines.push('Extreme heat region: light-colored or cool-roof rated shingles can reduce attic temps by 20-30°F and extend shingle life');
      }
      if (state && WILDFIRE_STATES.has(state)) {
        lines.push('Wildfire risk area: Class A fire-rated roofing required; avoid wood shake — check local WUI (Wildland-Urban Interface) requirements');
      }
      break;
    }
    case 'electrical': {
      if (state && HURRICANE_STATES.has(state)) {
        lines.push('Storm-prone area: consider whole-house generator or battery backup pre-wiring during rough-in — far cheaper than retrofit');
      }
      if (state && EXTREME_HEAT_STATES.has(state)) {
        lines.push('Hot climate: size electrical panel with capacity for future HVAC upgrades and EV charging — 200A minimum recommended');
      }
      if (state === 'CA') {
        lines.push('California: Title 24 requires solar-ready provisions for new residential construction — verify conduit and panel space requirements');
      }
      break;
    }
    case 'plumbing': {
      if (state && RADON_HIGH_STATES.has(state)) {
        lines.push('High radon area: install passive radon mitigation piping (3" or 4" PVC from sub-slab to roof) during rough-in — far cheaper than active retrofit');
      }
      if (zoneNum >= 5) {
        lines.push('Cold climate: insulate all water supply lines in exterior walls and unheated spaces; consider heat trace cable for vulnerable pipe runs');
        lines.push('Frost-proof hose bibs required; verify frost depth for water service line burial (typically 42-60" in northern states)');
      }
      if (state && HIGH_HUMIDITY_STATES.has(state)) {
        lines.push('Humid climate: insulate cold water pipes to prevent condensation dripping — can cause mold and ceiling stains');
      }
      break;
    }
    case 'hvac': {
      if (state && HIGH_HUMIDITY_STATES.has(state)) {
        lines.push('High-humidity region: ensure equipment is not oversized — short-cycling prevents adequate dehumidification and promotes mold growth');
        lines.push('Consider variable-speed equipment or supplemental dehumidifier for latent load management');
      }
      if (state && EXTREME_HEAT_STATES.has(state)) {
        lines.push('Extreme heat climate: shade outdoor condenser unit and ensure adequate clearance for airflow — direct sun reduces efficiency 5-10%');
        lines.push('Higher SEER2 equipment (17+) provides faster ROI in cooling-dominated climates');
      }
      if (state && COLD_CLIMATE_STATES.has(state)) {
        lines.push('Cold climate: consider cold-climate heat pump (rated to -15°F or below) — modern units perform well and eliminate fossil fuel dependency');
        lines.push('High-efficiency condensing furnace (95%+ AFUE) recommended if gas is available');
      }
      break;
    }
    case 'exterior': {
      if (state && COASTAL_STATES.has(state)) {
        lines.push('Coastal area: use stainless steel or hot-dipped galvanized fasteners — standard galvanized corrodes rapidly in salt air');
      }
      if (state && HURRICANE_STATES.has(state)) {
        lines.push('Hurricane zone: impact-rated windows and doors may be required; verify local wind-borne debris region status');
        lines.push('Soffit must be rated for wind uplift pressure — perforated aluminum or vented James Hardie panels');
      }
      if (state && WILDFIRE_STATES.has(state)) {
        lines.push('Wildfire area: non-combustible siding (fiber cement, stucco, metal) required in WUI zones — check local defensible space requirements');
        lines.push('Screen all vents and soffits with 1/8" metal mesh to prevent ember intrusion');
      }
      if (state && HIGH_HUMIDITY_STATES.has(state)) {
        lines.push('Humid region: ensure drainage plane behind all cladding — rainscreen gap (3/8-3/4") strongly recommended for long-term wall durability');
      }
      break;
    }
    case 'interior': {
      if (state && HIGH_HUMIDITY_STATES.has(state)) {
        lines.push('Humid region: choose flooring materials resistant to moisture and swelling — LVP outperforms hardwood in high-humidity environments');
      }
      if (zoneNum >= 5) {
        lines.push('Cold climate: consider heated flooring in bathrooms and entryways — radiant heat tubing must be installed before subfloor/tile');
      }
      if (state && SEISMIC_STATES.has(state)) {
        lines.push('Seismic zone: secure water heaters with double-strap kit, anchor tall bookcases and cabinets to wall studs');
      }
      break;
    }
    case 'gutters': {
      if (zoneNum >= 5) {
        lines.push('Cold climate: install heat cable in gutters and downspouts at problem areas to prevent ice dams and freeze damage');
        lines.push('Use heavier gauge gutters (.032" aluminum minimum) to withstand snow and ice loading');
      }
      if (state && HIGH_WIND_STATES.has(state)) {
        lines.push('High-wind area: secure gutters with strap hangers screwed into rafter tails, not face-nailed to fascia');
      }
      if (state && HURRICANE_STATES.has(state)) {
        lines.push('Hurricane region: gutter systems can become projectiles — ensure attachment meets local wind load requirements');
      }
      break;
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate general trade knowledge notes (best practices, common pitfalls).
 * No project data required — works even with null buildingModel.
 */
export function generateTradeKnowledge(trade: string): NoteSection[] {
  return TRADE_KNOWLEDGE[trade.toLowerCase()] || [];
}

/**
 * Generate location and climate-specific notes for a trade.
 * Uses state abbreviation (from address) and/or climate zone (from building model).
 * Returns empty array if no location data available or no relevant notes.
 */
export function generateLocationNotes(
  trade: string,
  state: string | null,
  climateZone: string
): NoteSection[] {
  const lines = getLocationNotes(trade, state, climateZone);
  if (lines.length === 0) return [];
  return [{ title: 'Location & Climate Considerations', lines }];
}
