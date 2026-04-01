'use client';

import { useState, useCallback, useRef } from 'react';
import type { MeasurementPoint, MeasurementMode, ActiveMeasurementTool } from '@/lib/types/measurement';
import { computeMeasurementResult, snapToAxis } from '@/lib/utils/measurement-math';
import { useProjectStore } from './useProjectStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MeasurementToolState = 'idle' | 'measuring' | 'naming';

export interface UseMeasurementToolReturn {
  /** Current state of the tool */
  toolState: MeasurementToolState;
  /** Points placed so far */
  activePoints: MeasurementPoint[];
  /** Current cursor position (for rubber-band rendering) */
  cursorPos: MeasurementPoint | null;
  /** Active trade + type + mode from store */
  activeTool: ActiveMeasurementTool | null;

  // ── Actions ──
  /** Start a new measurement session with the given tool config */
  startTool: (tool: ActiveMeasurementTool) => void;
  /** Handle click to place a point */
  handleClick: (pt: MeasurementPoint, shiftKey?: boolean) => void;
  /** Handle double-click to finish measurement */
  handleDoubleClick: () => void;
  /** Handle mouse move for rubber-band */
  handleMouseMove: (pt: MeasurementPoint, shiftKey?: boolean) => void;
  /** Undo the last placed point */
  undoLastPoint: () => void;
  /** Cancel the current measurement */
  cancelMeasurement: () => void;
  /** Deactivate the tool entirely */
  deactivateTool: () => void;
  /** Confirm and save the measurement with a name */
  confirmMeasurement: (name: string) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMeasurementTool(
  scaleFactor: number,
  scaleString: string,
  pageNumber: number
): UseMeasurementToolReturn {
  const { state, addMeasurement, setActiveMeasurementTool } = useProjectStore();
  const activeTool = state.activeMeasurementTool;

  const [toolState, setToolState] = useState<MeasurementToolState>('idle');
  const [activePoints, setActivePoints] = useState<MeasurementPoint[]>([]);
  const [cursorPos, setCursorPos] = useState<MeasurementPoint | null>(null);

  // Pending result for the naming step
  const pendingResultRef = useRef<{ value: number; unit: string } | null>(null);

  const startTool = useCallback(
    (tool: ActiveMeasurementTool) => {
      setActiveMeasurementTool(tool);
      setToolState('idle');
      setActivePoints([]);
      setCursorPos(null);
      pendingResultRef.current = null;
    },
    [setActiveMeasurementTool]
  );

  const handleClick = useCallback(
    (pt: MeasurementPoint, shiftKey = false) => {
      if (!activeTool) return;

      // Apply axis snap if Shift is held and we have a previous point
      let finalPt = pt;
      if (shiftKey && activePoints.length > 0) {
        finalPt = snapToAxis(pt, activePoints[activePoints.length - 1]);
      }

      setActivePoints((prev) => [...prev, finalPt]);
      if (toolState === 'idle') {
        setToolState('measuring');
      }
    },
    [activeTool, activePoints, toolState]
  );

  const handleDoubleClick = useCallback(() => {
    if (!activeTool || activePoints.length < 2) return;

    // Compute the result
    const isClosed = activeTool.mode === 'area' || activeTool.mode === 'surface_area';
    const result = computeMeasurementResult({
      mode: activeTool.mode,
      points: activePoints,
      scaleFactor,
      heightFt: null, // Will be set during naming for surface_area
      isClosed,
    });

    pendingResultRef.current = result;
    setToolState('naming');
  }, [activeTool, activePoints, scaleFactor]);

  const handleMouseMove = useCallback(
    (pt: MeasurementPoint, shiftKey = false) => {
      if (!activeTool || toolState !== 'measuring') return;

      let finalPt = pt;
      if (shiftKey && activePoints.length > 0) {
        finalPt = snapToAxis(pt, activePoints[activePoints.length - 1]);
      }
      setCursorPos(finalPt);
    },
    [activeTool, toolState, activePoints]
  );

  const undoLastPoint = useCallback(() => {
    setActivePoints((prev) => {
      const next = prev.slice(0, -1);
      if (next.length === 0) {
        setToolState('idle');
      }
      return next;
    });
  }, []);

  const cancelMeasurement = useCallback(() => {
    setActivePoints([]);
    setCursorPos(null);
    setToolState('idle');
    pendingResultRef.current = null;
  }, []);

  const deactivateTool = useCallback(() => {
    setActiveMeasurementTool(null);
    setActivePoints([]);
    setCursorPos(null);
    setToolState('idle');
    pendingResultRef.current = null;
  }, [setActiveMeasurementTool]);

  const confirmMeasurement = useCallback(
    (name: string) => {
      if (!activeTool || !pendingResultRef.current) return;

      const isClosed = activeTool.mode === 'area' || activeTool.mode === 'surface_area';

      addMeasurement({
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        trade: activeTool.trade,
        measurementType: activeTool.measurementType,
        mode: activeTool.mode,
        pageNumber,
        points: activePoints,
        isClosed,
        heightFt: null,
        resultValue: pendingResultRef.current.value,
        resultUnit: pendingResultRef.current.unit,
        scaleString,
        scaleFactor,
        createdAt: new Date().toISOString(),
        addedToEstimate: false,
      });

      // Reset for next measurement (keep tool active)
      setActivePoints([]);
      setCursorPos(null);
      setToolState('idle');
      pendingResultRef.current = null;
    },
    [activeTool, activePoints, pageNumber, scaleFactor, scaleString, addMeasurement]
  );

  return {
    toolState,
    activePoints,
    cursorPos,
    activeTool,
    startTool,
    handleClick,
    handleDoubleClick,
    handleMouseMove,
    undoLastPoint,
    cancelMeasurement,
    deactivateTool,
    confirmMeasurement,
  };
}
