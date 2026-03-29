'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Loader2, AlertCircle, Home, MessageSquare, X } from 'lucide-react';
import { PropertyHero } from './PropertyHero';
import { TradeTabBar } from './TradeTabBar';
import { TradeTabContent } from './TradeTabContent';
import { SpreadsheetToolbar } from './SpreadsheetToolbar';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { useProjectStore } from '@/hooks/useProjectStore';
import { useAddressEstimate } from '@/hooks/useAddressEstimate';
import type { TradeSubtotal } from '@/lib/types/line-item';

function RetrofitWorkspace() {
  const { state } = useProjectStore();
  const { runEstimate, isRunning } = useAddressEstimate();
  const [activeTrade, setActiveTrade] = useState<string>('');
  const [hasTriggered, setHasTriggered] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const {
    propertyData,
    propertyImages,
    roofClassification,
    propertyNotes,
    insulationNotes,
    lineItems,
    analysisStatus,
    analysisMessages,
    error,
    projectMeta,
  } = state;

  // Auto-trigger estimate on mount
  useEffect(() => {
    if (
      !hasTriggered &&
      projectMeta.address &&
      !propertyData &&
      analysisStatus === 'idle'
    ) {
      setHasTriggered(true);
      runEstimate(projectMeta.address);
    }
  }, [hasTriggered, projectMeta.address, propertyData, analysisStatus, runEstimate]);

  // Derive trades from line items
  const trades = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const item of lineItems) {
      if (!seen.has(item.trade)) {
        seen.add(item.trade);
        order.push(item.trade);
      }
    }
    return order;
  }, [lineItems]);

  // Auto-select first trade when trades appear
  useEffect(() => {
    if (trades.length > 0 && !activeTrade) {
      setActiveTrade(trades[0]);
    }
  }, [trades, activeTrade]);

  // Trade item counts
  const tradeItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of lineItems) {
      counts[item.trade] = (counts[item.trade] || 0) + 1;
    }
    return counts;
  }, [lineItems]);

  // Trade subtotals
  const tradeSubtotals = useMemo((): Record<string, TradeSubtotal> => {
    const map: Record<string, TradeSubtotal> = {};
    for (const trade of trades) {
      const tradeItems = lineItems.filter((i) => i.trade === trade);
      const materialTotal = tradeItems.reduce((s, i) => s + i.materialTotal, 0);
      const laborTotal = tradeItems.reduce((s, i) => s + i.laborTotal, 0);
      const laborPlusMaterials = materialTotal + laborTotal;
      const amount = tradeItems.reduce((s, i) => s + i.amount, 0);
      const grossProfit = amount - laborPlusMaterials;
      const gpm = amount > 0 ? grossProfit / amount : 0;
      map[trade] = { trade, materialTotal, laborTotal, laborPlusMaterials, amount, grossProfit, gpm };
    }
    return map;
  }, [lineItems, trades]);

  // Combine notes for the active trade (deduplicate by title)
  const activeTradeNotes = useMemo(() => {
    const all = [...(propertyNotes || []), ...(insulationNotes || [])];
    const seen = new Set<string>();
    return all.filter((note) => {
      if (seen.has(note.title)) return false;
      seen.add(note.title);
      return true;
    });
  }, [propertyNotes, insulationNotes]);

  // Loading state
  if (isRunning || analysisStatus === 'analyzing' || analysisStatus === 'uploading') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gray-50">
        <Loader2 className="h-12 w-12 text-primary animate-spin mb-6" />
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Generating Estimate</h3>
        <p className="text-sm text-gray-500 mb-4">
          Looking up property data for <span className="font-medium">{projectMeta.address}</span>
        </p>
        <div className="space-y-1.5 w-full max-w-sm">
          {analysisMessages.map((msg, i) => (
            <p key={i} className="text-xs text-gray-400">{msg}</p>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gray-50">
        <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Estimate Failed</h3>
        <p className="text-sm text-red-600 mb-2 max-w-md">{error}</p>
        {projectMeta.address && (
          <p className="text-xs text-gray-500 mb-6 max-w-md">
            Address: &ldquo;{projectMeta.address}&rdquo; — Make sure to include the full street address, city, and state (e.g. &ldquo;123 Main St, Denver, CO 80204&rdquo;).
          </p>
        )}
        {projectMeta.address && (
          <button
            onClick={() => runEstimate(projectMeta.address)}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  // No data yet
  if (!propertyData) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gray-50">
        <Home className="h-12 w-12 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">No property data</h3>
        <p className="text-sm text-gray-500">Enter an address to generate a retrofit estimate.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-50">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Scrollable area: hero + trade content */}
        <div className="flex-1 overflow-y-auto">
          {/* Property Hero */}
          <PropertyHero
            propertyData={propertyData}
            images={propertyImages}
            roofClassification={roofClassification}
          />

          {/* Trade Tabs */}
          <TradeTabBar
            trades={trades}
            activeTrade={activeTrade}
            onTabChange={setActiveTrade}
            tradeItemCounts={tradeItemCounts}
            tradeSubtotals={tradeSubtotals}
          />

          {/* Toolbar for active trade */}
          <div className="bg-white border-b border-gray-200 px-5 py-2">
            <SpreadsheetToolbar
              trades={trades}
              visibleTrades={null}
              onVisibleTradesChange={() => {}}
              onExpandAll={() => {}}
              onCollapseAll={() => {}}
            />
          </div>

          {/* Active Trade Content */}
          {activeTrade && (
            <div className="flex-1">
              <TradeTabContent
                trade={activeTrade}
                notes={activeTradeNotes}
                propertyData={propertyData}
                roofClassification={roofClassification}
                assumptions={state.assumptions}
              />
            </div>
          )}
        </div>
      </div>

      {/* Chat toggle button */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className="fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-colors cursor-pointer"
        title="Toggle chat"
      >
        {chatOpen ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
      </button>

      {/* Chat drawer */}
      {chatOpen && (
        <div className="w-[360px] bg-white flex flex-col shrink-0">
          <ChatPanel />
        </div>
      )}
    </div>
  );
}

export { RetrofitWorkspace };
