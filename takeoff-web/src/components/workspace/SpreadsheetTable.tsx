'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SpreadsheetToolbar } from './SpreadsheetToolbar';
import { useProjectStore } from '@/hooks/useProjectStore';
import { useSpreadsheetKeyboard, type RowMeta } from '@/hooks/useSpreadsheetKeyboard';
import { getTradeLabel } from '@/lib/api/python-service';
import type {
  SpreadsheetLineItem,
  TradeSubtotal,
  GrandTotal,
} from '@/lib/types/line-item';

// ---------------------------------------------------------------------------
// Recompute derived fields from user-editable inputs
// ---------------------------------------------------------------------------
function computeItem(
  item: Omit<SpreadsheetLineItem, 'materialTotal' | 'materialPct' | 'laborTotal' | 'laborPct' | 'laborPlusMaterials' | 'amount' | 'grossProfit' | 'gpm'>
): SpreadsheetLineItem {
  const materialTotal = item.quantity * item.unitCost;
  const amount = item.quantity * item.unitPrice;
  const laborTotal = (item.laborRatePct / 100) * amount;
  const laborPlusMaterials = materialTotal + laborTotal;
  const grossProfit = amount - laborPlusMaterials;
  const gpm = amount > 0 ? grossProfit / amount : 0;
  const materialPct = amount > 0 ? materialTotal / amount : 0;
  const laborPct = amount > 0 ? laborTotal / amount : 0;

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
  { key: 'codeRequirement', label: 'Code', width: 'w-[120px]' },
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
    case 'codeRequirement':
      return item.codeRequirement || '';
    case 'quantity':
      return item.quantity.toLocaleString();
    case 'unit':
      return item.unit;
    case 'unitCost':
      return item.unitCost === 0 ? '—' : formatCurrency(item.unitCost);
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
      return item.unitPrice === 0 ? '—' : formatCurrency(item.unitPrice);
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
interface SpreadsheetTableProps {
  /** When set, show only items from this trade and hide trade headers */
  tradeFilter?: string;
}

function SpreadsheetTable({ tradeFilter }: SpreadsheetTableProps = {}) {
  const { state, updateLineItem } = useProjectStore();
  const storeItems = state.lineItems;

  // Local items state — starts from store, tracks edits locally
  const [items, setItems] = useState<SpreadsheetLineItem[]>(storeItems);
  const [collapsedTrades, setCollapsedTrades] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ id: string; key: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [visibleTrades, setVisibleTrades] = useState<Set<string> | null>(null);

  // Sync from store when store items change (e.g. after calculation)
  React.useEffect(() => {
    if (storeItems.length > 0) {
      setItems(storeItems);
    }
  }, [storeItems]);

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
      const materialTotal = tradeItems.reduce((s, i) => s + i.materialTotal, 0);
      const laborTotal = tradeItems.reduce((s, i) => s + i.laborTotal, 0);
      const laborPlusMaterials = materialTotal + laborTotal;
      const amount = tradeItems.reduce((s, i) => s + i.amount, 0);
      const grossProfit = amount - laborPlusMaterials;
      const gpm = amount > 0 ? grossProfit / amount : 0;
      map[trade] = { trade, materialTotal, laborTotal, laborPlusMaterials, amount, grossProfit, gpm };
    }
    return map;
  }, [items, trades]);

  const grandTotal = useMemo((): GrandTotal => {
    const materialTotal = Object.values(tradeSubtotals).reduce((s, t) => s + t.materialTotal, 0);
    const laborTotal = Object.values(tradeSubtotals).reduce((s, t) => s + t.laborTotal, 0);
    const laborPlusMaterials = materialTotal + laborTotal;
    const amount = Object.values(tradeSubtotals).reduce((s, t) => s + t.amount, 0);
    const grossProfit = amount - laborPlusMaterials;
    const gpm = amount > 0 ? grossProfit / amount : 0;
    return { materialTotal, laborTotal, laborPlusMaterials, amount, grossProfit, gpm };
  }, [tradeSubtotals]);

  const toggleTrade = useCallback((trade: string) => {
    setCollapsedTrades((prev) => {
      const next = new Set(prev);
      if (next.has(trade)) next.delete(trade);
      else next.add(trade);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsedTrades(new Set()), []);
  const collapseAll = useCallback(() => setCollapsedTrades(new Set(trades)), [trades]);

  const filteredTrades = tradeFilter
    ? trades.filter((t) => t === tradeFilter)
    : visibleTrades
      ? trades.filter((t) => visibleTrades.has(t))
      : trades;

  const isSingleTradeMode = !!tradeFilter;

  // Build flat row metadata for keyboard navigation
  const rowMeta = useMemo((): RowMeta[] => {
    const meta: RowMeta[] = [];
    for (const trade of filteredTrades) {
      const isCollapsed = collapsedTrades.has(trade);
      if (!isSingleTradeMode) {
        meta.push({ type: 'header' });
      }
      if (isSingleTradeMode || !isCollapsed) {
        const tradeItems = items.filter((i) => i.trade === trade);
        for (const item of tradeItems) {
          meta.push({ type: 'item', itemId: item.id });
        }
      }
      if (!isSingleTradeMode && !isCollapsed) {
        meta.push({ type: 'subtotal' });
      }
    }
    if (!isSingleTradeMode) {
      meta.push({ type: 'grandTotal' });
    }
    return meta;
  }, [filteredTrades, collapsedTrades, isSingleTradeMode, items]);

  // Edit handlers for keyboard hook
  const handleStartEdit = useCallback(
    (itemId: string, colKey: string, initialChar?: string) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return;
      const rawVal = item[colKey as keyof SpreadsheetLineItem] as number;
      setEditingCell({ id: itemId, key: colKey });
      setEditValue(initialChar ?? String(rawVal));
    },
    [items]
  );

  const handleCommitEdit = useCallback(() => {
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
    updateLineItem(editingCell.id, { [editingCell.key]: numVal });
    setEditingCell(null);
  }, [editingCell, editValue, updateLineItem]);

  const handleCancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  // Keyboard navigation
  const { focusedCell, handleKeyDown, handleCellClick, tableRef } = useSpreadsheetKeyboard({
    rows: rowMeta,
    columns: COLUMNS,
    onStartEdit: handleStartEdit,
    onCommitEdit: handleCommitEdit,
    onCancelEdit: handleCancelEdit,
    isEditing: !!editingCell,
  });

  const alignClass = (align?: string) => {
    if (align === 'right') return 'text-right';
    if (align === 'center') return 'text-center';
    return 'text-left';
  };

  const hasItems = items.length > 0;

  // Track the flat row index as we render
  let flatRowIndex = -1;

  return (
    <div className="flex h-full flex-col bg-white">
      {!isSingleTradeMode && (
        <SpreadsheetToolbar
          trades={trades}
          visibleTrades={visibleTrades}
          onVisibleTradesChange={setVisibleTrades}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
        />
      )}

      <div
        ref={tableRef}
        tabIndex={0}
        onKeyDown={handleKeyDown as unknown as React.KeyboardEventHandler<HTMLDivElement>}
        className="flex-1 overflow-auto custom-scrollbar focus:outline-none"
      >
        {!hasItems ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mb-4">
              <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">No line items yet</h3>
            <p className="text-xs text-gray-500 max-w-[280px]">
              Upload plans and run the AI analysis to generate your takeoff, or add items manually.
            </p>
          </div>
        ) : (
          <table className="border-collapse tabular-nums text-xs" style={{ minWidth: 1400 }}>
            {/* Header */}
            <thead className="sticky top-0 z-10">
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={[
                      'bg-slate-700 text-white px-2 py-2 font-semibold whitespace-nowrap border-r border-slate-600 last:border-r-0',
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

                // Advance row index for header
                if (!isSingleTradeMode) flatRowIndex++;
                const headerRowIdx = flatRowIndex;

                return (
                  <React.Fragment key={trade}>
                    {/* Trade header row */}
                    {!isSingleTradeMode && (
                      <tr
                        onClick={() => toggleTrade(trade)}
                        className="bg-slate-100 cursor-pointer hover:bg-slate-200 select-none"
                      >
                        <td colSpan={COLUMNS.length} className="px-2 py-2 font-semibold text-gray-800">
                          <span className="inline-flex items-center gap-1.5">
                            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            {getTradeLabel(trade)}
                            <span className="font-normal text-gray-500 ml-2">({tradeItems.length} items)</span>
                          </span>
                        </td>
                      </tr>
                    )}

                    {/* Item rows */}
                    {(isSingleTradeMode || !isCollapsed) &&
                      tradeItems.map((item) => {
                        flatRowIndex++;
                        const currentRowIdx = flatRowIndex;

                        return (
                          <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                            {COLUMNS.map((col, colIdx) => {
                              const isEditing = editingCell?.id === item.id && editingCell?.key === col.key;
                              const isEditable = col.editable;
                              const isFocused = focusedCell?.row === currentRowIdx && focusedCell?.col === colIdx;

                              return (
                                <td
                                  key={col.key}
                                  className={[
                                    'px-2 py-1.5 whitespace-nowrap border-r border-gray-100 last:border-r-0 transition-shadow',
                                    col.width,
                                    alignClass(col.align),
                                    isEditable && !isEditing ? 'bg-amber-50/60 cursor-pointer' : '',
                                    col.key === 'codeRequirement' ? 'bg-blue-50 text-blue-800 text-[11px]' : '',
                                    isFocused && !isEditing ? 'ring-2 ring-blue-500 ring-inset z-10 relative' : '',
                                    isFocused && isEditable && !isEditing ? 'bg-amber-100' : '',
                                  ].join(' ')}
                                  onClick={() => {
                                    handleCellClick(currentRowIdx, colIdx);
                                    if (isEditable && !isEditing) {
                                      // Don't auto-start edit on click — just focus
                                      // Double-click or Enter to edit
                                    }
                                  }}
                                  onDoubleClick={() => {
                                    if (isEditable && !isEditing) {
                                      handleStartEdit(item.id, col.key);
                                    }
                                  }}
                                >
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      step="any"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onBlur={handleCommitEdit}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleCommitEdit();
                                        }
                                        if (e.key === 'Escape') {
                                          e.preventDefault();
                                          handleCancelEdit();
                                        }
                                        if (e.key === 'Tab') {
                                          e.preventDefault();
                                          handleCommitEdit();
                                          // Let the keyboard hook handle Tab navigation
                                        }
                                      }}
                                      autoFocus
                                      className="w-full bg-white border border-blue-500 rounded px-1 py-0.5 text-right text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  ) : (
                                    getCellValue(item, col.key)
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}

                    {/* Subtotal row */}
                    {!isSingleTradeMode && !isCollapsed && sub && (() => {
                      flatRowIndex++;
                      return (
                        <tr className="bg-emerald-50 font-semibold">
                          <td className="px-2 py-1.5 border-r border-gray-200" />
                          <td className="px-2 py-1.5 border-r border-gray-200">{getTradeLabel(trade)} Subtotal</td>
                          <td className="px-2 py-1.5 border-r border-gray-200" />
                          <td className="px-2 py-1.5 border-r border-gray-200" />
                          <td className="px-2 py-1.5 border-r border-gray-200" />
                          <td className="px-2 py-1.5 border-r border-gray-200" />
                          <td className="px-2 py-1.5 text-right border-r border-gray-200">{formatCurrency(sub.materialTotal)}</td>
                          <td className="px-2 py-1.5 border-r border-gray-200" />
                          <td className="px-2 py-1.5 border-r border-gray-200" />
                          <td className="px-2 py-1.5 text-right border-r border-gray-200">{formatCurrency(sub.laborTotal)}</td>
                          <td className="px-2 py-1.5 border-r border-gray-200" />
                          <td className="px-2 py-1.5 text-right border-r border-gray-200">{formatCurrency(sub.laborPlusMaterials)}</td>
                          <td className="px-2 py-1.5 border-r border-gray-200" />
                          <td className="px-2 py-1.5 text-right border-r border-gray-200">{formatCurrency(sub.amount)}</td>
                          <td className="px-2 py-1.5 text-right border-r border-gray-200">{formatCurrency(sub.grossProfit)}</td>
                          <td className="px-2 py-1.5 text-right">{formatPct(sub.gpm)}</td>
                        </tr>
                      );
                    })()}
                  </React.Fragment>
                );
              })}

              {/* Grand total row */}
              {!isSingleTradeMode && (() => {
                flatRowIndex++;
                return (
                  <tr className="bg-slate-800 text-white font-semibold">
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 border-r border-slate-700">Grand Total</td>
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 text-right border-r border-slate-700">{formatCurrency(grandTotal.materialTotal)}</td>
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 text-right border-r border-slate-700">{formatCurrency(grandTotal.laborTotal)}</td>
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 text-right border-r border-slate-700">{formatCurrency(grandTotal.laborPlusMaterials)}</td>
                    <td className="px-2 py-2 border-r border-slate-700" />
                    <td className="px-2 py-2 text-right border-r border-slate-700">{formatCurrency(grandTotal.amount)}</td>
                    <td className="px-2 py-2 text-right border-r border-slate-700">{formatCurrency(grandTotal.grossProfit)}</td>
                    <td className="px-2 py-2 text-right">{formatPct(grandTotal.gpm)}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export { SpreadsheetTable };
