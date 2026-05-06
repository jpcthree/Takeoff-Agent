/**
 * V2 export adapter — bridges scope items + legacy line items into the
 * LineItemDict shape the Python /api/export endpoint expects.
 *
 * Scope items (produced by the v2 rules engine) and the legacy line items
 * coexist in the store during the v1 → v2 transition. This util collects
 * both into a single deduplicated export payload, preferring scope items
 * when an item has the same trade + description in both flows.
 */

import type { LineItemDict } from '@/lib/api/python-service';
import type { ScopeItem } from '@/lib/types/project';
import type { SpreadsheetLineItem } from '@/lib/types/line-item';

/** Convert a single ScopeItem into the LineItemDict shape used by the exporter. */
function scopeItemToDict(s: ScopeItem): LineItemDict {
  return {
    trade: s.tradeId,
    category: s.category ?? '',
    description: s.description,
    quantity: s.quantity,
    unit: s.unit,
    material_unit_cost: s.unitCost,
    material_total: s.materialTotal,
    labor_hours: s.laborHours,
    labor_rate: s.laborRate,
    labor_total: s.laborTotal,
    line_total: s.lineTotal,
  };
}

/** Convert a legacy SpreadsheetLineItem into LineItemDict. */
function lineItemToDict(item: SpreadsheetLineItem): LineItemDict {
  return {
    trade: item.trade,
    category: item.category ?? '',
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    material_unit_cost: item.unitCost,
    material_total: item.materialTotal,
    labor_hours: 0,
    labor_rate: item.laborRatePct,
    labor_total: item.laborTotal,
    line_total: item.amount,
    sheets: item.trade === 'drywall' ? 1 : undefined,
  };
}

/**
 * Build the export payload. ScopeItems take precedence — for any
 * (trade, description) covered by a scope item, the legacy line item is
 * suppressed to avoid double-counting during the transition.
 */
export function buildExportItems(
  scopeItems: ScopeItem[],
  lineItems: SpreadsheetLineItem[]
): LineItemDict[] {
  const scopeKeys = new Set<string>();
  const out: LineItemDict[] = [];

  for (const s of scopeItems) {
    scopeKeys.add(`${s.tradeId}::${s.description}`);
    out.push(scopeItemToDict(s));
  }

  for (const li of lineItems) {
    const key = `${li.trade}::${li.description}`;
    if (scopeKeys.has(key)) continue;
    out.push(lineItemToDict(li));
  }

  return out;
}
