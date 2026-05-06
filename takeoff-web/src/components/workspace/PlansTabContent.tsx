'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Building2, List, Maximize2, Minimize2 } from 'lucide-react';
import { TradeTabBar } from './TradeTabBar';
import { SpreadsheetTable } from './SpreadsheetTable';
import { TakeoffPanel } from './TakeoffPanel';
import { useProjectStore } from '@/hooks/useProjectStore';
import { calculateSubtotal } from '@/lib/utils/calculations';
import type { TradeSubtotal } from '@/lib/types/line-item';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface PlansTabContentProps {
  onExpand?: () => void;
  onCollapse?: () => void;
  isExpanded?: boolean;
}

function PlansTabContent({ onExpand, onCollapse, isExpanded }: PlansTabContentProps = {}) {
  const { state, setActiveTrade: setStoreActiveTrade } = useProjectStore();
  const [activeTrade, setLocalActiveTrade] = useState('project');

  // Wrap setActiveTrade so clicking a trade tab also updates the store's
  // activeTradeId. Keeps the TakeoffPanel trade picker, the trade tab,
  // and the agent's view of "active trade" in sync.
  const setActiveTrade = useCallback(
    (next: string) => {
      setLocalActiveTrade(next);
      if (next !== 'project' && next !== 'all') {
        setStoreActiveTrade(next);
      }
    },
    [setStoreActiveTrade]
  );

  // Derive trades from line items + scope items + selected trades.
  // V2 emits ScopeItems via the rules engine; the legacy lineItems flow
  // also still works. Show whatever surfaces.
  const trades = useMemo(() => {
    const tradeSet = new Set<string>();
    for (const item of state.lineItems) tradeSet.add(item.trade);
    for (const item of state.scopeItems) tradeSet.add(item.tradeId);
    for (const t of state.projectMeta.selectedTrades ?? []) tradeSet.add(t);
    return Array.from(tradeSet);
  }, [state.lineItems, state.scopeItems, state.projectMeta.selectedTrades]);

  // Auto-switch to first trade tab when calculation completes
  const prevStatusRef = useRef(state.analysisStatus);
  useEffect(() => {
    if (
      prevStatusRef.current !== 'ready' &&
      state.analysisStatus === 'ready' &&
      trades.length > 0
    ) {
      setActiveTrade(trades[0]);
    }
    prevStatusRef.current = state.analysisStatus;
  }, [state.analysisStatus, trades]);

  // Item counts per trade
  const tradeItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of state.lineItems) {
      counts[item.trade] = (counts[item.trade] || 0) + 1;
    }
    counts['all'] = state.lineItems.length;
    counts['project'] = 0;
    return counts;
  }, [state.lineItems]);

  // Subtotals per trade
  const tradeSubtotals = useMemo(() => {
    const subtotals: Record<string, TradeSubtotal> = {};
    const allSubtotals = calculateSubtotal(state.lineItems);
    for (const sub of allSubtotals) {
      subtotals[sub.trade] = sub;
    }
    if (allSubtotals.length > 0) {
      const allAmount = allSubtotals.reduce((s, t) => s + t.amount, 0);
      subtotals['all'] = {
        trade: 'all',
        materialTotal: allSubtotals.reduce((s, t) => s + t.materialTotal, 0),
        laborTotal: allSubtotals.reduce((s, t) => s + t.laborTotal, 0),
        laborPlusMaterials: allSubtotals.reduce((s, t) => s + t.laborPlusMaterials, 0),
        amount: allAmount,
        grossProfit: allSubtotals.reduce((s, t) => s + t.grossProfit, 0),
        gpm: allAmount > 0 ? allSubtotals.reduce((s, t) => s + t.grossProfit, 0) / allAmount : 0,
        sheets: allSubtotals.reduce((s, t) => s + t.sheets, 0),
      };
    }
    return subtotals;
  }, [state.lineItems]);

  // Tab configuration
  const allTabs = ['project', ...trades, 'all'];

  const tabLabels: Record<string, string> = {
    project: 'Project',
    all: 'All',
  };

  const tabIcons: Record<string, React.ReactNode> = {
    project: <Building2 className="h-3.5 w-3.5" />,
    all: <List className="h-3.5 w-3.5" />,
  };

  // If active trade is not in the list (e.g., after re-analysis), reset
  if (!allTabs.includes(activeTrade)) {
    setActiveTrade('project');
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar with expand toggle */}
      <div className="flex items-center">
        <div className="flex-1 min-w-0">
          <TradeTabBar
            trades={allTabs}
            activeTrade={activeTrade}
            onTabChange={setActiveTrade}
            tradeItemCounts={tradeItemCounts}
            tradeSubtotals={tradeSubtotals}
            tabLabels={tabLabels}
            tabIcons={tabIcons}
          />
        </div>
        {onExpand && !isExpanded && (
          <button
            onClick={onExpand}
            className="p-2 text-gray-400 hover:text-gray-600 cursor-pointer shrink-0 border-b border-gray-200"
            title="Expand to full screen"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}
        {isExpanded && onCollapse && (
          <button
            onClick={onCollapse}
            className="p-2 text-gray-400 hover:text-gray-600 cursor-pointer shrink-0 border-b border-gray-200"
            title="Exit full screen (Esc)"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content area.
          Trade-specific tabs render TakeoffPanel scoped to that trade
          (via activeTradeId sync above). The "all" tab keeps the legacy
          SpreadsheetTable for any line items still in the lineItems flow. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTrade === 'all' ? (
          <SpreadsheetTable />
        ) : (
          <TakeoffPanel />
        )}
      </div>
    </div>
  );
}

export { PlansTabContent };
