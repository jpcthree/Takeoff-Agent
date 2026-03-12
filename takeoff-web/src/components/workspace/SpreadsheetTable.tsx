'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SpreadsheetToolbar } from './SpreadsheetToolbar';
import type {
  SpreadsheetLineItem,
  TradeSubtotal,
  GrandTotal,
} from '@/lib/types/line-item';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function makeMockItems(): SpreadsheetLineItem[] {
  const raw: Omit<SpreadsheetLineItem, 'materialTotal' | 'materialPct' | 'laborTotal' | 'laborPct' | 'laborPlusMaterials' | 'amount' | 'grossProfit' | 'gpm'>[] = [
    { id: '1', trade: 'Insulation', category: 'Batts', description: 'R-19 Kraft-Faced Batts (6.25")', quantity: 1200, unit: 'SF', unitCost: 0.85, laborRatePct: 35, unitPrice: 1.60, sortOrder: 1, isUserAdded: false },
    { id: '2', trade: 'Insulation', category: 'Batts', description: 'R-13 Kraft-Faced Batts (3.5")', quantity: 2400, unit: 'SF', unitCost: 0.62, laborRatePct: 35, unitPrice: 1.20, sortOrder: 2, isUserAdded: false },
    { id: '3', trade: 'Insulation', category: 'Blown-In', description: 'R-38 Blown-In Attic Insulation', quantity: 1600, unit: 'SF', unitCost: 1.10, laborRatePct: 40, unitPrice: 2.25, sortOrder: 3, isUserAdded: false },
    { id: '4', trade: 'Insulation', category: 'House Wrap', description: 'House Wrap (Tyvek)', quantity: 2200, unit: 'SF', unitCost: 0.22, laborRatePct: 30, unitPrice: 0.45, sortOrder: 4, isUserAdded: false },
    { id: '5', trade: 'Drywall', category: 'Sheets', description: '4x8 1/2" Drywall Sheets', quantity: 180, unit: 'EA', unitCost: 12.50, laborRatePct: 45, unitPrice: 28.00, sortOrder: 5, isUserAdded: false },
    { id: '6', trade: 'Drywall', category: 'Sheets', description: '4x8 5/8" Moisture Resistant', quantity: 24, unit: 'EA', unitCost: 16.75, laborRatePct: 45, unitPrice: 36.00, sortOrder: 6, isUserAdded: false },
    { id: '7', trade: 'Drywall', category: 'Finishing', description: 'Joint Compound (5-gal)', quantity: 12, unit: 'EA', unitCost: 14.00, laborRatePct: 50, unitPrice: 32.00, sortOrder: 7, isUserAdded: false },
    { id: '8', trade: 'Drywall', category: 'Finishing', description: 'Paper Joint Tape (500ft rolls)', quantity: 8, unit: 'EA', unitCost: 4.50, laborRatePct: 50, unitPrice: 10.00, sortOrder: 8, isUserAdded: false },
    { id: '9', trade: 'Drywall', category: 'Finishing', description: 'Corner Bead (8ft)', quantity: 45, unit: 'EA', unitCost: 3.25, laborRatePct: 50, unitPrice: 7.50, sortOrder: 9, isUserAdded: false },
    { id: '10', trade: 'Roofing', category: 'Shingles', description: 'Architectural Shingles (bundle)', quantity: 72, unit: 'EA', unitCost: 35.00, laborRatePct: 40, unitPrice: 72.00, sortOrder: 10, isUserAdded: false },
    { id: '11', trade: 'Roofing', category: 'Underlayment', description: 'Synthetic Underlayment (10 sq roll)', quantity: 6, unit: 'EA', unitCost: 85.00, laborRatePct: 35, unitPrice: 165.00, sortOrder: 11, isUserAdded: false },
    { id: '12', trade: 'Roofing', category: 'Flashing', description: 'Drip Edge Flashing (10ft)', quantity: 28, unit: 'EA', unitCost: 8.50, laborRatePct: 40, unitPrice: 18.00, sortOrder: 12, isUserAdded: false },
    { id: '13', trade: 'Roofing', category: 'Flashing', description: 'Step Flashing (pc)', quantity: 40, unit: 'EA', unitCost: 2.75, laborRatePct: 40, unitPrice: 6.00, sortOrder: 13, isUserAdded: false },
  ];

  return raw.map(computeItem);
}

function computeItem(
  item: Omit<SpreadsheetLineItem, 'materialTotal' | 'materialPct' | 'laborTotal' | 'laborPct' | 'laborPlusMaterials' | 'amount' | 'grossProfit' | 'gpm'>
): SpreadsheetLineItem {
  const materialTotal = item.quantity * item.unitCost;
  const laborTotal = materialTotal * (item.laborRatePct / 100);
  const laborPlusMaterials = materialTotal + laborTotal;
  const amount = item.quantity * item.unitPrice;
  const grossProfit = amount - laborPlusMaterials;
  const gpm = amount > 0 ? grossProfit / amount : 0;
  const materialPct = laborPlusMaterials > 0 ? materialTotal / laborPlusMaterials : 0;
  const laborPct = laborPlusMaterials > 0 ? laborTotal / laborPlusMaterials : 0;

  return {
    ...item,
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

// ---------------------------------------------------------------------------
// Columns config
// ---------------------------------------------------------------------------
const COLUMNS = [
  { key: 'category', label: 'Category', width: 'w-[120px]' },
  { key: 'description', label: 'Description', width: 'min-w-[200px] flex-1' },
  { key: 'quantity', label: 'Qty', width: 'w-[70px]', align: 'right' as const },
  { key: 'unit', label: 'Unit', width: 'w-[60px]', align: 'center' as const },
  { key: 'unitCost', label: 'Unit Cost', width: 'w-[90px]', align: 'right' as const, editable: true },
  { key: 'materialTotal', label: 'Material Total', width: 'w-[100px]', align: 'right' as const },
  { key: 'materialPct', label: 'Mat %', width: 'w-[70px]', align: 'right' as const },
  { key: 'laborRatePct', label: 'Labor Rate', width: 'w-[85px]', align: 'right' as const, editable: true },
  { key: 'laborTotal', label: 'Labor Total', width: 'w-[100px]', align: 'right' as const },
  { key: 'laborPct', label: 'Lab %', width: 'w-[70px]', align: 'right' as const },
  { key: 'laborPlusMaterials', label: 'L+M Cost', width: 'w-[100px]', align: 'right' as const },
  { key: 'unitPrice', label: 'Unit Price', width: 'w-[90px]', align: 'right' as const, editable: true },
  { key: 'amount', label: 'Amount', width: 'w-[100px]', align: 'right' as const },
  { key: 'grossProfit', label: 'Gross Profit', width: 'w-[100px]', align: 'right' as const },
  { key: 'gpm', label: 'GPM', width: 'w-[70px]', align: 'right' as const },
];

function formatCurrency(val: number): string {
  return val.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

function formatPct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

function formatLaborRate(val: number): string {
  return `${val.toFixed(0)}%`;
}

function getCellValue(item: SpreadsheetLineItem, key: string): string {
  switch (key) {
    case 'category':
      return item.category;
    case 'description':
      return item.description;
    case 'quantity':
      return item.quantity.toLocaleString();
    case 'unit':
      return item.unit;
    case 'unitCost':
      return formatCurrency(item.unitCost);
    case 'materialTotal':
      return formatCurrency(item.materialTotal);
    case 'materialPct':
      return formatPct(item.materialPct);
    case 'laborRatePct':
      return formatLaborRate(item.laborRatePct);
    case 'laborTotal':
      return formatCurrency(item.laborTotal);
    case 'laborPct':
      return formatPct(item.laborPct);
    case 'laborPlusMaterials':
      return formatCurrency(item.laborPlusMaterials);
    case 'unitPrice':
      return formatCurrency(item.unitPrice);
    case 'amount':
      return formatCurrency(item.amount);
    case 'grossProfit':
      return formatCurrency(item.grossProfit);
    case 'gpm':
      return formatPct(item.gpm);
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
function SpreadsheetTable() {
  const [items, setItems] = useState<SpreadsheetLineItem[]>(makeMockItems);
  const [collapsedTrades, setCollapsedTrades] = useState<Set<string>>(
    new Set()
  );
  const [editingCell, setEditingCell] = useState<{
    id: string;
    key: string;
  } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [visibleTrades, setVisibleTrades] = useState<Set<string> | null>(null);

  const trades = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const item of items) {
      if (!seen.has(item.trade)) {
        seen.add(item.trade);
        order.push(item.trade);
      }
    }
    return order;
  }, [items]);

  const tradeSubtotals = useMemo((): Record<string, TradeSubtotal> => {
    const map: Record<string, TradeSubtotal> = {};
    for (const trade of trades) {
      const tradeItems = items.filter((i) => i.trade === trade);
      const materialTotal = tradeItems.reduce(
        (s, i) => s + i.materialTotal,
        0
      );
      const laborTotal = tradeItems.reduce((s, i) => s + i.laborTotal, 0);
      const laborPlusMaterials = materialTotal + laborTotal;
      const amount = tradeItems.reduce((s, i) => s + i.amount, 0);
      const grossProfit = amount - laborPlusMaterials;
      const gpm = amount > 0 ? grossProfit / amount : 0;
      map[trade] = {
        trade,
        materialTotal,
        laborTotal,
        laborPlusMaterials,
        amount,
        grossProfit,
        gpm,
      };
    }
    return map;
  }, [items, trades]);

  const grandTotal = useMemo((): GrandTotal => {
    const materialTotal = Object.values(tradeSubtotals).reduce(
      (s, t) => s + t.materialTotal,
      0
    );
    const laborTotal = Object.values(tradeSubtotals).reduce(
      (s, t) => s + t.laborTotal,
      0
    );
    const laborPlusMaterials = materialTotal + laborTotal;
    const amount = Object.values(tradeSubtotals).reduce(
      (s, t) => s + t.amount,
      0
    );
    const grossProfit = amount - laborPlusMaterials;
    const gpm = amount > 0 ? grossProfit / amount : 0;
    return { materialTotal, laborTotal, laborPlusMaterials, amount, grossProfit, gpm };
  }, [tradeSubtotals]);

  const toggleTrade = useCallback((trade: string) => {
    setCollapsedTrades((prev) => {
      const next = new Set(prev);
      if (next.has(trade)) {
        next.delete(trade);
      } else {
        next.add(trade);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsedTrades(new Set()), []);
  const collapseAll = useCallback(
    () => setCollapsedTrades(new Set(trades)),
    [trades]
  );

  const startEdit = (id: string, key: string, currentValue: number) => {
    setEditingCell({ id, key });
    setEditValue(String(currentValue));
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const numVal = parseFloat(editValue);
    if (isNaN(numVal)) {
      setEditingCell(null);
      return;
    }

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== editingCell.id) return item;
        const updated = { ...item, [editingCell.key]: numVal };
        return computeItem(updated);
      })
    );
    setEditingCell(null);
  };

  const filteredTrades = visibleTrades
    ? trades.filter((t) => visibleTrades.has(t))
    : trades;

  const alignClass = (align?: string) => {
    if (align === 'right') return 'text-right';
    if (align === 'center') return 'text-center';
    return 'text-left';
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <SpreadsheetToolbar
        trades={trades}
        visibleTrades={visibleTrades}
        onVisibleTradesChange={setVisibleTrades}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
      />

      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="border-collapse tabular-nums text-xs" style={{ minWidth: 1400 }}>
          {/* Header */}
          <thead className="sticky top-0 z-10">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={[
                    'bg-[#2F5496] text-white px-2 py-2 font-semibold whitespace-nowrap border-r border-[#1F3864] last:border-r-0',
                    col.width,
                    alignClass(col.align),
                  ].join(' ')}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredTrades.map((trade) => {
              const isCollapsed = collapsedTrades.has(trade);
              const tradeItems = items.filter((i) => i.trade === trade);
              const sub = tradeSubtotals[trade];

              return (
                <React.Fragment key={trade}>
                  {/* Trade header row */}
                  <tr
                    onClick={() => toggleTrade(trade)}
                    className="bg-[#D6E4F0] cursor-pointer hover:bg-[#c5d8ec] select-none"
                  >
                    <td
                      colSpan={COLUMNS.length}
                      className="px-2 py-2 font-semibold text-gray-800"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        {trade}
                        <span className="font-normal text-gray-500 ml-2">
                          ({tradeItems.length} items)
                        </span>
                      </span>
                    </td>
                  </tr>

                  {/* Item rows */}
                  {!isCollapsed &&
                    tradeItems.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        {COLUMNS.map((col) => {
                          const isEditing =
                            editingCell?.id === item.id &&
                            editingCell?.key === col.key;
                          const isEditable = col.editable;

                          return (
                            <td
                              key={col.key}
                              className={[
                                'px-2 py-1.5 whitespace-nowrap border-r border-gray-100 last:border-r-0',
                                col.width,
                                alignClass(col.align),
                                isEditable && !isEditing
                                  ? 'bg-[#FFF2CC] cursor-pointer'
                                  : '',
                              ].join(' ')}
                              onClick={() => {
                                if (isEditable && !isEditing) {
                                  const rawVal =
                                    item[
                                      col.key as keyof SpreadsheetLineItem
                                    ] as number;
                                  startEdit(item.id, col.key, rawVal);
                                }
                              }}
                            >
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="any"
                                  value={editValue}
                                  onChange={(e) =>
                                    setEditValue(e.target.value)
                                  }
                                  onBlur={commitEdit}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitEdit();
                                    if (e.key === 'Escape')
                                      setEditingCell(null);
                                  }}
                                  autoFocus
                                  className="w-full bg-white border border-primary rounded px-1 py-0.5 text-right text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              ) : (
                                getCellValue(item, col.key)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}

                  {/* Subtotal row */}
                  {!isCollapsed && sub && (
                    <tr className="bg-[#E2EFDA] font-semibold">
                      <td className="px-2 py-1.5 border-r border-gray-200" />
                      <td className="px-2 py-1.5 border-r border-gray-200">
                        {trade} Subtotal
                      </td>
                      <td className="px-2 py-1.5 border-r border-gray-200" />
                      <td className="px-2 py-1.5 border-r border-gray-200" />
                      <td className="px-2 py-1.5 border-r border-gray-200" />
                      <td className="px-2 py-1.5 text-right border-r border-gray-200">
                        {formatCurrency(sub.materialTotal)}
                      </td>
                      <td className="px-2 py-1.5 border-r border-gray-200" />
                      <td className="px-2 py-1.5 border-r border-gray-200" />
                      <td className="px-2 py-1.5 text-right border-r border-gray-200">
                        {formatCurrency(sub.laborTotal)}
                      </td>
                      <td className="px-2 py-1.5 border-r border-gray-200" />
                      <td className="px-2 py-1.5 text-right border-r border-gray-200">
                        {formatCurrency(sub.laborPlusMaterials)}
                      </td>
                      <td className="px-2 py-1.5 border-r border-gray-200" />
                      <td className="px-2 py-1.5 text-right border-r border-gray-200">
                        {formatCurrency(sub.amount)}
                      </td>
                      <td className="px-2 py-1.5 text-right border-r border-gray-200">
                        {formatCurrency(sub.grossProfit)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {formatPct(sub.gpm)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* Grand total row */}
            <tr className="bg-[#1F3864] text-white font-semibold">
              <td className="px-2 py-2 border-r border-[#1a2f56]" />
              <td className="px-2 py-2 border-r border-[#1a2f56]">
                Grand Total
              </td>
              <td className="px-2 py-2 border-r border-[#1a2f56]" />
              <td className="px-2 py-2 border-r border-[#1a2f56]" />
              <td className="px-2 py-2 border-r border-[#1a2f56]" />
              <td className="px-2 py-2 text-right border-r border-[#1a2f56]">
                {formatCurrency(grandTotal.materialTotal)}
              </td>
              <td className="px-2 py-2 border-r border-[#1a2f56]" />
              <td className="px-2 py-2 border-r border-[#1a2f56]" />
              <td className="px-2 py-2 text-right border-r border-[#1a2f56]">
                {formatCurrency(grandTotal.laborTotal)}
              </td>
              <td className="px-2 py-2 border-r border-[#1a2f56]" />
              <td className="px-2 py-2 text-right border-r border-[#1a2f56]">
                {formatCurrency(grandTotal.laborPlusMaterials)}
              </td>
              <td className="px-2 py-2 border-r border-[#1a2f56]" />
              <td className="px-2 py-2 text-right border-r border-[#1a2f56]">
                {formatCurrency(grandTotal.amount)}
              </td>
              <td className="px-2 py-2 text-right border-r border-[#1a2f56]">
                {formatCurrency(grandTotal.grossProfit)}
              </td>
              <td className="px-2 py-2 text-right">
                {formatPct(grandTotal.gpm)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { SpreadsheetTable };
