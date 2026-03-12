'use client';

import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
} from 'lucide-react';

function PdfViewer() {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages] = useState(0);
  const [zoom, setZoom] = useState(100);

  const hasPlan = totalPages > 0;

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2 shrink-0">
        <h3 className="text-sm font-semibold text-gray-900">Plans</h3>
        {hasPlan && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-gray-500 min-w-[80px] text-center">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages, p + 1))
              }
              disabled={currentPage >= totalPages}
              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto custom-scrollbar flex items-center justify-center">
        {hasPlan ? (
          <div className="p-4">
            <p className="text-sm text-gray-500">Page image here</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <FileText className="h-7 w-7 text-gray-300" />
            </div>
            <p className="text-sm text-gray-500">
              Upload plans to view them here
            </p>
          </div>
        )}
      </div>

      {/* Zoom controls */}
      {hasPlan && (
        <div className="flex items-center justify-center gap-2 border-t border-gray-200 bg-white px-3 py-2 shrink-0">
          <button
            onClick={() => setZoom((z) => Math.max(25, z - 25))}
            className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-xs text-gray-500 min-w-[40px] text-center">
            {zoom}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(400, z + 25))}
            className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => setZoom(100)}
            className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
            title="Fit width"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export { PdfViewer };
