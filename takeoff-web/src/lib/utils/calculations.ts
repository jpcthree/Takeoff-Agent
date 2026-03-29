import type { SpreadsheetLineItem, TradeSubtotal, GrandTotal } from '@/lib/types/line-item';
import type { LineItemDict } from '@/lib/api/python-service';

export interface RowCalculation {
  materialTotal: number;
  materialPct: number;
  laborTotal: number;
  laborPct: number;
  laborPlusMaterials: number;
  amount: number;
  grossProfit: number;
  gpm: number;
}

/**
 * Calculate computed fields for a single spreadsheet row.
 * Mirrors the Excel formulas from export_xlsx.py.
 *
 * @param qty - Quantity of the item
 * @param unitCost - Material unit cost
 * @param laborRatePct - Labor rate as a percentage of material cost (e.g. 35 = 35%)
 * @param unitPrice - Selling price per unit
 */
export function calculateRow(
  qty: number,
  unitCost: number,
  laborRatePct: number,
  unitPrice: number
): RowCalculation {
  const materialTotal = qty * unitCost;
  const laborTotal = materialTotal * (laborRatePct / 100);
  const laborPlusMaterials = materialTotal + laborTotal;
  const amount = qty * unitPrice;
  const grossProfit = amount - laborPlusMaterials;
  const gpm = amount > 0 ? grossProfit / amount : 0;

  // Percentages relative to labor+materials
  const materialPct = laborPlusMaterials > 0 ? materialTotal / laborPlusMaterials : 0;
  const laborPct = laborPlusMaterials > 0 ? laborTotal / laborPlusMaterials : 0;

  return {
    materialTotal,
    materialPct,
    laborTotal,
    laborPct,
    laborPlusMaterials,
    amount,
    grossProfit,
    gpm,
  };
}

/**
 * Calculate subtotals for each trade from an array of row calculations.
 */
export function calculateSubtotal(
  rows: Array<{ trade: string; sheets?: number } & RowCalculation>
): TradeSubtotal[] {
  const byTrade = new Map<string, TradeSubtotal>();

  for (const row of rows) {
    const existing = byTrade.get(row.trade);
    if (existing) {
      existing.materialTotal += row.materialTotal;
      existing.laborTotal += row.laborTotal;
      existing.laborPlusMaterials += row.laborPlusMaterials;
      existing.amount += row.amount;
      existing.grossProfit += row.grossProfit;
      existing.sheets += (row.sheets || 0);
    } else {
      byTrade.set(row.trade, {
        trade: row.trade,
        materialTotal: row.materialTotal,
        laborTotal: row.laborTotal,
        laborPlusMaterials: row.laborPlusMaterials,
        amount: row.amount,
        grossProfit: row.grossProfit,
        gpm: 0,
        sheets: row.sheets || 0,
      });
    }
  }

  // Recalculate GPM for each trade subtotal
  for (const subtotal of byTrade.values()) {
    subtotal.gpm = subtotal.amount > 0
      ? subtotal.grossProfit / subtotal.amount
      : 0;
  }

  return Array.from(byTrade.values());
}

/**
 * Calculate grand totals from an array of trade subtotals.
 */
export function calculateGrandTotal(subtotals: TradeSubtotal[]): GrandTotal {
  const total: GrandTotal = {
    materialTotal: 0,
    laborTotal: 0,
    laborPlusMaterials: 0,
    amount: 0,
    grossProfit: 0,
    gpm: 0,
    sheets: 0,
  };

  for (const sub of subtotals) {
    total.materialTotal += sub.materialTotal;
    total.laborTotal += sub.laborTotal;
    total.laborPlusMaterials += sub.laborPlusMaterials;
    total.amount += sub.amount;
    total.grossProfit += sub.grossProfit;
    total.sheets += sub.sheets;
  }

  total.gpm = total.amount > 0 ? total.grossProfit / total.amount : 0;

  return total;
}

/**
 * Convert a LineItemDict from the Python API into a SpreadsheetLineItem.
 * Sets user-input fields (unitCost, laborRatePct, unitPrice) to defaults
 * that can be edited by the user in the spreadsheet.
 */
export function pythonLineItemToSpreadsheet(
  item: LineItemDict,
  index: number
): SpreadsheetLineItem {
  // Unit cost blank by default — user enters manually or uploads pricing
  const unitCost = 0;
  const quantity = item.quantity || 0;
  const materialTotal = quantity * unitCost;

  // Labor rate as 0% by default (user inputs their own)
  const laborRatePct = 0;
  // Unit price defaults to 0 (user inputs their own)
  const unitPrice = 0;

  const laborTotal = 0; // laborRatePct * amount, but amount is 0
  const laborPlusMaterials = materialTotal + laborTotal;
  const amount = quantity * unitPrice;
  const grossProfit = amount - laborPlusMaterials;
  const gpm = amount > 0 ? grossProfit / amount : 0;
  const materialPct = laborPlusMaterials > 0 ? materialTotal / laborPlusMaterials : 0;
  const laborPct = laborPlusMaterials > 0 ? laborTotal / laborPlusMaterials : 0;

  return {
    id: `item-${index}-${Date.now()}`,
    trade: item.trade,
    category: item.category,
    description: item.description,
    quantity,
    unit: item.unit,
    unitCost,
    laborRatePct,
    unitPrice,
    materialTotal,
    materialPct,
    laborTotal,
    laborPct,
    laborPlusMaterials,
    amount,
    grossProfit,
    gpm,
    codeRequirement: item.code_requirement || '',
    sheets: item.sheets || 0,
    sortOrder: index,
    isUserAdded: false,
  };
}
