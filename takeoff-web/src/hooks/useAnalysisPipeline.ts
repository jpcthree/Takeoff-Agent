'use client';

import { useCallback, useRef } from 'react';
import { useProjectStore } from './useProjectStore';
import { calculateAll } from '@/lib/api/python-service';
import { pythonLineItemToSpreadsheet } from '@/lib/utils/calculations';
import { createAnalysisPages } from '@/lib/utils/pdf-to-images';
import type { PdfPage } from '@/lib/api/python-service';

/**
 * Hook that orchestrates the full analysis pipeline:
 * PDF pages → Claude vision analysis → calculator execution → spreadsheet population
 *
 * Includes proper timeouts, cancellation, and progress feedback.
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

  /**
   * Cancel any in-progress pipeline operation.
   */
  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus('idle');
    addAnalysisMessage('Cancelled by user');
  }, [setStatus, addAnalysisMessage]);

  /**
   * Run Claude vision analysis on PDF pages.
   * Streams progress and extracts BuildingModel.
   */
  const analyzeBlueprints = useCallback(
    async (
      pages: PdfPage[],
      projectMeta?: { name?: string; address?: string; buildingType?: string }
    ) => {
      // Cancel any previous run
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('analyzing');
      dispatch({ type: 'CLEAR_ANALYSIS_MESSAGES' });
      addAnalysisMessage(`Analyzing ${pages.length} blueprint page(s)...`);

      try {
        // If we have the original PDF file, create compressed JPEG analysis pages
        // (much smaller than the full-res PNG display pages)
        let analysisPages: { data: string; mime_type: string; page_number: number }[];

        if (state.pdfFile) {
          addAnalysisMessage('Compressing pages for analysis...');
          const compressed = await createAnalysisPages(state.pdfFile, 100);
          analysisPages = compressed.map((p) => ({
            data: p.data,
            mime_type: p.mime_type,
            page_number: p.page_number,
          }));
        } else {
          // Fallback: use the display pages as-is
          analysisPages = pages.map((p) => ({
            data: p.data,
            mime_type: p.mime_type,
            page_number: p.page_number,
          }));
        }

        // Client-side timeout: 3 minutes max for vision analysis
        const timeoutId = setTimeout(() => controller.abort(), 180_000);

        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pages: analysisPages,
            projectMeta,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(errBody.error || `Analysis failed: ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let buildingModel: Record<string, unknown> | null = null;
        let charCount = 0;

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
                charCount += event.text.length;
                // Show progress updates at key points
                if (event.text.includes('##') || event.text.includes('**Page') || event.text.includes('**Key')) {
                  const cleanText = event.text.replace(/[#*]/g, '').trim();
                  if (cleanText.length > 3) {
                    addAnalysisMessage(cleanText);
                  }
                }
                // Also show periodic progress
                if (charCount % 2000 < 50) {
                  addAnalysisMessage('Claude is analyzing blueprints...');
                }
              } else if (event.type === 'building_model' && event.model) {
                buildingModel = event.model;
                addAnalysisMessage('✓ Building model extracted successfully');
              } else if (event.type === 'error') {
                throw new Error(event.error);
              } else if (event.type === 'done') {
                // Stream complete
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue; // Ignore malformed JSON chunks
              throw e;
            }
          }
        }

        if (buildingModel) {
          setBuildingModel(buildingModel);
          addAnalysisMessage('✓ Ready to run calculators');
          return buildingModel;
        } else {
          throw new Error(
            'No building model extracted from analysis. Claude may not have recognized the blueprint format.'
          );
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          addAnalysisMessage('Analysis cancelled or timed out');
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

      // Cancel any previous run
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('calculating');
      addAnalysisMessage('Running trade calculators...');

      try {
        const result = await calculateAll(
          buildingModel,
          state.costs || undefined,
          controller.signal
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
    [state.buildingModel, state.costs, setLineItems, setStatus, setError, addAnalysisMessage]
  );

  /**
   * Full pipeline: analyze blueprints then run calculators.
   */
  const runFullPipeline = useCallback(
    async (
      pages: PdfPage[],
      projectMeta?: { name?: string; address?: string; buildingType?: string }
    ) => {
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
    cancel,
    isAnalyzing: state.analysisStatus === 'analyzing',
    isCalculating: state.analysisStatus === 'calculating',
    isReady: state.analysisStatus === 'ready',
    analysisMessages: state.analysisMessages,
  };
}
