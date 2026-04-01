'use client';

import React, { useState, useMemo } from 'react';
import { Building2, ChevronDown, ChevronRight, List } from 'lucide-react';
import { TradeTabBar } from './TradeTabBar';
import { SpreadsheetTable } from './SpreadsheetTable';
import { ProjectDescriptionPanel } from './ProjectDescriptionPanel';
import { useProjectStore } from '@/hooks/useProjectStore';
import { calculateSubtotal } from '@/lib/utils/calculations';
import { generateCodeNotes } from '@/lib/utils/building-code-notes';
import type { NoteSection } from '@/lib/api/python-service';
import type { TradeSubtotal } from '@/lib/types/line-item';

// ---------------------------------------------------------------------------
// Collapsible Section (reused pattern from TradeTabContent)
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-5 py-3 text-left hover:bg-gray-100 transition-colors cursor-pointer"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {title}
        </span>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes Section (plan notes + code notes)
// ---------------------------------------------------------------------------

function NotesSection({
  title,
  notes,
  variant = 'code',
}: {
  title: string;
  notes: NoteSection[];
  variant?: 'plan' | 'code';
}) {
  if (notes.length === 0) return null;

  const borderColor = variant === 'plan' ? 'border-amber-200' : 'border-gray-200';
  const bgColor = variant === 'plan' ? 'bg-amber-50/60' : 'bg-white';

  return (
    <CollapsibleSection title={title} defaultOpen>
      <div className="grid grid-cols-1 gap-3">
        {notes.map((note, idx) => (
          <div
            key={idx}
            className={`${bgColor} rounded-lg border ${borderColor} p-3`}
          >
            <h4 className="text-xs font-semibold text-gray-700 mb-2">
              {note.title}
            </h4>
            <ul className="space-y-1">
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
    </CollapsibleSection>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function PlansTabContent() {
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

  // Item counts per trade
  const tradeItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of state.lineItems) {
      counts[item.trade] = (counts[item.trade] || 0) + 1;
    }
    // All tab shows total
    counts['all'] = state.lineItems.length;
    counts['project'] = 0;
    return counts;
  }, [state.lineItems]);

  // Subtotals per trade
  const tradeSubtotals = useMemo(() => {
    const subtotals: Record<string, TradeSubtotal> = {};
    // calculateSubtotal returns TradeSubtotal[] grouped by trade
    const allSubtotals = calculateSubtotal(state.lineItems);
    for (const sub of allSubtotals) {
      subtotals[sub.trade] = sub;
    }
    // All tab: sum all trades
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
    // Convert plan_notes { trade: string[] } into { trade: NoteSection[] }
    const result: Record<string, NoteSection[]> = {};
    for (const [trade, lines] of Object.entries(raw)) {
      if (Array.isArray(lines) && lines.length > 0) {
        result[trade] = [{ title: 'Plan Notes & Specifications', lines }];
      }
    }
    return result;
  }, [state.buildingModel]);

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
      {/* Tab bar */}
      <TradeTabBar
        trades={allTabs}
        activeTrade={activeTrade}
        onTabChange={setActiveTrade}
        tradeItemCounts={tradeItemCounts}
        tradeSubtotals={tradeSubtotals}
        tabLabels={tabLabels}
        tabIcons={tabIcons}
      />

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTrade === 'project' ? (
          <ProjectDescriptionPanel />
        ) : activeTrade === 'all' ? (
          <SpreadsheetTable />
        ) : (
          <div className="flex flex-col">
            <div className="min-h-0">
              <SpreadsheetTable tradeFilter={activeTrade} />
            </div>
            {/* Plan notes from blueprints */}
            {(planNotes[activeTrade] || planNotes['general']) && (
              <div className="bg-amber-50/50">
                <NotesSection
                  title="Plan Notes & Specifications"
                  notes={[
                    ...(planNotes[activeTrade] || []),
                    ...(planNotes['general'] || []),
                  ]}
                  variant="plan"
                />
              </div>
            )}
            {/* Code notes below the trade estimate */}
            {codeNotes[activeTrade] && (
              <div className="bg-gray-50">
                <NotesSection
                  title="Building Code Notes"
                  notes={codeNotes[activeTrade]}
                  variant="code"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { PlansTabContent };
