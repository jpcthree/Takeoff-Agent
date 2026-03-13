'use client';

import React from 'react';
import {
  Panel,
  Group,
  Separator,
} from 'react-resizable-panels';
import { PdfViewer } from '@/components/workspace/PdfViewer';
import { SpreadsheetTable } from '@/components/workspace/SpreadsheetTable';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ProjectStoreProvider } from '@/hooks/useProjectStore';

export default function WorkspacePage() {
  return (
    <ProjectStoreProvider>
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
    </ProjectStoreProvider>
  );
}
