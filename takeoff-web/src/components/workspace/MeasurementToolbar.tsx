'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Undo2, Ruler, Edit3 } from 'lucide-react';
import { MEASUREMENT_TYPES, getTradeColor } from '@/lib/types/measurement';
import { parseScaleString } from '@/lib/utils/scale-detection';
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
  /** Scale factor for the current page */
  scaleFactor: number;
  /** Pending measurement result (available during naming step) */
  pendingResult?: { value: number; unit: string } | null;
  /** Linear feet of pending measurement (for surface_area) */
  pendingLinearFt?: number | null;
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
  /** Called to confirm measurement with a name and optional height */
  onConfirm: (name: string, heightFt?: number) => void;
  /** Called when user overrides the scale */
  onScaleOverride?: (scaleString: string, scaleFactor: number) => void;
}

// ---------------------------------------------------------------------------
// Common scales for quick selection
// ---------------------------------------------------------------------------

const COMMON_SCALES = [
  { label: '1/8" = 1\'-0"', factor: 96 },
  { label: '3/16" = 1\'-0"', factor: 64 },
  { label: '1/4" = 1\'-0"', factor: 48 },
  { label: '3/8" = 1\'-0"', factor: 32 },
  { label: '1/2" = 1\'-0"', factor: 24 },
  { label: '3/4" = 1\'-0"', factor: 16 },
  { label: '1" = 1\'-0"', factor: 12 },
  { label: '1 1/2" = 1\'-0"', factor: 8 },
  { label: '3" = 1\'-0"', factor: 4 },
];

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
  scaleFactor,
  onStartTool,
  onFinish,
  onUndo,
  onCancel,
  onDeactivate,
  pendingResult,
  pendingLinearFt,
  onConfirm,
  onScaleOverride,
}: MeasurementToolbarProps) {
  const [selectedTrade, setSelectedTrade] = useState<string>(TRADE_OPTIONS[0]?.id || 'insulation');
  const [selectedType, setSelectedType] = useState<string>('');
  const [measurementName, setMeasurementName] = useState('');
  const [wallHeight, setWallHeight] = useState('9');
  const [editingScale, setEditingScale] = useState(false);
  const [scaleInput, setScaleInput] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const scaleInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus name input when entering naming state
  useEffect(() => {
    if (toolState === 'naming' && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [toolState]);

  // Auto-focus scale input when editing
  useEffect(() => {
    if (editingScale && scaleInputRef.current) {
      scaleInputRef.current.focus();
    }
  }, [editingScale]);

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

  const isSurfaceArea = activeTool?.mode === 'surface_area';

  const handleConfirmName = () => {
    const name = measurementName.trim() || 'Untitled';
    const height = isSurfaceArea ? parseFloat(wallHeight) || 9 : undefined;
    onConfirm(name, height);
    setMeasurementName('');
    setWallHeight('9');
  };

  const handleScaleSubmit = () => {
    const trimmed = scaleInput.trim();
    if (!trimmed) {
      setEditingScale(false);
      return;
    }
    const factor = parseScaleString(trimmed);
    if (factor && onScaleOverride) {
      onScaleOverride(trimmed, factor);
    }
    setEditingScale(false);
    setScaleInput('');
  };

  const handleScaleSelect = (label: string, factor: number) => {
    if (onScaleOverride) {
      onScaleOverride(label, factor);
    }
    setEditingScale(false);
    setScaleInput('');
  };

  const tradeColor = activeTool ? getTradeColor(activeTool.trade) : '#6b7280';

  // ── Scale editor (click on scale to override) ──
  const scaleDisplay = (
    <span className="flex items-center gap-1 shrink-0">
      {editingScale ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => { e.preventDefault(); handleScaleSubmit(); }}
        >
          <select
            className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
            value=""
            onChange={(e) => {
              const sel = COMMON_SCALES.find((s) => s.label === e.target.value);
              if (sel) handleScaleSelect(sel.label, sel.factor);
            }}
          >
            <option value="">Pick scale...</option>
            {COMMON_SCALES.map((s) => (
              <option key={s.factor} value={s.label}>{s.label}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">or</span>
          <input
            ref={scaleInputRef}
            type="text"
            value={scaleInput}
            onChange={(e) => setScaleInput(e.target.value)}
            onBlur={() => { if (!scaleInput.trim()) setEditingScale(false); }}
            className="w-24 text-xs border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={'1/4" = 1\'-0"'}
          />
          <button type="submit" className="p-0.5 text-green-500 cursor-pointer"><Check className="h-3 w-3" /></button>
          <button type="button" onClick={() => setEditingScale(false)} className="p-0.5 text-gray-400 cursor-pointer"><X className="h-3 w-3" /></button>
        </form>
      ) : (
        <button
          onClick={() => {
            setEditingScale(true);
            setScaleInput(scaleString);
          }}
          className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-primary cursor-pointer"
          title="Click to override scale"
        >
          {scaleString ? `Scale: ${scaleString}` : 'Set scale'}
          <Edit3 className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );

  // Compute live SF based on current height input
  const liveHeight = parseFloat(wallHeight) || 9;
  const liveSF = isSurfaceArea && pendingLinearFt ? Math.round(pendingLinearFt * liveHeight) : null;

  // ── Naming state: show name input + result + height (for surface_area) ──
  if (toolState === 'naming') {
    return (
      <div className="flex flex-col border-t border-gray-200 bg-white px-3 py-1.5 gap-1.5">
        {/* Result display */}
        <div className="flex items-center gap-3 text-xs">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: tradeColor }}
          />
          {isSurfaceArea && pendingLinearFt ? (
            <span className="font-medium text-gray-700">
              {pendingLinearFt.toFixed(1)} LF measured
              <span className="text-gray-400 mx-1">&times;</span>
              {liveHeight} ft height
              <span className="text-gray-400 mx-1">=</span>
              <span style={{ color: tradeColor }}>{liveSF?.toLocaleString()} SF</span>
            </span>
          ) : pendingResult ? (
            <span className="font-medium" style={{ color: tradeColor }}>
              {pendingResult.unit === 'SF'
                ? `${Math.round(pendingResult.value).toLocaleString()} SF`
                : `${pendingResult.value.toFixed(1)} LF`}
            </span>
          ) : null}
        </div>

        {/* Name + height inputs */}
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirmName();
          }}
        >
          <span className="text-xs text-gray-500 shrink-0">Name:</span>
          <input
            ref={nameInputRef}
            type="text"
            value={measurementName}
            onChange={(e) => setMeasurementName(e.target.value)}
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary min-w-0"
            placeholder="Measurement name"
          />
          {isSurfaceArea && (
            <>
              <span className="text-xs text-gray-500 shrink-0">Height:</span>
              <input
                type="number"
                step="0.5"
                min="1"
                max="40"
                value={wallHeight}
                onChange={(e) => setWallHeight(e.target.value)}
                className="w-14 text-xs border border-gray-300 rounded px-1.5 py-1 text-right focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-xs text-gray-400 shrink-0">ft</span>
            </>
          )}
          <button
            type="submit"
            className="p-1 text-green-600 hover:text-green-800 cursor-pointer"
            title="Save measurement (Enter)"
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
        {scaleDisplay}
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

      {scaleDisplay}

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
