'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { SpreadsheetToolbar } from './SpreadsheetToolbar';
import { useProjectStore } from '@/hooks/useProjectStore';
import { useSpreadsheetKeyboard, type RowMeta } from '@/hooks/useSpreadsheetKeyboard';
import { getTradeLabel } from '@/lib/api/python-service';
import { trackAdjustment } from '@/lib/data/estimate-persistence';
import { calculateRow } from '@/lib/utils/calculations';
import type {
  SpreadsheetLineItem,
  TradeSubtotal,
  GrandTotal,
} from '@/lib/types/line-item';

// ---------------------------------------------------------------------------
// Recompute derived fields from user-editable inputs
// Uses shared calculateRow() to stay consistent with export_xlsx formulas.
// ---------------------------------------------------------------------------
function computeItem(item: SpreadsheetLineItem): SpreadsheetLineItem {
  const calc = calculateRow(item.quantity, item.unitCost, item.laborRatePct, item.unitPrice);
  return { ...item, ...calc };
}

// ---------------------------------------------------------------------------
// Columns config
// ---------------------------------------------------------------------------
const COLUMNS = [
  { key: 'category', label: 'Category', width: 'w-[120px]', editable: true, type: 'text' as const },
  { key: 'description', label: 'Description', width: 'min-w-[200px] flex-1', editable: true, type: 'text' as const },
  { key: 'codeRequirement', label: 'Code', width: 'w-[120px]' },
  { key: 'quantity', label: 'Qty', width: 'w-[70px]', align: 'right' as const, editable: true },
  { key: 'unit', label: 'Unit', width: 'w-[60px]', align: 'center' as const, editable: true, type: 'text' as const },
  { key: 'sheets', label: 'Sheets', width: 'w-[65px]', align: 'right' as const },
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

// Text columns don't trigger recalculation
const TEXT_COLUMNS = new Set(['category', 'description', 'unit']);

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
    case 'sheets':
      return item.sheets ? item.sheets.toLocaleString() : '';
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
  const { state, updateLineItem, addLineItem } = useProjectStore();
  // Single source of truth: store items. No local copy, no sync race conditions.
  const items = state.lineItems;

  // Filter columns based on trade — sheets only relevant for drywall
  const columns = useMemo(() => {
    if (tradeFilter && tradeFilter !== 'drywall') {
      return COLUMNS.filter((col) => col.key !== 'sheets');
    }
    return COLUMNS;
  }, [tradeFilter]);

  const [collapsedTrades, setCollapsedTrades] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ id: string; key: string } | null>(null);
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
      const rawVal = item[colKey as keyof SpreadsheetLineItem];
      setEditingCell({ id: itemId, key: colKey });
      setEditValue(initialChar ?? String(rawVal ?? ''));
    },
    [items]
  );

  const handleCommitEdit = useCallback(() => {
    if (!editingCell) return;

    const isTextCol = TEXT_COLUMNS.has(editingCell.key);

    // Find the current item from the store (single source of truth)
    const editedItem = items.find((i) => i.id === editingCell.id);
    if (!editedItem) {
      setEditingCell(null);
      return;
    }

    if (isTextCol) {
      // Text columns — just update the string value, no recalculation
      updateLineItem(editingCell.id, { [editingCell.key]: editValue } as Partial<SpreadsheetLineItem>);
    } else {
      // Numeric columns — parse, validate, recompute
      const numVal = parseFloat(editValue);
      if (isNaN(numVal)) {
        setEditingCell(null);
        return;
      }

      // Track the adjustment for learning (if project is persisted)
      if (state.projectMeta.id) {
        const originalValue = editedItem[editingCell.key as keyof SpreadsheetLineItem] as number;
        if (originalValue !== numVal) {
          trackAdjustment({
            project_id: state.projectMeta.id,
            trade: editedItem.trade,
            item_description: editedItem.description,
            field_changed: editingCell.key,
            original_value: originalValue,
            new_value: numVal,
            source: 'user',
          }).catch(() => {}); // fire-and-forget
        }
      }

      // Recompute and update the store directly
      const updated = { ...editedItem, [editingCell.key]: numVal };
      const recomputed = computeItem(updated);
      updateLineItem(editingCell.id, recomputed);
    }

    setEditingCell(null);
  }, [editingCell, editValue, updateLineItem, items, state.projectMeta.id]);

  const handleCancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  // Keyboard navigation
  const { focusedCell, handleKeyDown, handleCellClick, tableRef } = useSpreadsheetKeyboard({
    rows: rowMeta,
    columns,
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
                {columns.map((col) => (
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
                        <td colSpan={columns.length} className="px-2 py-2 font-semibold text-gray-800">
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
                                      type={col.type === 'text' ? 'text' : 'number'}
                                      step={col.type === 'text' ? undefined : 'any'}
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
                                        }
                                      }}
                                      autoFocus
                                      className={`w-full bg-white border border-blue-500 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 ${col.type === 'text' ? 'text-left' : 'text-right'}`}
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

                    {/* Subtotal row — shown in both multi-trade and single-trade modes */}
                    {(isSingleTradeMode || !isCollapsed) && sub && (() => {
                      flatRowIndex++;
                      const totalStyle = isSingleTradeMode
                        ? 'bg-slate-800 text-white font-semibold'
                        : 'bg-emerald-50 font-semibold';
                      const borderStyle = isSingleTradeMode
                        ? 'border-r border-slate-700'
                        : 'border-r border-gray-200';
                      const padY = isSingleTradeMode ? 'py-2' : 'py-1.5';
                      const totalValues: Record<string, React.ReactNode> = {
                        description: isSingleTradeMode ? 'Total' : `${getTradeLabel(trade)} Subtotal`,
                        materialTotal: formatCurrency(sub.materialTotal),
                        laborTotal: formatCurrency(sub.laborTotal),
                        laborPlusMaterials: formatCurrency(sub.laborPlusMaterials),
                        amount: formatCurrency(sub.amount),
                        grossProfit: formatCurrency(sub.grossProfit),
                        gpm: formatPct(sub.gpm),
                      };
                      return (
                        <tr className={totalStyle}>
                          {columns.map((col, i) => (
                            <td
                              key={col.key}
                              className={`px-2 ${padY} ${i < columns.length - 1 ? borderStyle : ''} ${['materialTotal','laborTotal','laborPlusMaterials','amount','grossProfit','gpm'].includes(col.key) ? 'text-right' : ''}`}
                            >
                              {totalValues[col.key] || ''}
                            </td>
                          ))}
                        </tr>
                      );
                    })()}
                  </React.Fragment>
                );
              })}

              {/* Grand total row */}
              {!isSingleTradeMode && (() => {
                flatRowIndex++;
                const gtValues: Record<string, React.ReactNode> = {
                  description: 'Grand Total',
                  materialTotal: formatCurrency(grandTotal.materialTotal),
                  laborTotal: formatCurrency(grandTotal.laborTotal),
                  laborPlusMaterials: formatCurrency(grandTotal.laborPlusMaterials),
                  amount: formatCurrency(grandTotal.amount),
                  grossProfit: formatCurrency(grandTotal.grossProfit),
                  gpm: formatPct(grandTotal.gpm),
                };
                return (
                  <tr className="bg-slate-800 text-white font-semibold">
                    {columns.map((col, i) => (
                      <td
                        key={col.key}
                        className={`px-2 py-2 ${i < columns.length - 1 ? 'border-r border-slate-700' : ''} ${['materialTotal','laborTotal','laborPlusMaterials','amount','grossProfit','gpm'].includes(col.key) ? 'text-right' : ''}`}
                      >
                        {gtValues[col.key] || ''}
                      </td>
                    ))}
                  </tr>
                );
              })()}
            </tbody>
          </table>
        )}

        {/* Add Item button */}
        {hasItems && (
          <div className="px-3 py-2 border-t border-gray-200">
            <button
              onClick={() => {
                const trade = tradeFilter || filteredTrades[0] || 'misc';
                const newItem: SpreadsheetLineItem = {
                  id: `user-${Date.now()}`,
                  trade,
                  category: '',
                  description: '',
                  quantity: 0,
                  unit: 'EA',
                  unitCost: 0,
                  laborRatePct: 0,
                  unitPrice: 0,
                  materialTotal: 0,
                  materialPct: 0,
                  laborTotal: 0,
                  laborPct: 0,
                  laborPlusMaterials: 0,
                  amount: 0,
                  grossProfit: 0,
                  gpm: 0,
                  sortOrder: items.length,
                  isUserAdded: true,
                };
                addLineItem(newItem);
              }}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Line Item
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export { SpreadsheetTable };
