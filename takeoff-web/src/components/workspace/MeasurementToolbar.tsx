'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Undo2, Ruler } from 'lucide-react';
import { MEASUREMENT_TYPES, getTradeColor } from '@/lib/types/measurement';
import type { ActiveMeasurementTool, MeasurementMode } from '@/lib/types/measurement';
import type { MeasurementToolState } from '@/hooks/useMeasurementTool';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MeasurementToolbarProps {
  /** Current tool state */
  toolState: MeasurementToolState;
  /** Active tool config (null = tool inactive) */
  activeTool: ActiveMeasurementTool | null;
  /** Number of active points placed */
  activePointCount: number;
  /** Running measurement label (e.g., "12'-6\" LF") */
  runningLabel?: string;
  /** Scale string for the current page */
  scaleString: string;
  /** Called to start the tool with a specific config */
  onStartTool: (tool: ActiveMeasurementTool) => void;
  /** Called to finish (double-click equivalent) */
  onFinish: () => void;
  /** Called to undo the last point */
  onUndo: () => void;
  /** Called to cancel the current measurement */
  onCancel: () => void;
  /** Called to deactivate the tool entirely */
  onDeactivate: () => void;
  /** Called to confirm measurement with a name */
  onConfirm: (name: string) => void;
}

// ---------------------------------------------------------------------------
// Available trades for measurement
// ---------------------------------------------------------------------------

const TRADE_OPTIONS = Object.keys(MEASUREMENT_TYPES).map((id) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function MeasurementToolbar({
  toolState,
  activeTool,
  activePointCount,
  runningLabel,
  scaleString,
  onStartTool,
  onFinish,
  onUndo,
  onCancel,
  onDeactivate,
  onConfirm,
}: MeasurementToolbarProps) {
  const [selectedTrade, setSelectedTrade] = useState<string>(TRADE_OPTIONS[0]?.id || 'insulation');
  const [selectedType, setSelectedType] = useState<string>('');
  const [measurementName, setMeasurementName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus name input when entering naming state
  useEffect(() => {
    if (toolState === 'naming' && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [toolState]);

  // Reset type selection when trade changes
  useEffect(() => {
    const types = MEASUREMENT_TYPES[selectedTrade];
    if (types?.length) {
      setSelectedType(types[0].id);
    }
  }, [selectedTrade]);

  // Generate default name when entering naming state
  useEffect(() => {
    if (toolState === 'naming' && activeTool) {
      const types = MEASUREMENT_TYPES[activeTool.trade];
      const typeOption = types?.find((t) => t.id === activeTool.measurementType);
      const label = typeOption?.label || activeTool.measurementType;
      setMeasurementName(label);
    }
  }, [toolState, activeTool]);

  const typeOptions = MEASUREMENT_TYPES[selectedTrade] || [];
  const currentTypeOption = typeOptions.find((t) => t.id === selectedType);
  const currentMode: MeasurementMode = currentTypeOption?.mode || 'linear';

  const handleStartMeasure = () => {
    onStartTool({
      trade: selectedTrade,
      measurementType: selectedType || typeOptions[0]?.id || 'other',
      mode: currentMode,
    });
  };

  const handleConfirmName = () => {
    const name = measurementName.trim() || 'Untitled';
    onConfirm(name);
    setMeasurementName('');
  };

  const tradeColor = activeTool ? getTradeColor(activeTool.trade) : '#6b7280';

  // ── Naming state: show name input ──
  if (toolState === 'naming') {
    return (
      <div className="flex items-center gap-2 border-t border-gray-200 bg-white px-3 py-1.5">
        <span className="text-xs text-gray-500 shrink-0">Name:</span>
        <form
          className="flex items-center gap-1.5 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirmName();
          }}
        >
          <input
            ref={nameInputRef}
            type="text"
            value={measurementName}
            onChange={(e) => setMeasurementName(e.target.value)}
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Measurement name"
          />
          <button
            type="submit"
            className="p-1 text-green-600 hover:text-green-800 cursor-pointer"
            title="Save measurement"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-red-500 hover:text-red-700 cursor-pointer"
            title="Discard"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      </div>
    );
  }

  // ── Measuring state: show active controls ──
  if (activeTool && toolState === 'measuring') {
    return (
      <div className="flex items-center gap-2 border-t border-gray-200 bg-white px-3 py-1.5">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: tradeColor }}
        />
        <span className="text-xs font-medium text-gray-700 shrink-0">
          {activeTool.trade.charAt(0).toUpperCase() + activeTool.trade.slice(1)}
        </span>
        <span className="text-xs text-gray-400">|</span>
        <span className="text-xs text-gray-500 shrink-0">
          {activePointCount} pts
        </span>
        {runningLabel && (
          <>
            <span className="text-xs text-gray-400">|</span>
            <span className="text-xs font-medium" style={{ color: tradeColor }}>
              {runningLabel}
            </span>
          </>
        )}
        <div className="flex-1" />
        <button
          onClick={onUndo}
          disabled={activePointCount < 1}
          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
          title="Undo last point (Backspace)"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        {activePointCount >= 2 && (
          <button
            onClick={onFinish}
            className="text-xs font-medium px-2 py-0.5 rounded text-white cursor-pointer"
            style={{ backgroundColor: tradeColor }}
            title="Finish measurement (double-click)"
          >
            Done
          </button>
        )}
        <button
          onClick={onCancel}
          className="p-1 text-red-400 hover:text-red-600 cursor-pointer"
          title="Cancel (Esc)"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // ── Idle state with active tool: show "Click to start" ──
  if (activeTool && toolState === 'idle') {
    return (
      <div className="flex items-center gap-2 border-t border-gray-200 bg-white px-3 py-1.5">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: tradeColor }}
        />
        <span className="text-xs text-gray-500">
          Click on the plan to start measuring
        </span>
        <div className="flex-1" />
        {scaleString && (
          <span className="text-xs text-gray-400 shrink-0">
            Scale: {scaleString}
          </span>
        )}
        <button
          onClick={onDeactivate}
          className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
          title="Exit measurement mode"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // ── Default: trade/type selector ──
  return (
    <div className="flex items-center gap-2 border-t border-gray-200 bg-white px-3 py-1.5">
      <Ruler className="h-3.5 w-3.5 text-gray-400 shrink-0" />

      {/* Trade dropdown */}
      <select
        value={selectedTrade}
        onChange={(e) => setSelectedTrade(e.target.value)}
        className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {TRADE_OPTIONS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>

      {/* Type dropdown */}
      <select
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value)}
        className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {typeOptions.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>

      {/* Mode badge */}
      <span className="text-xs text-gray-400 shrink-0">
        {currentMode === 'linear' ? 'LF' : currentMode === 'area' ? 'SF' : 'SA'}
      </span>

      <div className="flex-1" />

      {scaleString && (
        <span className="text-xs text-gray-400 shrink-0">
          {scaleString}
        </span>
      )}

      {/* Start button */}
      <button
        onClick={handleStartMeasure}
        className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-primary text-white hover:bg-primary/90 cursor-pointer transition-colors"
      >
        <Ruler className="h-3 w-3" /> Measure
      </button>
    </div>
  );
}

export { MeasurementToolbar };
