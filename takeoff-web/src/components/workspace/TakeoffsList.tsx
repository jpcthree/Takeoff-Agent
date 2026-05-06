'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  Trash2,
  ChevronDown,
  ChevronRight,
  PlusCircle,
  Edit3,
  Check,
  X,
} from 'lucide-react';
import { useProjectStore } from '@/hooks/useProjectStore';
import type { Measurement } from '@/lib/types/measurement';
import { getTradeColor, MEASUREMENT_TYPES } from '@/lib/types/measurement';
import { formatMeasurementResult } from '@/lib/utils/measurement-math';
import { pythonLineItemToSpreadsheet } from '@/lib/utils/calculations';
import type { LineItemDict } from '@/lib/api/python-service';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TakeoffsListProps {
  /** Called when user clicks a measurement — navigate PdfViewer to that page */
  onNavigateToPage?: (pageNumber: number) => void;
  /** Called when hovering a measurement — highlight on overlay */
  onHoverMeasurement?: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTypeLabel(trade: string, measurementType: string): string {
  const types = MEASUREMENT_TYPES[trade];
  const found = types?.find((t) => t.id === measurementType);
  return found?.label || measurementType;
}

function groupByTrade(measurements: Measurement[]): Record<string, Measurement[]> {
  const groups: Record<string, Measurement[]> = {};
  for (const m of measurements) {
    if (!groups[m.trade]) groups[m.trade] = [];
    groups[m.trade].push(m);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Trade Group Component
// ---------------------------------------------------------------------------

function TradeGroup({
  trade,
  measurements,
  onNavigateToPage,
  onHoverMeasurement,
}: {
  trade: string;
  measurements: Measurement[];
  onNavigateToPage?: (pageNumber: number) => void;
  onHoverMeasurement?: (id: string | null) => void;
}) {
  const { removeMeasurement, updateMeasurement, addLineItem } = useProjectStore();
  const [expanded, setExpanded] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  const color = getTradeColor(trade);
  const tradeLabel = trade.charAt(0).toUpperCase() + trade.slice(1);

  const totalValue = measurements.reduce((sum, m) => {
    // Sum LF and SF separately
    return sum;
  }, 0);

  const lfTotal = measurements.filter(m => m.resultUnit === 'LF').reduce((s, m) => s + m.resultValue, 0);
  const sfTotal = measurements.filter(m => m.resultUnit === 'SF').reduce((s, m) => s + m.resultValue, 0);

  const startEdit = useCallback((m: Measurement) => {
    setEditingId(m.id);
    setEditName(m.name);
    setTimeout(() => editRef.current?.focus(), 0);
  }, []);

  const saveEdit = useCallback((id: string) => {
    if (editName.trim()) {
      updateMeasurement(id, { name: editName.trim() });
    }
    setEditingId(null);
  }, [editName, updateMeasurement]);

  const handleAddToEstimate = useCallback((m: Measurement) => {
    // Create a raw line item dict
    const rawItem: LineItemDict = {
      trade: m.trade,
      category: m.measurementType,
      description: `${m.name} (manual takeoff)`,
      quantity: m.resultValue,
      unit: m.resultUnit,
      material_unit_cost: 0,
      material_total: 0,
      labor_hours: 0,
      labor_rate: 0,
      labor_total: 0,
      line_total: 0,
    };

    const spreadsheetItem = pythonLineItemToSpreadsheet(rawItem, Date.now());
    spreadsheetItem.trade = m.trade;
    spreadsheetItem.isUserAdded = true;

    addLineItem(spreadsheetItem);
    updateMeasurement(m.id, { addedToEstimate: true });
  }, [addLineItem, updateMeasurement]);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      {/* Trade header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        )}
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold text-gray-800">{tradeLabel}</span>
        <span className="text-xs text-gray-400">({measurements.length})</span>
        <div className="flex-1" />
        {lfTotal > 0 && <span className="text-xs text-gray-500">{Math.round(lfTotal)} LF</span>}
        {lfTotal > 0 && sfTotal > 0 && <span className="text-xs text-gray-300 mx-0.5">|</span>}
        {sfTotal > 0 && <span className="text-xs text-gray-500">{Math.round(sfTotal)} SF</span>}
      </button>

      {/* Measurement items */}
      {expanded && (
        <div className="pl-4 pr-2 pb-1">
          {measurements.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-gray-50 group transition-colors"
              onMouseEnter={() => onHoverMeasurement?.(m.id)}
              onMouseLeave={() => onHoverMeasurement?.(null)}
            >
              {/* Name — click to navigate to page, double-click to rename */}
              {editingId === m.id ? (
                <form
                  className="flex items-center gap-1 flex-1 min-w-0"
                  onSubmit={(e) => { e.preventDefault(); saveEdit(m.id); }}
                >
                  <input
                    ref={editRef}
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => saveEdit(m.id)}
                    className="flex-1 text-xs border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary min-w-0"
                  />
                  <button type="submit" className="p-0.5 text-green-500 cursor-pointer">
                    <Check className="h-3 w-3" />
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => onNavigateToPage?.(m.pageNumber)}
                  onDoubleClick={(e) => { e.stopPropagation(); startEdit(m); }}
                  className="flex-1 text-left text-xs text-gray-700 truncate hover:text-primary cursor-pointer min-w-0"
                  title={`${m.name} — click to view on page ${m.pageNumber}, double-click to rename`}
                >
                  {m.name}
                </button>
              )}

              {/* Result + page badge */}
              <span
                className="text-xs font-medium shrink-0 text-right"
                style={{ color }}
                title={m.mode === 'surface_area' && m.heightFt ? `${(m.resultValue / m.heightFt).toFixed(1)} LF × ${m.heightFt} ft` : undefined}
              >
                {formatMeasurementResult(m.resultValue, m.resultUnit)}
                {m.mode === 'surface_area' && m.heightFt && (
                  <span className="text-[9px] text-gray-400 ml-0.5">
                    ({(m.resultValue / m.heightFt).toFixed(0)}LF×{m.heightFt}ft)
                  </span>
                )}
              </span>

              <span className="text-[9px] text-gray-400 shrink-0 bg-gray-100 px-1 py-0.5 rounded">
                p{m.pageNumber}
              </span>

              {/* Add to estimate */}
              {!m.addedToEstimate && (
                <button
                  onClick={() => handleAddToEstimate(m)}
                  className="p-0.5 text-gray-300 hover:text-green-600 cursor-pointer shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Add to estimate"
                >
                  <PlusCircle className="h-3 w-3" />
                </button>
              )}
              {m.addedToEstimate && (
                <span className="text-[10px] text-green-500 shrink-0" title="Added to estimate">
                  <Check className="h-3 w-3" />
                </span>
              )}

              {/* Delete */}
              <button
                onClick={() => removeMeasurement(m.id)}
                className="p-0.5 text-gray-300 hover:text-red-500 cursor-pointer shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete measurement"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function TakeoffsList({ onNavigateToPage, onHoverMeasurement }: TakeoffsListProps) {
  const { state } = useProjectStore();
  const { measurements } = state;

  if (measurements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <Edit3 className="h-6 w-6 text-gray-300" />
        </div>
        <p className="text-sm text-gray-500">No takeoffs yet</p>
        <p className="text-xs text-gray-400">
          Use the ruler tool on the Plans tab to measure dimensions on your blueprints
        </p>
      </div>
    );
  }

  const grouped = groupByTrade(measurements);
  const trades = Object.keys(grouped).sort();

  return (
    <div className="h-full flex flex-col">
      {/* Summary bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-50 shrink-0">
        <span className="text-xs text-gray-500">
          {measurements.length} measurement{measurements.length !== 1 ? 's' : ''}
        </span>
        <span className="text-xs text-gray-400">
          {trades.length} trade{trades.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grouped list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {trades.map((trade) => (
          <TradeGroup
            key={trade}
            trade={trade}
            measurements={grouped[trade]}
            onNavigateToPage={onNavigateToPage}
            onHoverMeasurement={onHoverMeasurement}
          />
        ))}
      </div>
    </div>
  );
}

export { TakeoffsList };
