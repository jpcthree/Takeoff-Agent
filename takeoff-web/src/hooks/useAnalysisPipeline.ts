'use client';

import { useCallback, useRef } from 'react';
import { useProjectStore } from './useProjectStore';
import { calculateSelectedTrades, AVAILABLE_TRADES, getTradeLabel } from '@/lib/api/python-service';
import { pythonLineItemToSpreadsheet } from '@/lib/utils/calculations';
import { analyzeBlueprint, type AnalysisProgress } from '@/lib/services/blueprint-analyzer';

/**
 * Hook that orchestrates the full analysis pipeline:
 * PDF file → text extraction → per-page Claude analysis → merge → calculators → spreadsheet
 *
 * Claude calls run directly from the browser (no Vercel function involved)
 * to avoid body size and timeout limits.
 *
 * Only runs calculators for the trades selected during project creation.
 */
export function useAnalysisPipeline() {
  const {
    state,
    setBuildingModel,
    setLineItems,
    setStatus,
    setError,
    addAnalysisMessage,
    dispatch,
  } = useProjectStore();

  const abortRef = useRef<AbortController | null>(null);

  /** Cancel any in-progress pipeline operation. */
  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus('idle');
    addAnalysisMessage('Cancelled by user');
  }, [setStatus, addAnalysisMessage]);

  /**
   * Fetch the Anthropic API key from the server.
   * Falls back to null if not configured.
   */
  const fetchApiKey = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/claude-key');
      if (!res.ok) return null;
      const data = await res.json();
      return data.key || null;
    } catch {
      return null;
    }
  }, []);

  /**
   * Run blueprint analysis directly from the browser.
   * Uses text extraction + per-page Claude calls.
   */
  const analyzeBlueprints = useCallback(
    async (projectMeta?: { name?: string; address?: string; buildingType?: string }) => {
      if (!state.pdfFile) {
        setError('No PDF file loaded. Upload a PDF first.');
        return null;
      }

      // Cancel any previous run
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('analyzing');
      dispatch({ type: 'CLEAR_ANALYSIS_MESSAGES' });
      addAnalysisMessage('Starting blueprint analysis...');

      try {
        // Get API key
        const apiKey = await fetchApiKey();
        if (!apiKey) {
          // Fall back to mock
          addAnalysisMessage('No API key configured — using demo mode');
          const mockModel = createMockModel(projectMeta);
          setBuildingModel(mockModel);
          addAnalysisMessage('✓ Demo building model loaded');
          return mockModel;
        }

        if (controller.signal.aborted) return null;

        // Run the client-side analysis
        const onProgress = (progress: AnalysisProgress) => {
          addAnalysisMessage(progress.message);
        };

        const buildingModel = await analyzeBlueprint(
          state.pdfFile,
          projectMeta || {},
          apiKey,
          onProgress,
          controller.signal
        );

        if (buildingModel) {
          setBuildingModel(buildingModel);
          addAnalysisMessage('✓ Building model extracted — ready to calculate');
          return buildingModel;
        } else {
          throw new Error(
            'No building model extracted. The blueprint may not contain recognizable construction details.'
          );
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          addAnalysisMessage('Analysis cancelled');
          setStatus('idle');
          return null;
        }
        const msg = err instanceof Error ? err.message : 'Analysis failed';
        setError(msg);
        addAnalysisMessage(`✗ Error: ${msg}`);
        return null;
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [state.pdfFile, setBuildingModel, setStatus, setError, addAnalysisMessage, dispatch, fetchApiKey]
  );

  /**
   * Run trade calculators for only the selected trades.
   * Calls per-trade Python API endpoints on Railway.
   */
  const runCalculators = useCallback(
    async (model?: Record<string, unknown>) => {
      const buildingModel = model || state.buildingModel;
      if (!buildingModel) {
        setError('No building model available. Run analysis first.');
        return;
      }

      // Cancel any previous run
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Determine which trades to run
      const selectedTrades = state.projectMeta.selectedTrades.length > 0
        ? state.projectMeta.selectedTrades
        : AVAILABLE_TRADES.map((t) => t.id); // fallback: all available trades

      setStatus('calculating');
      const tradeLabels = selectedTrades.map(getTradeLabel).join(', ');
      addAnalysisMessage(`Running calculators for: ${tradeLabels}`);

      try {
        const result = await calculateSelectedTrades(
          selectedTrades,
          buildingModel,
          state.costs || undefined,
          controller.signal,
          (trade, index, total) => {
            addAnalysisMessage(`✓ ${getTradeLabel(trade)} complete (${index}/${total})`);
          }
        );

        // Transform Python LineItems to frontend SpreadsheetLineItems
        const spreadsheetItems = result.items.map((item, index) =>
          pythonLineItemToSpreadsheet(item, index)
        );

        setLineItems(spreadsheetItems, result.items);
        setStatus('ready');
        addAnalysisMessage(
          `✓ Complete: ${result.count} line items across ${result.trades.length} trades`
        );

        if (result.failedTrades && result.failedTrades.length > 0) {
          const failedLabels = result.failedTrades.map(getTradeLabel).join(', ');
          addAnalysisMessage(`⚠ Failed trades: ${failedLabels} — try recalculating individually`);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          addAnalysisMessage('Calculation cancelled');
          setStatus('idle');
          return;
        }
        const msg = err instanceof Error ? err.message : 'Calculation failed';
        setError(msg);
        addAnalysisMessage(`✗ Error: ${msg}`);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [state.buildingModel, state.costs, state.projectMeta.selectedTrades, setLineItems, setStatus, setError, addAnalysisMessage]
  );

  /**
   * Full pipeline: analyze blueprints then run calculators.
   */
  const runFullPipeline = useCallback(
    async (
      _pages?: unknown, // Kept for API compatibility but no longer used (we use state.pdfFile)
      projectMeta?: { name?: string; address?: string; buildingType?: string }
    ) => {
      const model = await analyzeBlueprints(projectMeta);
      if (model) {
        await runCalculators(model);
      }
    },
    [analyzeBlueprints, runCalculators]
  );

  return {
    analyzeBlueprints,
    runCalculators,
    runFullPipeline,
    cancel,
    isAnalyzing: state.analysisStatus === 'analyzing',
    isCalculating: state.analysisStatus === 'calculating',
    isReady: state.analysisStatus === 'ready',
    analysisMessages: state.analysisMessages,
  };
}

// ---------------------------------------------------------------------------
// Mock model for demo/dev mode (no API key)
// ---------------------------------------------------------------------------

function createMockModel(
  meta?: { name?: string; address?: string; buildingType?: string }
): Record<string, unknown> {
  return {
    project_name: meta?.name || 'Demo ADU',
    project_address: meta?.address || '123 Main Street',
    building_type: meta?.buildingType || 'residential',
    stories: 1,
    sqft: 520,
    walls: [
      { id: 'w1', floor: 1, wall_type: 'exterior', length: { feet: 26, inches: 0 }, height: { feet: 9, inches: 0 }, thickness: '2x6', is_exterior: true, stud_spacing: 16, insulation_type: 'closed_cell_spray', insulation_r_value: 30, drywall_type: 'standard_1_2', openings: ['o1'] },
      { id: 'w2', floor: 1, wall_type: 'exterior', length: { feet: 20, inches: 0 }, height: { feet: 9, inches: 0 }, thickness: '2x6', is_exterior: true, stud_spacing: 16, insulation_type: 'closed_cell_spray', insulation_r_value: 30, drywall_type: 'standard_1_2', openings: ['o2'] },
      { id: 'w3', floor: 1, wall_type: 'exterior', length: { feet: 26, inches: 0 }, height: { feet: 9, inches: 0 }, thickness: '2x6', is_exterior: true, stud_spacing: 16, insulation_type: 'closed_cell_spray', insulation_r_value: 30, drywall_type: 'standard_1_2', openings: ['o3'] },
      { id: 'w4', floor: 1, wall_type: 'exterior', length: { feet: 20, inches: 0 }, height: { feet: 9, inches: 0 }, thickness: '2x6', is_exterior: true, stud_spacing: 16, insulation_type: 'closed_cell_spray', insulation_r_value: 30, drywall_type: 'standard_1_2', openings: [] },
    ],
    rooms: [
      { id: 'r1', floor: 1, name: 'Living Room', length: { feet: 14, inches: 0 }, width: { feet: 12, inches: 0 }, height: { feet: 9, inches: 0 }, floor_finish: 'vinyl_plank' },
      { id: 'r2', floor: 1, name: 'Bedroom', length: { feet: 12, inches: 0 }, width: { feet: 10, inches: 0 }, height: { feet: 9, inches: 0 }, floor_finish: 'vinyl_plank' },
      { id: 'r3', floor: 1, name: 'Kitchen', length: { feet: 10, inches: 0 }, width: { feet: 8, inches: 0 }, height: { feet: 9, inches: 0 }, is_kitchen: true, floor_finish: 'vinyl_plank' },
      { id: 'r4', floor: 1, name: 'Bathroom', length: { feet: 8, inches: 0 }, width: { feet: 6, inches: 0 }, height: { feet: 9, inches: 0 }, is_bathroom: true, floor_finish: 'tile' },
    ],
    openings: [
      { id: 'o1', opening_type: 'window', width: { feet: 3, inches: 0 }, height: { feet: 5, inches: 0 }, quantity: 2 },
      { id: 'o2', opening_type: 'door', width: { feet: 3, inches: 0 }, height: { feet: 6, inches: 8 }, quantity: 1 },
      { id: 'o3', opening_type: 'window', width: { feet: 4, inches: 0 }, height: { feet: 3, inches: 0 }, quantity: 1 },
    ],
    roof: { style: 'gable', material: 'architectural_shingle', pitch: 5, total_area_sf: 650, ridge_length: { feet: 26, inches: 0 }, eave_length: { feet: 52, inches: 0 } },
    foundation: { type: 'slab', perimeter_lf: 92, area_sf: 520 },
    siding_type: 'fiber_cement',
  };
}
