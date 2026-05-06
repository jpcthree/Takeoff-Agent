'use client';

/**
 * V2 Takeoff Panel — surfaces the conversation entities the agent is working
 * with: required measurements vs. taken, confirmed assumptions, open
 * questions, flagged inconsistencies, and the produced scope items.
 *
 * Replaces the legacy ProjectDescriptionPanel for v2 projects. Read-only;
 * the agent + measurement tool are the source of truth for the data shown
 * here.
 */

import React, { useMemo } from 'react';
import {
  Ruler,
  CheckCircle2,
  Circle,
  AlertTriangle,
  HelpCircle,
  Receipt,
  ArrowRight,
} from 'lucide-react';
import { useProjectStore } from '@/hooks/useProjectStore';
import { getTradeModule, listTradeIds } from '@/lib/trades/trade-loader';
import type { TradeModule } from '@/lib/trades/trade-types';

function TakeoffPanel() {
  const {
    state,
    setActiveTrade,
    updateOpenQuestion,
    updateInconsistency,
    removeAssumption,
  } = useProjectStore();
  const {
    activeTradeId,
    measurements,
    assumptions,
    openQuestions,
    inconsistencies,
    scopeItems,
    projectMeta,
  } = state;

  // ── Active trade module ──
  const activeModule: TradeModule | null = useMemo(
    () => (activeTradeId ? getTradeModule(activeTradeId) : null),
    [activeTradeId]
  );

  // ── Measurements aggregated by semantic tag for the active trade ──
  const measurementsByTag = useMemo(() => {
    const out: Record<string, { value: number; unit: string; count: number }> = {};
    for (const m of measurements) {
      if (!m.semanticTag) continue;
      // Only count toward this trade if associated
      if (activeTradeId && !(m.tradeAssociations ?? [m.trade]).includes(activeTradeId)) continue;
      const e = out[m.semanticTag];
      if (e) {
        e.value += m.resultValue;
        e.count += 1;
      } else {
        out[m.semanticTag] = { value: m.resultValue, unit: m.resultUnit, count: 1 };
      }
    }
    return out;
  }, [measurements, activeTradeId]);

  const tradeAssumptions = useMemo(
    () => assumptions.filter((a) => !activeTradeId || a.tradeId === activeTradeId),
    [assumptions, activeTradeId]
  );

  const tradeScopeItems = useMemo(
    () => scopeItems.filter((s) => !activeTradeId || s.tradeId === activeTradeId),
    [scopeItems, activeTradeId]
  );

  const scopeTotal = tradeScopeItems.reduce((sum, s) => sum + s.lineTotal, 0);

  const availableTrades = useMemo(() => {
    const enabled = projectMeta.selectedTrades?.length ? projectMeta.selectedTrades : listTradeIds();
    return enabled.filter((t) => getTradeModule(t));
  }, [projectMeta.selectedTrades]);

  // ── Compute the next blocking step for the active trade ──
  // Priority: missing measurements (sorted by their priority) > missing
  // assumptions > empty scope items (no run yet) > all clear.
  const nextStep = useMemo(() => {
    if (!activeModule) return null;

    const missingMeasurement = activeModule.requiredMeasurements
      .filter((m) => !(m.tag in measurementsByTag))
      .sort((a, b) => a.priority - b.priority)[0];
    if (missingMeasurement) {
      return {
        kind: 'measurement' as const,
        text: `Take measurement: ${missingMeasurement.label}`,
        hint: 'The agent will guide you. Click "Measure" in the chat or pick the trade in the toolbar.',
      };
    }

    const tradeKeys = new Set(tradeAssumptions.map((a) => a.key));
    const missingAssumption = activeModule.requiredAssumptions.find(
      (a) => !tradeKeys.has(a.key)
    );
    if (missingAssumption) {
      return {
        kind: 'assumption' as const,
        text: `Confirm: ${missingAssumption.prompt}`,
        hint: 'Tell the agent your answer in chat, or wait for it to ask.',
      };
    }

    if (tradeScopeItems.length === 0) {
      return {
        kind: 'estimate' as const,
        text: 'Generate the estimate',
        hint: 'All measurements and assumptions are in. Ask the agent to run the rules engine.',
      };
    }

    return null;
  }, [activeModule, measurementsByTag, tradeAssumptions, tradeScopeItems.length]);

  return (
    <div className="px-4 py-3 space-y-5">
      {/* Header / trade picker */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            {projectMeta.name || 'Untitled Project'}
          </h2>
          <p className="text-xs text-gray-500">
            {projectMeta.address || 'No address set'}
          </p>
        </div>
        {availableTrades.length > 1 && (
          <select
            value={activeTradeId ?? ''}
            onChange={(e) => setActiveTrade(e.target.value || null)}
            className="text-xs border border-gray-300 rounded px-2 py-1"
          >
            {availableTrades.map((t) => (
              <option key={t} value={t}>
                {getTradeModule(t)?.displayName ?? t}
              </option>
            ))}
          </select>
        )}
      </div>

      {!activeModule && (
        <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
          Pick a trade to begin. The agent will guide you through measurements and assumptions.
        </div>
      )}

      {/* Next-step nudge — gives the user one clear thing to do */}
      {activeModule && nextStep && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-2">
          <ArrowRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900">Next: {nextStep.text}</p>
            <p className="text-[11px] text-gray-600 mt-0.5">{nextStep.hint}</p>
          </div>
        </div>
      )}

      {/* All-clear when nothing is blocking */}
      {activeModule && !nextStep && tradeScopeItems.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900">
              {activeModule.displayName} estimate is ready.
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5">
              Review the scope items below. Use Export to send the .xlsx.
            </p>
          </div>
        </div>
      )}

      {activeModule && (
        <>
          {/* Required measurements */}
          <Section
            icon={<Ruler className="h-3.5 w-3.5" />}
            title={`Required measurements — ${activeModule.displayName}`}
            count={Object.keys(measurementsByTag).length}
            total={activeModule.requiredMeasurements.length}
          >
            <ul className="space-y-1.5">
              {activeModule.requiredMeasurements.map((rm) => {
                const taken = measurementsByTag[rm.tag];
                return (
                  <li key={rm.tag} className="flex items-center gap-2 text-xs">
                    {taken ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                    )}
                    <span className="font-medium text-gray-700 flex-1 truncate">
                      {rm.label}
                    </span>
                    {taken ? (
                      <span className="text-gray-600">
                        {taken.value.toFixed(taken.unit === 'LF' ? 1 : 0)} {taken.unit}
                        {taken.count > 1 && (
                          <span className="text-gray-400"> ({taken.count}×)</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">
                        priority {rm.priority}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* Assumptions */}
          <Section
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            title="Confirmed assumptions"
            count={tradeAssumptions.length}
            total={activeModule.requiredAssumptions.length}
          >
            {tradeAssumptions.length === 0 ? (
              <p className="text-xs text-gray-400 italic">None yet — the agent will ask.</p>
            ) : (
              <ul className="space-y-1.5">
                {tradeAssumptions.map((a) => {
                  const def = activeModule.requiredAssumptions.find((d) => d.key === a.key);
                  const opt = def?.options.find((o) => o.value === a.value);
                  return (
                    <li
                      key={a.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="font-medium text-gray-700 flex-1 truncate">
                        {def?.prompt ?? a.key}
                      </span>
                      <span className="text-gray-600">{opt?.label ?? a.value}</span>
                      <button
                        onClick={() => removeAssumption(a.id)}
                        className="text-[10px] text-gray-400 hover:text-red-500 cursor-pointer"
                        title="Clear (will re-ask)"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </>
      )}

      {/* Open questions */}
      <Section
        icon={<HelpCircle className="h-3.5 w-3.5" />}
        title="Open questions"
        count={openQuestions.filter((q) => q.status === 'open').length}
      >
        {openQuestions.filter((q) => q.status === 'open').length === 0 ? (
          <p className="text-xs text-gray-400 italic">None.</p>
        ) : (
          <ul className="space-y-1.5">
            {openQuestions
              .filter((q) => q.status === 'open')
              .map((q) => (
                <li key={q.id} className="flex items-start gap-2 text-xs">
                  <span className="text-gray-700 flex-1">{q.question}</span>
                  <button
                    onClick={() =>
                      updateOpenQuestion(q.id, { status: 'dismissed' })
                    }
                    className="text-[10px] text-gray-400 hover:text-red-500 cursor-pointer shrink-0"
                  >
                    dismiss
                  </button>
                </li>
              ))}
          </ul>
        )}
      </Section>

      {/* Inconsistencies */}
      <Section
        icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
        title="Inconsistencies"
        count={inconsistencies.filter((i) => i.status !== 'resolved').length}
      >
        {inconsistencies.filter((i) => i.status !== 'resolved').length === 0 ? (
          <p className="text-xs text-gray-400 italic">None flagged.</p>
        ) : (
          <ul className="space-y-1.5">
            {inconsistencies
              .filter((i) => i.status !== 'resolved')
              .map((i) => (
                <li key={i.id} className="text-xs space-y-0.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                    <span className="font-medium text-gray-800 flex-1">{i.summary}</span>
                    <button
                      onClick={() =>
                        updateInconsistency(i.id, { status: 'resolved' })
                      }
                      className="text-[10px] text-gray-400 hover:text-green-600 cursor-pointer shrink-0"
                    >
                      resolve
                    </button>
                  </div>
                  {i.detail && (
                    <p className="text-[11px] text-gray-500 ml-5">{i.detail}</p>
                  )}
                </li>
              ))}
          </ul>
        )}
      </Section>

      {/* Scope items (the agent's deliverable) */}
      <Section
        icon={<Receipt className="h-3.5 w-3.5" />}
        title={
          activeTradeId
            ? `Scope items — ${activeModule?.displayName ?? activeTradeId}`
            : 'Scope items'
        }
        count={tradeScopeItems.length}
        rightSlot={
          tradeScopeItems.length > 0 ? (
            <span className="text-xs font-semibold text-gray-700">
              ${scopeTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          ) : null
        }
      >
        {tradeScopeItems.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            No scope items yet. The agent will run the rules engine after assumptions are confirmed.
          </p>
        ) : (
          <ScopeItemTable items={tradeScopeItems} />
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  count: number;
  total?: number;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}

function Section({ icon, title, count, total, rightSlot, children }: SectionProps) {
  return (
    <section>
      <header className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide">
          {icon}
          <span>{title}</span>
          <span className="text-gray-400 normal-case font-normal">
            {total !== undefined ? `(${count}/${total})` : `(${count})`}
          </span>
        </div>
        {rightSlot}
      </header>
      <div className="rounded-md border border-gray-200 bg-white p-3">{children}</div>
    </section>
  );
}

interface ScopeItem {
  id: string;
  description: string;
  category: string;
  quantity: number;
  unit: string;
  unitCost: number;
  materialTotal: number;
  laborTotal: number;
  lineTotal: number;
}

function ScopeItemTable({ items }: { items: ScopeItem[] }) {
  // Group by category for readability
  const byCategory = new Map<string, ScopeItem[]>();
  for (const i of items) {
    const list = byCategory.get(i.category) ?? [];
    list.push(i);
    byCategory.set(i.category, list);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="text-left py-1 font-medium">Item</th>
            <th className="text-right py-1 font-medium">Qty</th>
            <th className="text-left py-1 font-medium pl-2">Unit</th>
            <th className="text-right py-1 font-medium">Material</th>
            <th className="text-right py-1 font-medium">Labor</th>
            <th className="text-right py-1 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {[...byCategory.entries()].map(([category, rows]) => (
            <React.Fragment key={category}>
              <tr>
                <td colSpan={6} className="pt-2 pb-0.5 text-[10px] uppercase tracking-wide text-gray-400">
                  {category}
                </td>
              </tr>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-1 pr-2 text-gray-700">{r.description}</td>
                  <td className="py-1 text-right text-gray-700">{r.quantity}</td>
                  <td className="py-1 pl-2 text-gray-500 uppercase">{r.unit}</td>
                  <td className="py-1 text-right text-gray-600">
                    ${r.materialTotal.toFixed(0)}
                  </td>
                  <td className="py-1 text-right text-gray-600">
                    ${r.laborTotal.toFixed(0)}
                  </td>
                  <td className="py-1 text-right font-medium text-gray-800">
                    ${r.lineTotal.toFixed(0)}
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { TakeoffPanel };
