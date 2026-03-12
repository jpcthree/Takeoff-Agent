'use client';

import React, { useState } from 'react';
import { Plus, Download, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';

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

  const toggleTrade = (trade: string) => {
    const current = visibleTrades ?? new Set(trades);
    const next = new Set(current);
    if (next.has(trade)) {
      next.delete(trade);
    } else {
      next.add(trade);
    }
    // If all are visible again, reset to null (show all)
    if (next.size === trades.length) {
      onVisibleTradesChange(null);
    } else {
      onVisibleTradesChange(next);
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 shrink-0">
      <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />}>
        Add Line Item
      </Button>
      <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />}>
        Export .xlsx
      </Button>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      <Button size="sm" variant="ghost" onClick={onExpandAll} icon={<ChevronsUpDown className="h-3.5 w-3.5" />}>
        Expand All
      </Button>
      <Button size="sm" variant="ghost" onClick={onCollapseAll} icon={<ChevronsDownUp className="h-3.5 w-3.5" />}>
        Collapse All
      </Button>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Trade filter */}
      <div className="relative">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowFilter(!showFilter)}
        >
          Filter Trades
          {visibleTrades && (
            <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 rounded-full">
              {visibleTrades.size}/{trades.length}
            </span>
          )}
        </Button>

        {showFilter && (
          <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-lg border border-gray-200 shadow-lg py-2 min-w-[180px]">
            {trades.map((trade) => {
              const isChecked = visibleTrades
                ? visibleTrades.has(trade)
                : true;
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
                  {trade}
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
