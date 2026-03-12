/**
 * Extended line item type used in the spreadsheet view.
 * Includes computed fields that mirror the Excel formulas from export_xlsx.py.
 */
export interface SpreadsheetLineItem {
  id: string;
  trade: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;

  // Input fields
  unitCost: number;
  laborRatePct: number;
  unitPrice: number;

  // Computed fields
  materialTotal: number;
  materialPct: number;
  laborTotal: number;
  laborPct: number;
  laborPlusMaterials: number;
  amount: number;
  grossProfit: number;
  /** Gross profit margin as a decimal (0-1) */
  gpm: number;

  // Metadata
  sortOrder: number;
  isUserAdded: boolean;
}

export interface TradeSubtotal {
  trade: string;
  materialTotal: number;
  laborTotal: number;
  laborPlusMaterials: number;
  amount: number;
  grossProfit: number;
  gpm: number;
}

export interface GrandTotal {
  materialTotal: number;
  laborTotal: number;
  laborPlusMaterials: number;
  amount: number;
  grossProfit: number;
  gpm: number;
}
