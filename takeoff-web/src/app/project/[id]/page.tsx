'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Panel,
  Group,
  Separator,
} from 'react-resizable-panels';
import { PdfViewer } from '@/components/workspace/PdfViewer';
import { PropertyInfoPanel } from '@/components/workspace/PropertyInfoPanel';
import { SpreadsheetTable } from '@/components/workspace/SpreadsheetTable';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ProjectStoreProvider, useProjectStore } from '@/hooks/useProjectStore';

/** Inner component that can use the store context */
function WorkspaceInner() {
  const params = useParams();
  const { dispatch, setProjectType } = useProjectStore();
  const [inputMethod, setInputMethod] = useState<'plans' | 'address'>('plans');

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

  const isAddressMode = inputMethod === 'address';

  return (
    <Group orientation="horizontal" className="h-full">
      {/* Left panel: PDF Viewer or Property Info */}
      <Panel defaultSize={isAddressMode ? 22 : 20} minSize={15}>
        <ErrorBoundary>
          {isAddressMode ? <PropertyInfoPanel /> : <PdfViewer />}
        </ErrorBoundary>
      </Panel>

      <Separator className="w-1 bg-gray-200 hover:bg-primary/40 transition-colors" />

      {/* Spreadsheet */}
      <Panel defaultSize={isAddressMode ? 53 : 55} minSize={30}>
        <ErrorBoundary>
          <SpreadsheetTable />
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
