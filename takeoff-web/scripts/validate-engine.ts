/**
 * D3 validation harness: run the v2 estimate engine against known scenarios
 * and compare against hand-computed expected values derived from
 * reference/calc_insulation.py logic for the same inputs.
 *
 * Run: npx tsx scripts/validate-engine.ts
 */

import { generateEstimate } from '../src/lib/engine/estimate-engine';
import { getTradeModule } from '../src/lib/trades/trade-loader';
import { evalFormula } from '../src/lib/engine/formula';
import type { Measurement } from '../src/lib/types/measurement';
import type { CostDatabase } from '../src/lib/engine/estimate-engine';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const costsPath = path.join(root, 'config', 'default_costs.json');
const costs = JSON.parse(fs.readFileSync(costsPath, 'utf8')) as CostDatabase;

let pass = 0;
let fail = 0;

function close(a: number, b: number, tol = 0.01): boolean {
  if (b === 0) return Math.abs(a) < tol;
  return Math.abs((a - b) / b) <= tol;
}

function assertCloseTo(name: string, actual: number, expected: number, tol = 0.01): void {
  const ok = close(actual, expected, tol);
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}: ${actual} ≈ ${expected}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}: got ${actual}, expected ~${expected} (tol ${tol * 100}%)`);
  }
}

function assertEq<T>(name: string, actual: T, expected: T): void {
  if (actual === expected) {
    pass++;
    console.log(`  ✓ ${name}: ${String(actual)}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}: got ${String(actual)}, expected ${String(expected)}`);
  }
}

function makeMeasurement(tag: string, value: number, trade: string, unit = 'SF'): Measurement {
  return {
    id: `m-${tag}`,
    name: tag,
    trade,
    measurementType: tag,
    semanticTag: tag,
    tradeAssociations: [trade],
    mode: unit === 'LF' ? 'linear' : 'surface_area',
    pageNumber: 1,
    sourceSheetPage: 1,
    points: [],
    isClosed: false,
    heightFt: null,
    resultValue: value,
    resultUnit: unit,
    scaleString: '1/4" = 1\'-0"',
    scaleFactor: 48,
    createdAt: new Date().toISOString(),
    addedToEstimate: false,
  };
}

console.log('=== Formula evaluator ===');
assertEq('basic arithmetic', evalFormula('2 + 3 * 4', {}), 14);
assertEq('parentheses', evalFormula('(2 + 3) * 4', {}), 20);
assertEq('variable', evalFormula('x * 2', { x: 21 }), 42);
assertEq('ceil', evalFormula('ceil(3.2)', {}), 4);
assertEq('round 2dp', evalFormula('round(3.14159, 2)', {}), 3.14);
assertEq('max', evalFormula('max(1, 5, 3)', {}), 5);
assertEq('comparison', evalFormula('x == 5', { x: 5 }), true);
assertEq('string equality', evalFormula("type == 'batt'", { type: 'batt' }), true);
assertEq('ternary', evalFormula('x > 0 ? "pos" : "neg"', { x: 1 }), 'pos');
assertEq('division by zero is zero', evalFormula('5 / 0', {}), 0);
assertEq('missing var defaults to 0', evalFormula('missing + 1', {}), 1);

console.log('\n=== Insulation scenario: R-19 batt walls in 2x6 ===');
const insulation = getTradeModule('insulation')!;
const r19BattOutput = generateEstimate({
  module: insulation,
  measurements: [
    makeMeasurement('exterior_wall_area', 2400, 'insulation'),
    makeMeasurement('attic_floor_area', 1800, 'insulation'),
  ],
  assumptions: {
    wall_insulation_type: 'batt',
    wall_r_value: '19',
    wall_assembly: '2x6',
    attic_insulation_type: 'blown_cellulose',
    attic_r_value: '49',
    vapor_barrier_required: 'no',
    house_wrap_required: 'yes',
    rim_joist_in_scope: 'no',
  },
  costs,
});

console.log(`  Items emitted: ${r19BattOutput.items.length}`);
console.log(`  Skipped: ${r19BattOutput.skipped.length}`);

const wallBatt = r19BattOutput.items.find((i) => i.scopeItemId === 'ins_wall_batt');
if (wallBatt) {
  // Hand calc: 2400 sf * 1.05 waste = 2520 sf at $0.75/sf = $1890
  // Labor: 2400 * 0.02 = 48 hrs at $28/hr = $1344
  assertCloseTo('wall batt qty', wallBatt.quantity, 2520);
  assertCloseTo('wall batt unit cost', wallBatt.unitCost, 0.75, 0.001);
  assertCloseTo('wall batt material', wallBatt.materialTotal, 2520 * 0.75);
  assertCloseTo('wall batt labor hrs', wallBatt.laborHours, 48);
  assertCloseTo('wall batt labor total', wallBatt.laborTotal, 48 * 28);
  assertEq('wall batt unit', wallBatt.unit, 'sf');
  console.log(`    description: "${wallBatt.description}"`);
} else {
  fail++;
  console.log('  ✗ ins_wall_batt was not emitted!');
}

const attic = r19BattOutput.items.find((i) => i.scopeItemId === 'ins_attic_blown_cellulose');
if (attic) {
  // Hand calc: 1800 * 1.10 = 1980; 1980 / 32 = 61.875 → ceil 62 bags at $12.50 = $775
  // Labor: 1800 * 0.01 = 18 hrs at $28 = $504
  assertCloseTo('attic blown qty (bags)', attic.quantity, 62);
  assertCloseTo('attic blown material', attic.materialTotal, 62 * 12.5);
  assertCloseTo('attic blown labor hrs', attic.laborHours, 18);
} else {
  fail++;
  console.log('  ✗ ins_attic_blown_cellulose was not emitted!');
}

const wrap = r19BattOutput.items.find((i) => i.scopeItemId === 'ins_house_wrap');
if (wrap) {
  // 2400 * 1.10 = 2640 sf at $0.18 = $475.20; labor 2400*0.01 = 24 hrs * $28 = $672
  assertCloseTo('house wrap qty', wrap.quantity, 2640);
  assertCloseTo('house wrap material', wrap.materialTotal, 2640 * 0.18);
} else {
  fail++;
  console.log('  ✗ ins_house_wrap was not emitted!');
}

// Should NOT include vapor barrier or rim joist (gated off)
const vb = r19BattOutput.items.find((i) => i.scopeItemId === 'ins_vapor_barrier');
assertEq('vapor barrier (off) not emitted', vb === undefined, true);
const rj = r19BattOutput.items.find((i) => i.scopeItemId === 'ins_rim_joist');
assertEq('rim joist (off) not emitted', rj === undefined, true);

// Should NOT include other wall types
const blown = r19BattOutput.items.find((i) => i.scopeItemId === 'ins_wall_blown');
assertEq('wall blown not emitted (batt selected)', blown === undefined, true);

console.log('\n=== Insulation scenario: closed-cell spray foam at R-21 in 2x6 ===');
const sprayOutput = generateEstimate({
  module: insulation,
  measurements: [makeMeasurement('exterior_wall_area', 2400, 'insulation')],
  assumptions: {
    wall_insulation_type: 'spray_foam_closed',
    wall_r_value: '21',
    wall_assembly: '2x6',
    attic_insulation_type: 'none',
    attic_r_value: '49',
    vapor_barrier_required: 'no',
    house_wrap_required: 'no',
    rim_joist_in_scope: 'no',
  },
  costs,
});

const spray = sprayOutput.items.find((i) => i.scopeItemId === 'ins_wall_spray_closed');
if (spray) {
  // depth = 21/7 = 3.0 inches
  // sf with waste = ceil(2400 * 1.05) = 2520
  // bf = 2520 * 3.0 = 7560
  // material: 7560 * $1.50 = $11,340
  assertCloseTo('spray closed qty (bf)', spray.quantity, 7560);
  assertCloseTo('spray closed unit cost', spray.unitCost, 1.50, 0.001);
  assertCloseTo('spray closed material', spray.materialTotal, 7560 * 1.5);
  assertEq('spray closed unit', spray.unit, 'bf');
} else {
  fail++;
  console.log('  ✗ ins_wall_spray_closed was not emitted!');
}

console.log('\n=== Gutters scenario: 6" aluminum, 4 corners, 5 downspouts ===');
const gutters = getTradeModule('gutters')!;
const gutOutput = generateEstimate({
  module: gutters,
  measurements: [
    makeMeasurement('eave_run_lf', 220, 'gutters', 'LF'),
    makeMeasurement('gutters_downspout_location', 5, 'gutters', 'LF'),
  ],
  assumptions: {
    gutter_size: '6in',
    gutter_material: 'aluminum',
    downspout_size: '3x4',
    downspout_avg_length: '12',
    outside_corner_count: '4',
    inside_corner_count: '0',
    gutter_guards: 'none',
    demo_existing: 'no',
  },
  costs,
});

const gutRun = gutOutput.items.find((i) => i.scopeItemId === 'gut_run');
if (gutRun) {
  // 220 * 1.05 = 231 lf at $4.75 = $1097.25
  assertCloseTo('gutter run qty', gutRun.quantity, 231);
  assertCloseTo('gutter unit cost', gutRun.unitCost, 4.75, 0.001);
  assertCloseTo('gutter material', gutRun.materialTotal, 231 * 4.75);
} else {
  fail++;
  console.log('  ✗ gut_run was not emitted!');
}

const dspt = gutOutput.items.find((i) => i.scopeItemId === 'gut_downspouts');
if (dspt) {
  // 5 * (12/10) = 6 → ceil = 6 pieces of 10' downspout at $14 = $84
  assertCloseTo('downspout count', dspt.quantity, 6);
  assertCloseTo('downspout unit cost', dspt.unitCost, 14, 0.001);
} else {
  fail++;
  console.log('  ✗ gut_downspouts was not emitted!');
}

const oMiter = gutOutput.items.find((i) => i.scopeItemId === 'gut_outside_miter');
if (oMiter) {
  assertCloseTo('outside miter count', oMiter.quantity, 4);
}

const guards = gutOutput.items.find((i) => i.scopeItemId === 'gut_guards_mesh');
assertEq('mesh guards (off) not emitted', guards === undefined, true);

console.log('\n=== Multi-trade scenario: insulation + gutters in one project ===');
// Simulates a real project where the user takes both insulation and gutter
// measurements, and the engine produces estimates for each trade.
const insMod = getTradeModule('insulation')!;
const gutMod = getTradeModule('gutters')!;
const measurements = [
  makeMeasurement('exterior_wall_area', 1800, 'insulation'),
  makeMeasurement('attic_floor_area', 1200, 'insulation'),
  makeMeasurement('eave_run_lf', 180, 'gutters', 'LF'),
  makeMeasurement('gutters_downspout_location', 4, 'gutters', 'LF'),
];

const insOut = generateEstimate({
  module: insMod,
  measurements,
  assumptions: {
    wall_insulation_type: 'batt',
    wall_r_value: '21',
    wall_assembly: '2x6',
    attic_insulation_type: 'blown_cellulose',
    attic_r_value: '49',
    vapor_barrier_required: 'no',
    house_wrap_required: 'yes',
    rim_joist_in_scope: 'no',
  },
  costs,
});

const gutOut = generateEstimate({
  module: gutMod,
  measurements,
  assumptions: {
    gutter_size: '5in',
    gutter_material: 'aluminum',
    downspout_size: '2x3',
    downspout_avg_length: '12',
    outside_corner_count: '4',
    inside_corner_count: '0',
    gutter_guards: 'none',
    demo_existing: 'no',
  },
  costs,
});

const insTotal = insOut.items.reduce((s, i) => s + i.lineTotal, 0);
const gutTotal = gutOut.items.reduce((s, i) => s + i.lineTotal, 0);

console.log(`  Insulation: ${insOut.items.length} items, $${insTotal.toFixed(2)}`);
console.log(`  Gutters:    ${gutOut.items.length} items, $${gutTotal.toFixed(2)}`);

// Insulation should consume only its own measurements
const insTags = new Set(insOut.items.flatMap((i) => i.sourceMeasurementTags));
assertEq('insulation does not consume eave_run_lf', insTags.has('eave_run_lf'), false);
assertEq('insulation does consume exterior_wall_area', insTags.has('exterior_wall_area'), true);

// Gutters should consume only its own measurements
const gutTags = new Set(gutOut.items.flatMap((i) => i.sourceMeasurementTags));
assertEq('gutters does not consume exterior_wall_area', gutTags.has('exterior_wall_area'), false);
assertEq('gutters does consume eave_run_lf', gutTags.has('eave_run_lf'), true);

// Sanity: insulation total > gutters total (more items, larger areas)
assertEq('insulation total > gutters total', insTotal > gutTotal, true);

// Combined estimate consistency: no scope item from one trade leaks into the other
const insIds = new Set(insOut.items.map((i) => i.scopeItemId));
const gutIds = new Set(gutOut.items.map((i) => i.scopeItemId));
let leak = false;
for (const id of insIds) if (gutIds.has(id)) leak = true;
assertEq('no scope item leaks between trades', leak, false);

console.log(`\n=== Summary ===`);
console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
