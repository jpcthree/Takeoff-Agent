/**
 * Layer 4 — Deterministic estimate engine.
 *
 * Takes a trade module, the user's measurements (keyed by semantic tag),
 * confirmed assumptions, and the cost database. Walks each scope item and
 * emits a ScopeItemResult line item.
 *
 * No AI lives in this layer. Identical inputs always produce identical
 * outputs.
 */

import type { Measurement } from '@/lib/types/measurement';
import type { TradeModule, ScopeItemDef } from '@/lib/trades/trade-types';
import { evalNumber, evalBool, evalFormula, renderTemplate } from './formula';
import type { FormulaScope } from './formula';

// ---------------------------------------------------------------------------
// Inputs / Outputs
// ---------------------------------------------------------------------------

export interface ScopeItemResult {
  /** Scope item def id this came from */
  scopeItemId: string;
  /** Trade id */
  tradeId: string;
  /** Display category */
  category: string;
  /** Resolved description (with {var} substitutions) */
  description: string;
  /** Output quantity */
  quantity: number;
  /** Unit of measure */
  unit: string;
  /** Material unit cost */
  unitCost: number;
  /** Material total = quantity × unitCost */
  materialTotal: number;
  /** Labor hours */
  laborHours: number;
  /** Labor rate ($/hr) */
  laborRate: number;
  /** Labor total = laborHours × laborRate */
  laborTotal: number;
  /** Sum of materialTotal + laborTotal */
  lineTotal: number;
  /** semantic tags this item consumed (for traceability) */
  sourceMeasurementTags: string[];
  /** assumption keys this item consumed */
  sourceAssumptionKeys: string[];
}

export interface EstimateInput {
  module: TradeModule;
  measurements: Measurement[];
  /** Map of assumption key → user-confirmed value (string) */
  assumptions: Record<string, string>;
  /** Cost database (typically the contents of config/default_costs.json) */
  costs: CostDatabase;
}

export interface EstimateOutput {
  tradeId: string;
  items: ScopeItemResult[];
  /** Scope items that were skipped, with the reason */
  skipped: { scopeItemId: string; reason: string }[];
}

// ---------------------------------------------------------------------------
// Cost database
// ---------------------------------------------------------------------------

interface CostEntry {
  unit: string;
  cost: number;
}

export interface CostDatabase {
  labor_rates?: Record<string, number>;
  /** All other top-level keys are sections with cost entries */
  [section: string]: Record<string, CostEntry> | Record<string, number> | undefined;
}

function lookupCost(
  db: CostDatabase,
  section: string,
  key: string,
  fallback = 0
): number {
  const sec = db[section];
  if (!sec || typeof sec !== 'object') return fallback;
  const entry = (sec as Record<string, CostEntry>)[key];
  if (!entry || typeof entry.cost !== 'number') return fallback;
  return entry.cost;
}

function lookupLaborRate(db: CostDatabase, key: string, fallback = 50): number {
  const rates = db.labor_rates as Record<string, number> | undefined;
  if (!rates || typeof rates[key] !== 'number') return fallback;
  return rates[key];
}

// ---------------------------------------------------------------------------
// Measurement aggregation
// ---------------------------------------------------------------------------

/**
 * Sum measurement result values by semantic tag.
 * Multiple measurements with the same tag (e.g., user measured the eave
 * on three different elevations) are summed automatically.
 */
function aggregateMeasurements(measurements: Measurement[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of measurements) {
    const tag = m.semanticTag;
    if (!tag) continue;
    out[tag] = (out[tag] ?? 0) + m.resultValue;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Assumption variables
// ---------------------------------------------------------------------------

/**
 * Build the variable bindings contributed by assumptions. For each
 * confirmed assumption, expose:
 *   - the assumption key with its raw string value
 *   - any numeric `vars` defined on the selected option (R-value, waste, etc.)
 */
function expandAssumptionVars(
  module: TradeModule,
  assumptions: Record<string, string>
): FormulaScope {
  const scope: FormulaScope = {};
  for (const a of module.requiredAssumptions) {
    const value = assumptions[a.key] ?? a.default ?? '';
    scope[a.key] = value;
    const opt = a.options.find((o) => o.value === value);
    if (opt?.vars) {
      for (const [k, v] of Object.entries(opt.vars)) {
        scope[k] = v;
      }
    }
  }
  return scope;
}

// ---------------------------------------------------------------------------
// Scope-item evaluation
// ---------------------------------------------------------------------------

function evaluateScopeItem(
  def: ScopeItemDef,
  module: TradeModule,
  ctx: {
    measurements: Record<string, number>;
    assumptionVars: FormulaScope;
    costs: CostDatabase;
  }
): ScopeItemResult | { skip: string } {
  // Check required measurements
  for (const tag of def.requiredMeasurements) {
    if (!(tag in ctx.measurements) || ctx.measurements[tag] === 0) {
      return { skip: `missing measurement '${tag}'` };
    }
  }

  // Build scope: defaults < measurements < assumption vars
  const scope: FormulaScope = {
    ...(def.defaults ?? {}),
    ...ctx.measurements,
    ...ctx.assumptionVars,
  };

  // Gate by `applies` if present
  if (def.applies) {
    try {
      if (!evalBool(def.applies, scope)) {
        return { skip: `applies=false (${def.applies})` };
      }
    } catch (err) {
      return { skip: `applies error: ${(err as Error).message}` };
    }
  }

  // Quantity
  let quantity: number;
  try {
    quantity = evalNumber(def.quantity, scope);
  } catch (err) {
    return { skip: `quantity error: ${(err as Error).message}` };
  }
  if (quantity <= 0) return { skip: `quantity <= 0 (${quantity})` };

  // Unit cost
  const costSection = def.costSection ?? module.tradeId;
  let unitCost = 0;
  if (def.unitCost) {
    try {
      unitCost = evalNumber(def.unitCost, scope);
    } catch (err) {
      return { skip: `unitCost error: ${(err as Error).message}` };
    }
  } else if (def.costKey) {
    let key = def.costKey;
    // Allow {var} substitution in cost keys for type-driven lookups
    if (key.includes('{')) {
      key = renderTemplate(key, scope);
    }
    unitCost = lookupCost(ctx.costs, costSection, key, scope.fallback_unit_cost as number ?? 0);
  }

  // Labor
  let laborHours = 0;
  if (def.laborHours) {
    try {
      laborHours = evalNumber(def.laborHours, scope);
    } catch (err) {
      return { skip: `laborHours error: ${(err as Error).message}` };
    }
  }
  let laborRate: number;
  if (def.laborRate) {
    try {
      laborRate = evalNumber(def.laborRate, scope);
    } catch {
      laborRate = lookupLaborRate(ctx.costs, module.laborRateKey);
    }
  } else {
    laborRate = lookupLaborRate(ctx.costs, module.laborRateKey);
  }

  const materialTotal = round2(quantity * unitCost);
  const laborTotal = round2(laborHours * laborRate);
  const lineTotal = round2(materialTotal + laborTotal);

  return {
    scopeItemId: def.id,
    tradeId: module.tradeId,
    category: def.category,
    description: renderTemplate(def.description, scope),
    quantity: round2(quantity),
    unit: def.unit,
    unitCost: round4(unitCost),
    materialTotal,
    laborHours: round2(laborHours),
    laborRate: round2(laborRate),
    laborTotal,
    lineTotal,
    sourceMeasurementTags: def.requiredMeasurements,
    sourceAssumptionKeys: collectIdents(def.applies, def.quantity, def.laborHours)
      .filter((id) => id in ctx.assumptionVars),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Cheap-and-dirty identifier extraction for traceability. */
function collectIdents(...formulas: (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const f of formulas) {
    if (!f) continue;
    const matches = f.match(/[a-zA-Z_][a-zA-Z0-9_]*/g);
    if (matches) for (const m of matches) out.add(m);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateEstimate(input: EstimateInput): EstimateOutput {
  const { module, measurements, assumptions, costs } = input;

  // Filter measurements to those associated with this trade.
  const relevant = measurements.filter(
    (m) => m.tradeAssociations?.includes(module.tradeId) ?? m.trade === module.tradeId
  );
  const measurementVars = aggregateMeasurements(relevant);
  const assumptionVars = expandAssumptionVars(module, assumptions);

  const items: ScopeItemResult[] = [];
  const skipped: { scopeItemId: string; reason: string }[] = [];

  for (const def of module.scopeItems) {
    const result = evaluateScopeItem(def, module, {
      measurements: measurementVars,
      assumptionVars,
      costs,
    });
    if ('skip' in result) {
      skipped.push({ scopeItemId: def.id, reason: result.skip });
    } else {
      items.push(result);
    }
  }

  return { tradeId: module.tradeId, items, skipped };
}

/** Re-export for callers that need to evaluate ad-hoc formulas. */
export { evalFormula, evalNumber, evalBool, renderTemplate };
