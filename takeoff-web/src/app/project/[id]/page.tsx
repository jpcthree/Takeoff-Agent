'use client';

import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Panel,
  Group,
  Separator,
} from 'react-resizable-panels';
import { PdfViewer } from '@/components/workspace/PdfViewer';
import { SpreadsheetTable } from '@/components/workspace/SpreadsheetTable';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ProjectStoreProvider, useProjectStore } from '@/hooks/useProjectStore';

/** Inner component that can use the store context */
function WorkspaceInner() {
  const params = useParams();
  const { dispatch } = useProjectStore();

  // Load project meta from sessionStorage for local projects
  useEffect(() => {
    const id = params?.id as string;
    if (id?.startsWith('local-')) {
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
            },
          });
        }
      } catch {
        // Ignore parse errors
      }
    }
  }, [params?.id, dispatch]);

  return (
    <Group orientation="horizontal" className="h-full">
      {/* PDF Viewer */}
      <Panel defaultSize={20} minSize={15}>
        <ErrorBoundary>
          <PdfViewer />
        </ErrorBoundary>
      </Panel>

      <Separator className="w-1 bg-gray-200 hover:bg-primary/40 transition-colors" />

      {/* Spreadsheet */}
      <Panel defaultSize={55} minSize={30}>
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
