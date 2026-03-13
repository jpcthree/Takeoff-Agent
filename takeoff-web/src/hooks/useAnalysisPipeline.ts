'use client';

import { useCallback } from 'react';
import { useProjectStore } from './useProjectStore';
import { calculateAll } from '@/lib/api/python-service';
import { pythonLineItemToSpreadsheet } from '@/lib/utils/calculations';
import type { PdfPage } from '@/lib/api/python-service';

/**
 * Hook that orchestrates the full analysis pipeline:
 * PDF pages → Claude vision analysis → calculator execution → spreadsheet population
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

  /**
   * Run Claude vision analysis on PDF pages.
   * Streams progress and extracts BuildingModel.
   */
  const analyzeBlueprints = useCallback(
    async (pages: PdfPage[], projectMeta?: { name?: string; address?: string; buildingType?: string }) => {
      setStatus('analyzing');
      dispatch({ type: 'CLEAR_ANALYSIS_MESSAGES' });
      addAnalysisMessage('Starting blueprint analysis...');

      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pages: pages.map((p) => ({
              data: p.data,
              mime_type: p.mime_type,
              page_number: p.page_number,
            })),
            projectMeta,
          }),
        });

        if (!res.ok) {
          throw new Error(`Analysis failed: ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let buildingModel: Record<string, unknown> | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);

              if (event.type === 'text') {
                // Update analysis progress — look for section headers
                if (event.text.includes('##') || event.text.includes('**Page')) {
                  const cleanText = event.text.replace(/[#*]/g, '').trim();
                  if (cleanText.length > 3) {
                    addAnalysisMessage(cleanText);
                  }
                }
              } else if (event.type === 'building_model' && event.model) {
                buildingModel = event.model;
                addAnalysisMessage('Building model extracted successfully');
              } else if (event.type === 'error') {
                throw new Error(event.error);
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue; // Ignore malformed JSON
              throw e;
            }
          }
        }

        if (buildingModel) {
          setBuildingModel(buildingModel);
          addAnalysisMessage('Ready to run calculators');
          return buildingModel;
        } else {
          throw new Error('No building model extracted from analysis');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Analysis failed';
        setError(msg);
        addAnalysisMessage(`Error: ${msg}`);
        return null;
      }
    },
    [setBuildingModel, setStatus, setError, addAnalysisMessage, dispatch]
  );

  /**
   * Run all 9 trade calculators against the current building model.
   */
  const runCalculators = useCallback(
    async (model?: Record<string, unknown>) => {
      const buildingModel = model || state.buildingModel;
      if (!buildingModel) {
        setError('No building model available. Run analysis first.');
        return;
      }

      setStatus('calculating');
      addAnalysisMessage('Running trade calculators...');

      try {
        const result = await calculateAll(buildingModel, state.costs || undefined);

        // Transform Python LineItems to frontend SpreadsheetLineItems
        const spreadsheetItems = result.items.map((item, index) =>
          pythonLineItemToSpreadsheet(item, index)
        );

        setLineItems(spreadsheetItems, result.items);
        setStatus('ready');
        addAnalysisMessage(
          `Calculation complete: ${result.count} line items across ${result.trades.length} trades`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Calculation failed';
        setError(msg);
        addAnalysisMessage(`Error: ${msg}`);
      }
    },
    [state.buildingModel, state.costs, setLineItems, setStatus, setError, addAnalysisMessage]
  );

  /**
   * Full pipeline: analyze blueprints then run calculators.
   */
  const runFullPipeline = useCallback(
    async (pages: PdfPage[], projectMeta?: { name?: string; address?: string; buildingType?: string }) => {
      const model = await analyzeBlueprints(pages, projectMeta);
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
    isAnalyzing: state.analysisStatus === 'analyzing',
    isCalculating: state.analysisStatus === 'calculating',
    isReady: state.analysisStatus === 'ready',
    analysisMessages: state.analysisMessages,
  };
}
