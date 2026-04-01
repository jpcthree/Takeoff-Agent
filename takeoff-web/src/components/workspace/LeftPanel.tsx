'use client';

import React, { useState, useCallback } from 'react';
import { FileText, Ruler } from 'lucide-react';
import { PdfViewer } from './PdfViewer';
import { TakeoffsList } from './TakeoffsList';
import { useProjectStore } from '@/hooks/useProjectStore';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LeftPanelProps {
  onExpand?: () => void;
  onCollapse?: () => void;
  isExpanded?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function LeftPanel({ onExpand, onCollapse, isExpanded }: LeftPanelProps) {
  const [activeTab, setActiveTab] = useState<'plans' | 'takeoffs'>('plans');
  const [navigateToPage, setNavigateToPage] = useState<number | null>(null);
  const [highlightedMeasurementId, setHighlightedMeasurementId] = useState<string | null>(null);
  const { state } = useProjectStore();

  const measurementCount = state.measurements.length;

  const handleNavigateToPage = useCallback((pageNumber: number) => {
    setNavigateToPage(pageNumber);
    setActiveTab('plans');
    // Reset after a tick so the same page can be re-navigated
    setTimeout(() => setNavigateToPage(null), 100);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-white shrink-0">
        <button
          onClick={() => setActiveTab('plans')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'plans'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          Plans
        </button>
        <button
          onClick={() => setActiveTab('takeoffs')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'takeoffs'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Ruler className="h-3.5 w-3.5" />
          Takeoffs
          {measurementCount > 0 && (
            <span className="bg-primary/10 text-primary text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {measurementCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'plans' ? (
          <PdfViewer
            onExpand={onExpand}
            onCollapse={onCollapse}
            isExpanded={isExpanded}
            highlightedMeasurementId={highlightedMeasurementId}
            navigateToPage={navigateToPage}
          />
        ) : (
          <TakeoffsList
            onNavigateToPage={handleNavigateToPage}
            onHoverMeasurement={setHighlightedMeasurementId}
          />
        )}
      </div>
    </div>
  );
}

export { LeftPanel };
