'use client';

import { useCallback, useRef } from 'react';
import { useProjectStore } from './useProjectStore';
import { estimateFromAddress } from '@/lib/api/python-service';
import { pythonLineItemToSpreadsheet } from '@/lib/utils/calculations';
import { saveLineItems, saveProjectEstimateData } from '@/lib/data/estimate-persistence';

/**
 * Hook that orchestrates the address-based estimate pipeline.
 * Calls the Python API, stores results in the project store,
 * and reports progress via analysis messages.
 */
export function useAddressEstimate() {
  const {
    state,
    setStatus,
    setError,
    setLineItems,
    setEstimateData,
    setProjectType,
    addAnalysisMessage,
    dispatch,
  } = useProjectStore();

  const abortRef = useRef<AbortController | null>(null);

  const runEstimate = useCallback(async (address: string, climateZone = '5B') => {
    // Cancel any in-progress estimate
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setProjectType('address');
      setStatus('analyzing');
      setError(null);
      dispatch({ type: 'CLEAR_ANALYSIS_MESSAGES' });

      addAnalysisMessage('Looking up property data...');

      const result = await estimateFromAddress(address, climateZone, controller.signal);

      if (controller.signal.aborted) return;

      addAnalysisMessage(`Found property: ${result.property_data.total_sqft?.toLocaleString() || '?'} sqft, ${result.property_data.stories} stories`);
      addAnalysisMessage(`Generated ${result.line_items.length} line items across ${new Set(result.line_items.map(i => i.trade)).size} trades`);

      // Store estimate-specific data (property info, images, notes, etc.)
      setEstimateData({
        propertyData: result.property_data,
        propertyImages: result.images,
        propertyNotes: result.notes,
        insulationNotes: result.insulation_notes,
        assumptions: result.assumptions,
        roofClassification: result.roof_classification,
      });

      // Convert Python line items to spreadsheet format
      const spreadsheetItems = result.line_items.map((item, idx) =>
        pythonLineItemToSpreadsheet(item, idx)
      );
      setLineItems(spreadsheetItems, result.line_items);

      // Auto-save to Supabase if project has an ID
      const projectId = state.projectMeta.id;
      if (projectId) {
        saveLineItems(projectId, spreadsheetItems).catch(() => {});
        saveProjectEstimateData(projectId, {
          propertyData: result.property_data,
          assumptions: result.assumptions,
          inputMethod: 'address',
        }).catch(() => {});
      }

      setStatus('ready');
      addAnalysisMessage('Estimate complete!');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Estimate failed';
      setError(message);
      addAnalysisMessage(`Error: ${message}`);
    }
  }, [setProjectType, setStatus, setError, setLineItems, setEstimateData, addAnalysisMessage, dispatch]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
  }, [setStatus]);

  return {
    runEstimate,
    cancel,
    isRunning: state.analysisStatus === 'analyzing',
  };
}
