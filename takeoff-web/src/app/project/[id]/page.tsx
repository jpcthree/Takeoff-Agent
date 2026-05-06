'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Panel,
  Group,
  Separator,
} from 'react-resizable-panels';
import { Minimize2 } from 'lucide-react';
import { LeftPanel } from '@/components/workspace/LeftPanel';
import { PlansTabContent } from '@/components/workspace/PlansTabContent';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ProjectStoreProvider, useProjectStore } from '@/hooks/useProjectStore';
import { useSheetClassification } from '@/hooks/useSheetClassification';
import { useV2Persistence } from '@/hooks/useV2Persistence';
import { loadSavedEstimate } from '@/lib/data/estimate-persistence';
import { calculateRow } from '@/lib/utils/calculations';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  loadLineItemsLocal,
  loadMeasurementsLocal,
  loadPageScalesLocal,
  loadPageClassificationsLocal,
  saveLineItemsLocal,
  saveMeasurementsLocal,
  savePageScalesLocal,
  savePageClassificationsLocal,
} from '@/lib/data/local-persistence';
import type { SpreadsheetLineItem } from '@/lib/types/line-item';
import { buildExportItems } from '@/lib/utils/export';
import { exportXlsx } from '@/lib/api/python-service';

/** Inner component that can use the store context */
function WorkspaceInner() {
  const params = useParams();
  const projectId = params?.id as string | undefined;
  const { state, dispatch, setLineItems } = useProjectStore();
  const [expandedPanel, setExpandedPanel] = useState<'pdf' | 'estimate' | null>(null);
  const loadedRef = useRef(false);

  // Auto-classify sheets when pages arrive (Layer 1 of v2 architecture).
  // Surface its error through the existing state.error banner in PdfViewer.
  const sheetClassification = useSheetClassification(projectId);
  useEffect(() => {
    if (sheetClassification.error) {
      dispatch({ type: 'SET_ERROR', error: `Sheet classification: ${sheetClassification.error}` });
    }
  }, [sheetClassification.error, dispatch]);

  // Hydrate + persist v2 conversation state (assumptions, scope items, phase, etc.)
  useV2Persistence(projectId);

  // Auto-pick the active trade from the project's selected trades. The agent
  // operates on one trade at a time (sequential mode); this seeds the choice
  // with the first selected trade so the user doesn't have to set it manually.
  useEffect(() => {
    if (state.activeTradeId) return;
    const selected = state.projectMeta.selectedTrades;
    if (selected && selected.length > 0) {
      dispatch({ type: 'SET_ACTIVE_TRADE', tradeId: selected[0] });
    }
  }, [state.activeTradeId, state.projectMeta.selectedTrades, dispatch]);

  // Listen for the layout's Export button. Builds a unified payload from
  // v2 ScopeItems + legacy lineItems, hands it to the existing /export.
  useEffect(() => {
    const handler = async () => {
      try {
        const items = buildExportItems(state.scopeItems, state.lineItems);
        if (items.length === 0) {
          alert('No items to export. Take some measurements and confirm assumptions first.');
          return;
        }
        await exportXlsx(
          items,
          state.projectMeta.name || 'Estimate',
          state.projectMeta.address
        );
      } catch (err) {
        console.error('Export failed:', err);
        alert(`Export failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      } finally {
        window.dispatchEvent(new CustomEvent('takeoff:export-done'));
      }
    };
    window.addEventListener('takeoff:export', handler);
    return () => window.removeEventListener('takeoff:export', handler);
  }, [state.scopeItems, state.lineItems, state.projectMeta]);

  // Load project meta from sessionStorage (works for both local and Supabase projects)
  useEffect(() => {
    const id = params?.id as string;
    if (!id) return;
    try {
      const stored = sessionStorage.getItem(`project-meta-${id}`);
      if (stored) {
        const meta = JSON.parse(stored);
        dispatch({
          type: 'SET_PROJECT_META',
          meta: {
            id,
            name: meta.name || '',
            address: meta.address || '',
            buildingType: meta.buildingType || 'residential',
            selectedTrades: meta.selectedTrades || [],
          },
        });
      }
    } catch {
      // Ignore parse errors
    }
  }, [params?.id, dispatch]);

  // Load saved data on mount — localStorage first, then Supabase fallback
  useEffect(() => {
    const id = params?.id as string;
    if (!id || loadedRef.current) return;
    loadedRef.current = true;

    // 1. Try localStorage first (always available, fast)
    const localItems = loadLineItemsLocal(id);
    const localMeasurements = loadMeasurementsLocal(id);
    const localScales = loadPageScalesLocal(id);
    const localClassifications = loadPageClassificationsLocal(id);

    let hasLocalData = false;

    if (localItems && localItems.length > 0) {
      setLineItems(localItems);
      dispatch({ type: 'SET_STATUS', status: 'ready' });
      hasLocalData = true;
    }

    if (localMeasurements && localMeasurements.length > 0) {
      for (const m of localMeasurements) {
        dispatch({ type: 'ADD_MEASUREMENT', measurement: m });
      }
      hasLocalData = true;
    }

    if (localScales) {
      dispatch({ type: 'SET_PAGE_SCALES', scales: localScales.scales });
      if (Object.keys(localScales.overrides).length > 0) {
        for (const [pageStr, scale] of Object.entries(localScales.overrides)) {
          dispatch({ type: 'SET_SCALE_OVERRIDE', pageNumber: Number(pageStr), scale });
        }
      }
      hasLocalData = true;
    }

    if (localClassifications && localClassifications.length > 0) {
      dispatch({ type: 'SET_PAGE_CLASSIFICATIONS', classifications: localClassifications });
      hasLocalData = true;
    }

    // 2. If no local data, try Supabase
    if (!hasLocalData && isSupabaseConfigured()) {
      loadSavedEstimate(id).then((saved) => {
        if (!saved || saved.lineItems.length === 0) return;

        const spreadsheetItems: SpreadsheetLineItem[] = saved.lineItems.map((item, idx) => {
          const calc = calculateRow(item.quantity, item.unitCost, item.laborRatePct, item.unitPrice);
          return {
            id: `loaded-${idx}-${Date.now()}`,
            trade: item.trade,
            category: item.category,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitCost: item.unitCost,
            laborRatePct: item.laborRatePct,
            unitPrice: item.unitPrice,
            ...calc,
            sortOrder: item.sortOrder,
            isUserAdded: item.isUserAdded,
          };
        });

        setLineItems(spreadsheetItems);
        dispatch({ type: 'SET_STATUS', status: 'ready' });
      }).catch((err) => {
        console.warn('Failed to load saved estimate:', err);
      });
    }
  }, [params?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save to localStorage whenever key state changes
  useEffect(() => {
    const id = params?.id as string;
    if (!id || !loadedRef.current) return;

    if (state.lineItems.length > 0) {
      saveLineItemsLocal(id, state.lineItems);
    }
  }, [params?.id, state.lineItems]);

  useEffect(() => {
    const id = params?.id as string;
    if (!id || !loadedRef.current) return;

    if (state.measurements.length > 0) {
      saveMeasurementsLocal(id, state.measurements);
    }
  }, [params?.id, state.measurements]);

  useEffect(() => {
    const id = params?.id as string;
    if (!id || !loadedRef.current) return;

    if (Object.keys(state.pageScales).length > 0 || Object.keys(state.scaleOverrides).length > 0) {
      savePageScalesLocal(id, state.pageScales, state.scaleOverrides);
    }
  }, [params?.id, state.pageScales, state.scaleOverrides]);

  useEffect(() => {
    const id = params?.id as string;
    if (!id || !loadedRef.current) return;

    if (state.pageClassifications.length > 0) {
      savePageClassificationsLocal(id, state.pageClassifications);
    }
  }, [params?.id, state.pageClassifications]);

  const handleExpand = useCallback((panel: 'pdf' | 'estimate') => {
    setExpandedPanel(panel);
  }, []);

  const handleCollapse = useCallback(() => {
    setExpandedPanel(null);
  }, []);

  // Escape key exits expanded mode
  useEffect(() => {
    if (!expandedPanel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedPanel(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expandedPanel]);

  // Expanded panel: full screen with a collapse button
  if (expandedPanel) {
    return (
      <div className="h-full relative">
        <button
          onClick={handleCollapse}
          className="absolute top-2 right-2 z-50 flex items-center gap-1.5 bg-white/90 backdrop-blur border border-gray-200 text-gray-600 hover:text-gray-900 text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
          title="Exit full screen (Esc)"
        >
          <Minimize2 className="h-3.5 w-3.5" />
          Exit Full Screen
        </button>
        <ErrorBoundary>
          {expandedPanel === 'pdf' ? (
            <LeftPanel onExpand={() => handleExpand('pdf')} onCollapse={handleCollapse} isExpanded />
          ) : (
            <PlansTabContent onExpand={() => handleExpand('estimate')} onCollapse={handleCollapse} isExpanded />
          )}
        </ErrorBoundary>
      </div>
    );
  }

  // Takeoff mode: 3-panel layout
  return (
    <Group orientation="horizontal" className="h-full">
      {/* Left panel: Plans + Takeoffs */}
      <Panel defaultSize={35} minSize={20}>
        <ErrorBoundary>
          <LeftPanel onExpand={() => handleExpand('pdf')} />
        </ErrorBoundary>
      </Panel>

      <Separator className="w-1 bg-gray-200 hover:bg-primary/40 transition-colors" />

      {/* Spreadsheet with trade tabs */}
      <Panel defaultSize={40} minSize={25}>
        <ErrorBoundary>
          <PlansTabContent onExpand={() => handleExpand('estimate')} />
        </ErrorBoundary>
      </Panel>

      <Separator className="w-1 bg-gray-200 hover:bg-primary/40 transition-colors" />

      {/* Chat */}
      <Panel defaultSize={25} minSize={15} collapsible>
        <ErrorBoundary>
          <ChatPanel />
        </ErrorBoundary>
      </Panel>
    </Group>
  );
}

export default function WorkspacePage() {
  return (
    <ProjectStoreProvider>
      <WorkspaceInner />
    </ProjectStoreProvider>
  );
}
