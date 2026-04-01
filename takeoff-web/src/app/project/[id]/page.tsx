'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Panel,
  Group,
  Separator,
} from 'react-resizable-panels';
import { Minimize2 } from 'lucide-react';
import { PdfViewer } from '@/components/workspace/PdfViewer';
import { LeftPanel } from '@/components/workspace/LeftPanel';
import { RetrofitWorkspace } from '@/components/workspace/RetrofitWorkspace';
import { PlansTabContent } from '@/components/workspace/PlansTabContent';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ProjectStoreProvider, useProjectStore } from '@/hooks/useProjectStore';

/** Inner component that can use the store context */
function WorkspaceInner() {
  const params = useParams();
  const { dispatch, setProjectType } = useProjectStore();
  const [inputMethod, setInputMethod] = useState<'plans' | 'address'>('plans');
  const [expandedPanel, setExpandedPanel] = useState<'pdf' | 'estimate' | null>(null);

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
