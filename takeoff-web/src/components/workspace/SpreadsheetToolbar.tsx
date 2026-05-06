'use client';

import React, { useState, useCallback } from 'react';
import { Plus, Download, ChevronsDownUp, ChevronsUpDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useProjectStore } from '@/hooks/useProjectStore';
import { exportXlsx, getTradeLabel } from '@/lib/api/python-service';

interface SpreadsheetToolbarProps {
  trades: string[];
  visibleTrades: Set<string> | null;
  onVisibleTradesChange: (trades: Set<string> | null) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

function SpreadsheetToolbar({
  trades,
  visibleTrades,
  onVisibleTradesChange,
  onExpandAll,
  onCollapseAll,
}: SpreadsheetToolbarProps) {
  const [showFilter, setShowFilter] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { state } = useProjectStore();

  const handleExport = useCallback(async () => {
    if (state.lineItems.length === 0) return;
    setIsExporting(true);
    try {
      // Convert SpreadsheetLineItems to LineItemDict format for export
      const exportItems = state.lineItems.map((item) => ({
        trade: item.trade,
        category: item.category || '',
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
      }));

      await exportXlsx(
        exportItems,
        state.projectMeta.name || 'Estimate',
        state.projectMeta.address,
      );
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [state.lineItems, state.projectMeta]);

  const toggleTrade = (trade: string) => {
    const current = visibleTrades ?? new Set(trades);
    const next = new Set(current);
    if (next.has(trade)) {
      next.delete(trade);
    } else {
      next.add(trade);
    }
    if (next.size === trades.length) {
      onVisibleTradesChange(null);
    } else {
      onVisibleTradesChange(next);
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 shrink-0">
      <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />}>
        Add Item
      </Button>
      <Button
        size="sm"
        variant="secondary"
        icon={isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        onClick={handleExport}
        disabled={state.lineItems.length === 0 || isExporting}
      >
        Export .xlsx
      </Button>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      <Button size="sm" variant="ghost" onClick={onExpandAll} icon={<ChevronsUpDown className="h-3.5 w-3.5" />}>
        Expand
      </Button>
      <Button size="sm" variant="ghost" onClick={onCollapseAll} icon={<ChevronsDownUp className="h-3.5 w-3.5" />}>
        Collapse
      </Button>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Trade filter */}
      <div className="relative">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowFilter(!showFilter)}
        >
          Filter
          {visibleTrades && (
            <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 rounded-full">
              {visibleTrades.size}/{trades.length}
            </span>
          )}
        </Button>

        {showFilter && (
          <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-lg border border-gray-200 shadow-lg py-2 min-w-[180px]">
            {trades.map((trade) => {
              const isChecked = visibleTrades ? visibleTrades.has(trade) : true;
              return (
                <label
                  key={trade}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleTrade(trade)}
                    className="rounded border-gray-300 text-primary focus:ring-primary/40"
                  />
                  {getTradeLabel(trade)}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export { SpreadsheetToolbar };
