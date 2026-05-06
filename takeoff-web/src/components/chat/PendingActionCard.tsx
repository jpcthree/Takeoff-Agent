'use client';

import React from 'react';
import { Ruler, AlertCircle, Check, X } from 'lucide-react';
import { useProjectStore } from '@/hooks/useProjectStore';
import type { MeasurementMode } from '@/lib/types/measurement';

interface PendingAction {
  kind: 'measurement_suggested' | 'confirmation_requested';
  payload: Record<string, unknown>;
  createdAt: string;
}

interface PendingActionCardProps {
  action: PendingAction;
  onResolved: () => void;
}

export function PendingActionCard({ action, onResolved }: PendingActionCardProps) {
  const { setActiveMeasurementTool } = useProjectStore();

  if (action.kind === 'measurement_suggested') {
    const semanticTag = String(action.payload.semantic_tag ?? '');
    const label = String(action.payload.label ?? 'Measurement');
    const mode = (action.payload.mode ?? 'linear') as MeasurementMode;
    const targetPage = Number(action.payload.target_page ?? 1);

    const handleStart = () => {
      // Derive trade from the semantic tag prefix where possible.
      // For v1 tags: exterior_wall_area / attic_floor_area / rim_joist_lf → insulation
      //              eave_run_lf / gutters_downspout_location → gutters
      const trade = semanticTag.startsWith('eave_') || semanticTag.startsWith('gutters_')
        ? 'gutters'
        : 'insulation';
      setActiveMeasurementTool({
        trade,
        measurementType: deriveMeasurementType(semanticTag),
        mode,
      });
      // Surface a navigation request so the viewer jumps to the right page
      window.dispatchEvent(
        new CustomEvent('takeoff:navigate-page', { detail: { page: targetPage } })
      );
      onResolved();
    };

    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
        <div className="flex items-start gap-2">
          <Ruler className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900">Take a measurement</p>
            <p className="text-xs text-gray-700 mt-0.5">{label}</p>
            <p className="text-[10px] text-gray-500 mt-1">
              Page {targetPage} · {modeLabel(mode)} · tag: <code className="text-[10px]">{semanticTag}</code>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleStart}
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-primary text-white hover:bg-primary/90 cursor-pointer"
          >
            <Ruler className="h-3 w-3" /> Measure
          </button>
          <button
            onClick={onResolved}
            className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer px-2 py-1"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  if (action.kind === 'confirmation_requested') {
    const question = String(action.payload.question ?? '');
    const context = action.payload.context ? String(action.payload.context) : null;

    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900">{question}</p>
            {context && <p className="text-xs text-gray-700 mt-0.5">{context}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onResolved}
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 cursor-pointer"
          >
            <Check className="h-3 w-3" /> Yes
          </button>
          <button
            onClick={onResolved}
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer"
          >
            <X className="h-3 w-3" /> No
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function modeLabel(mode: MeasurementMode): string {
  if (mode === 'linear') return 'Linear (LF)';
  if (mode === 'area') return 'Area (SF)';
  return 'Surface area (LF × height)';
}

/**
 * Map a semantic tag back to the UI-facing measurement type. Used to
 * activate the measurement tool with the right type when the agent
 * suggests a measurement.
 */
function deriveMeasurementType(tag: string): string {
  const map: Record<string, string> = {
    exterior_wall_area: 'exterior_wall',
    attic_floor_area: 'attic_floor',
    crawlspace_floor_area: 'crawlspace_floor',
    crawlspace_wall_area: 'crawlspace_wall',
    floor_area: 'floor',
    rim_joist_lf: 'rim_joist',
    eave_run_lf: 'eave_run',
    gutters_downspout_location: 'downspout',
  };
  return map[tag] ?? 'other';
}
