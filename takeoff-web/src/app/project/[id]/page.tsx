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
import { RetrofitWorkspace } from '@/components/workspace/RetrofitWorkspace';
import { PlansTabContent } from '@/components/workspace/PlansTabContent';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ProjectStoreProvider, useProjectStore } from '@/hooks/useProjectStore';
import { loadSavedEstimate } from '@/lib/data/estimate-persistence';
import { calculateRow } from '@/lib/utils/calculations';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  loadLineItemsLocal,
  loadBuildingModelLocal,
  loadMeasurementsLocal,
  loadPageScalesLocal,
  loadPageClassificationsLocal,
  saveLineItemsLocal,
  saveBuildingModelLocal,
  saveMeasurementsLocal,
  savePageScalesLocal,
  savePageClassificationsLocal,
} from '@/lib/data/local-persistence';
import type { SpreadsheetLineItem } from '@/lib/types/line-item';

/** Inner component that can use the store context */
function WorkspaceInner() {
  const params = useParams();
  const { state, dispatch, setProjectType, setLineItems, setBuildingModel } = useProjectStore();
  const [inputMethod, setInputMethod] = useState<'plans' | 'address'>('plans');
  const [expandedPanel, setExpandedPanel] = useState<'pdf' | 'estimate' | null>(null);
  const loadedRef = useRef(false);

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
        // Set the input method / project type
        const method = meta.inputMethod === 'address' ? 'address' : 'plans';
        setInputMethod(method);
        setProjectType(method);
      }
    } catch {
      // Ignore parse errors
    }
  }, [params?.id, dispatch, setProjectType]);

  // Load saved data on mount — localStorage first, then Supabase fallback
  useEffect(() => {
    const id = params?.id as string;
    if (!id || loadedRef.current) return;
    loadedRef.current = true;

    // 1. Try localStorage first (always available, fast)
    const localItems = loadLineItemsLocal(id);
    const localModel = loadBuildingModelLocal(id);
    const localMeasurements = loadMeasurementsLocal(id);
    const localScales = loadPageScalesLocal(id);
    const localClassifications = loadPageClassificationsLocal(id);

    let hasLocalData = false;

    if (localItems && localItems.length > 0) {
      setLineItems(localItems, []);
      dispatch({ type: 'SET_STATUS', status: 'ready' });
      hasLocalData = true;
    }

    if (localModel) {
      setBuildingModel(localModel);
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

        setLineItems(spreadsheetItems, []);
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

    if (state.buildingModel) {
      saveBuildingModelLocal(id, state.buildingModel);
    }
  }, [params?.id, state.buildingModel]);

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

  const isAddressMode = inputMethod === 'address';

  // Retrofit mode: full-page layout with property hero + trade tabs
  if (isAddressMode) {
    return (
      <ErrorBoundary>
        <RetrofitWorkspace />
      </ErrorBoundary>
    );
  }

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
      <Panel defaultSize={20} minSize={15}>
        <ErrorBoundary>
          <LeftPanel onExpand={() => handleExpand('pdf')} />
        </ErrorBoundary>
      </Panel>

      <Separator className="w-1 bg-gray-200 hover:bg-primary/40 transition-colors" />

      {/* Spreadsheet with trade tabs */}
      <Panel defaultSize={55} minSize={30}>
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
