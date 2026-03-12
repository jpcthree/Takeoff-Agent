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

export default function WorkspacePage() {
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
          <ChatPanel
            projectName="Noble Klone ADU"
            projectAddress="3147 8th Street"
            lineItemsSummary="Insulation: 4 items (wall batts, blown-in attic, house wrap). Drywall: 5 items (sheets, compound, tape, corner bead). Roofing: 4 items (shingles, underlayment, flashing)."
          />
        </ErrorBoundary>
      </Panel>
    </Group>
  );
}
