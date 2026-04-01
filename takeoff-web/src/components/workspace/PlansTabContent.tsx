'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Building2, List, ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { TradeTabBar } from './TradeTabBar';
import { SpreadsheetTable } from './SpreadsheetTable';
import { ProjectDescriptionPanel } from './ProjectDescriptionPanel';
import { useProjectStore } from '@/hooks/useProjectStore';
import { calculateSubtotal } from '@/lib/utils/calculations';
import { generateCodeNotes } from '@/lib/utils/building-code-notes';
import { generateTradeKnowledge, generateLocationNotes, parseStateFromAddress } from '@/lib/utils/trade-knowledge-notes';
import type { NoteSection } from '@/lib/api/python-service';
import type { TradeSubtotal } from '@/lib/types/line-item';

// ---------------------------------------------------------------------------
// Collapsible Section
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  defaultOpen = false,
  bg = 'bg-gray-50',
  headerColor = 'text-gray-500',
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  bg?: string;
  headerColor?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`border-t border-gray-200 ${bg}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-5 py-2 hover:bg-black/5 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        )}
        <span className={`text-xs font-semibold uppercase tracking-wider ${headerColor}`}>
          {title}
        </span>
      </button>
      {open && <div className="px-5 pb-3">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Note Cards Renderer
// ---------------------------------------------------------------------------

function NoteCards({
  notes,
  cardBg = 'bg-white',
  cardBorder = 'border-gray-200',
}: {
  notes: NoteSection[];
  cardBg?: string;
  cardBorder?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {notes.map((note, idx) => (
        <div key={idx} className={`${cardBg} rounded border ${cardBorder} p-2.5`}>
          <h4 className="text-xs font-semibold text-gray-700 mb-1">{note.title}</h4>
          <ul className="space-y-0.5">
            {note.lines.map((line, lineIdx) => (
              <li
                key={lineIdx}
                className="text-xs text-gray-600 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-gray-400"
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface PlansTabContentProps {
  onExpand?: () => void;
  onCollapse?: () => void;
  isExpanded?: boolean;
}

function PlansTabContent({ onExpand, onCollapse, isExpanded }: PlansTabContentProps = {}) {
  const { state } = useProjectStore();
  const [activeTrade, setActiveTrade] = useState('project');

  // Derive trades from line items
  const trades = useMemo(() => {
    const tradeSet = new Set<string>();
    for (const item of state.lineItems) {
      tradeSet.add(item.trade);
    }
    return Array.from(tradeSet);
  }, [state.lineItems]);

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

  // Code notes from building model
  const codeNotes = useMemo(() => {
    if (!state.buildingModel) return {};
    return generateCodeNotes(state.buildingModel);
  }, [state.buildingModel]);

  // Plan notes extracted from blueprint analysis
  const planNotes = useMemo(() => {
    const raw = state.buildingModel?.plan_notes as Record<string, string[]> | undefined;
    if (!raw) return {};
    const result: Record<string, NoteSection[]> = {};
    for (const [trade, lines] of Object.entries(raw)) {
      if (Array.isArray(lines) && lines.length > 0) {
        result[trade] = [{ title: 'Plan Notes & Specifications', lines }];
      }
    }
    return result;
  }, [state.buildingModel]);

  // Parse state abbreviation from project address
  const parsedState = useMemo(
    () => parseStateFromAddress(state.projectMeta.address),
    [state.projectMeta.address]
  );

  // Climate zone from building model
  const climateZone = useMemo(
    () => (state.buildingModel?.climate_zone as string) || '',
    [state.buildingModel]
  );

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

  // Gather notes for the active trade tab
  const activePlanNotes = [
    ...(planNotes[activeTrade] || []),
    ...(planNotes['general'] || []),
  ];
  const activeCodeNotes = codeNotes[activeTrade] || [];
  const activeTradeKnowledge = generateTradeKnowledge(activeTrade);
  const activeLocationNotes = generateLocationNotes(activeTrade, parsedState, climateZone);

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

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTrade === 'project' ? (
          <ProjectDescriptionPanel />
        ) : activeTrade === 'all' ? (
          <SpreadsheetTable />
        ) : (
          <div className="flex flex-col">
            {/* Spreadsheet FIRST */}
            <SpreadsheetTable tradeFilter={activeTrade} />

            {/* Notes BELOW — collapsible sections */}
            {activePlanNotes.length > 0 && (
              <CollapsibleSection
                title="Plan Notes & Specifications"
                defaultOpen
                bg="bg-amber-50/60"
                headerColor="text-amber-700"
              >
                <NoteCards
                  notes={activePlanNotes}
                  cardBg="bg-amber-50"
                  cardBorder="border-amber-200"
                />
              </CollapsibleSection>
            )}

            {activeCodeNotes.length > 0 && (
              <CollapsibleSection
                title="Building Code Notes"
                defaultOpen
                bg="bg-gray-50"
                headerColor="text-gray-500"
              >
                <NoteCards notes={activeCodeNotes} />
              </CollapsibleSection>
            )}

            {activeTradeKnowledge.length > 0 && (
              <CollapsibleSection
                title="Trade Best Practices"
                bg="bg-indigo-50/50"
                headerColor="text-indigo-600"
              >
                <NoteCards
                  notes={activeTradeKnowledge}
                  cardBg="bg-indigo-50"
                  cardBorder="border-indigo-200"
                />
              </CollapsibleSection>
            )}

            {activeLocationNotes.length > 0 && (
              <CollapsibleSection
                title="Location & Climate Considerations"
                bg="bg-emerald-50/50"
                headerColor="text-emerald-700"
              >
                <NoteCards
                  notes={activeLocationNotes}
                  cardBg="bg-emerald-50"
                  cardBorder="border-emerald-200"
                />
              </CollapsibleSection>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { PlansTabContent };
