/**
 * Trade Module — config-driven definition of how a single trade is estimated.
 *
 * The core agent and rules engine are trade-agnostic. Adding a new trade is a
 * config exercise, not engineering: drop a new JSON module, register it, ship.
 *
 * Each module supplies:
 *   - prompt extension (appended to the agent's base prompt)
 *   - sheet relevance (which sheet types matter)
 *   - required measurements (what semantic tags the user must capture)
 *   - required assumptions (what the agent must confirm)
 *   - scope items (line-item formulas the rules engine evaluates)
 */

import type { Relevance, SheetType } from '@/lib/types/sheet-manifest';
import type { MeasurementMode } from '@/lib/types/measurement';

// ---------------------------------------------------------------------------
// Sheet relevance
// ---------------------------------------------------------------------------

export interface SheetRelevanceSpec {
  primary: SheetType[];
  secondary: SheetType[];
  irrelevant?: SheetType[];
}

// ---------------------------------------------------------------------------
// Measurements the agent must collect
// ---------------------------------------------------------------------------

export interface RequiredMeasurement {
  /** Canonical semantic tag the rules engine references (e.g. 'exterior_wall_area') */
  tag: string;
  /** Human-readable label */
  label: string;
  /** Measurement mode required: linear, area, surface_area */
  mode: MeasurementMode;
  /** Sheet types where this is typically taken (in priority order) */
  preferredSheets: SheetType[];
  /** Order in which the agent should request this (lower = sooner) */
  priority: number;
  /** Optional bounds for sanity checking */
  bounds?: { min?: number; max?: number; unit: string };
}

// ---------------------------------------------------------------------------
// Assumptions the agent must confirm
// ---------------------------------------------------------------------------

export interface AssumptionOption {
  value: string;
  label: string;
  /**
   * Optional numeric overrides applied when this option is selected. Used
   * by formulas (e.g., R-value, thickness, waste factor) without forcing
   * the agent to ask separate numeric questions.
   */
  vars?: Record<string, number>;
}

export interface RequiredAssumption {
  /** Variable name available in formulas */
  key: string;
  /** Question presented to the user */
  prompt: string;
  /** Allowed values (for radio/select UX) */
  options: AssumptionOption[];
  /** Default value if the agent has no signal */
  default?: string;
}

// ---------------------------------------------------------------------------
// Scope items
// ---------------------------------------------------------------------------

/**
 * A scope item defines one estimate line item. The rules engine evaluates
 * the scope item's formulas against the project state (measurements +
 * assumptions + constants + cost lookups) and emits a ScopeItem result.
 *
 * `applies` is a formula that must evaluate to a truthy value for the
 * scope item to be included. Use it to gate items behind assumptions
 * (e.g., `applies: "vapor_barrier_required == 1"`).
 */
export interface ScopeItemDef {
  /** Stable id (used in references and persistence) */
  id: string;
  /** Display description; supports {var} substitution from assumptions */
  description: string;
  /** Display category (e.g. "Wall Insulation", "Vapor Barrier") */
  category: string;
  /** Output unit (e.g. "sf", "lf", "ea", "bf") */
  unit: string;

  /** Required semantic measurement tags. Missing → scope item is skipped. */
  requiredMeasurements: string[];

  /**
   * Optional condition that gates this scope item. Evaluated against the
   * full variable context. Truthy = include, falsy = skip.
   * Example: "wall_insulation_type == 'batt'"
   */
  applies?: string;

  /** Formula producing the output quantity (in `unit`) */
  quantity: string;

  /**
   * Where to look up the unit material cost. Either a fixed key into the
   * cost database, or a formula that produces a key (use lookup() — see
   * formula docs).
   */
  costKey?: string;

  /** Optional formula override for unit cost (skip cost-db lookup) */
  unitCost?: string;

  /** Section in the cost db (e.g. "insulation"). Defaults to the trade id. */
  costSection?: string;

  /** Labor hours formula. Typical pattern: quantity / production_rate */
  laborHours?: string;

  /** Labor rate formula or constant. Defaults to the trade's labor rate. */
  laborRate?: string;

  /**
   * Constant defaults available as variables in formulas (waste factors,
   * production rates, fallback unit costs, etc.).
   */
  defaults?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Trade module
// ---------------------------------------------------------------------------

export interface TradeModule {
  /** Stable trade id (must match the trade id used in measurements) */
  tradeId: string;
  /** Display name */
  displayName: string;
  /** Schema version (for future migration) */
  version: number;

  /** Appended to the agent base prompt when this trade is active */
  promptExtension: string;

  sheetRelevance: SheetRelevanceSpec;
  requiredMeasurements: RequiredMeasurement[];
  requiredAssumptions: RequiredAssumption[];
  scopeItems: ScopeItemDef[];

  /** Default labor rate key in cost-db labor_rates (e.g. "insulation_installer") */
  laborRateKey: string;

  /** Glossary of trade-specific terms (used by the agent for clarity) */
  glossary?: Record<string, string>;

  /** Patterns the agent should watch for in this trade */
  commonInconsistencies?: string[];
}

/**
 * Helper to produce a typed Record from a SheetRelevanceSpec for easy lookup.
 */
export function expandSheetRelevance(spec: SheetRelevanceSpec): Record<string, Relevance> {
  const out: Record<string, Relevance> = {};
  for (const s of spec.primary) out[s] = 'primary';
  for (const s of spec.secondary) out[s] = 'secondary';
  for (const s of spec.irrelevant ?? []) out[s] = 'irrelevant';
  return out;
}
