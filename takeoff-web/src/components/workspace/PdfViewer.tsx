'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  Upload,
  Play,
  Loader2,
  Calculator,
  X,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { useProjectStore } from '@/hooks/useProjectStore';
import { useAnalysisPipeline } from '@/hooks/useAnalysisPipeline';
import { convertPdfClientSide } from '@/lib/utils/pdf-to-images';
import { getPdfFiles, clearPdfFiles } from '@/lib/utils/pdf-store';

function PdfViewer() {
  const params = useParams();
  const projectId = params?.id as string;

  const { state, setPdfFile, setPdfPages, setStatus, setError } = useProjectStore();
  const { pdfPages, analysisStatus, buildingModel, analysisMessages, error } = state;
  const {
    runFullPipeline,
    runCalculators,
    cancel,
    isAnalyzing,
    isCalculating,
  } = useAnalysisPipeline();

  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [isConverting, setIsConverting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalPages = pdfPages.length;
  const hasPlan = totalPages > 0;
  const currentPageData = hasPlan ? pdfPages[currentPage - 1] : null;
  const isBusy = isAnalyzing || isCalculating || isConverting;

  // Auto-load PDF files from IndexedDB (uploaded during wizard)
  useEffect(() => {
    if (autoLoaded || hasPlan || !projectId) return;
    setAutoLoaded(true);

    (async () => {
      try {
        const files = await getPdfFiles(projectId);
        if (files.length > 0) {
          // Convert the first PDF file
          const file = files[0];
          setPdfFile(file);
          setIsConverting(true);
          setStatus('converting');

          const result = await convertPdfClientSide(file, 150);
          setPdfPages(result.pages);
          setCurrentPage(1);
          setStatus('idle');
          setIsConverting(false);

          // Clean up IndexedDB after loading
          await clearPdfFiles(projectId);
        }
      } catch (err) {
        console.error('Failed to auto-load PDF:', err);
        setIsConverting(false);
        setStatus('idle');
      }
    })();
  }, [projectId, autoLoaded, hasPlan, setPdfFile, setPdfPages, setStatus]);

  // Elapsed timer while analyzing/calculating
  useEffect(() => {
    if (isAnalyzing || isCalculating) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAnalyzing, isCalculating]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setError('Please upload a PDF file');
        return;
      }

      setPdfFile(file);
      setIsConverting(true);
      setStatus('converting');

      try {
        // Use client-side conversion (no Python API needed)
        const result = await convertPdfClientSide(file, 150);
        setPdfPages(result.pages);
        setCurrentPage(1);
        setStatus('idle');
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to convert PDF'
        );
        setStatus('idle');
      } finally {
        setIsConverting(false);
      }
    },
    [setPdfFile, setPdfPages, setStatus, setError]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const formatElapsed = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2 shrink-0">
        <h3 className="text-sm font-semibold text-gray-900">Plans</h3>
        <div className="flex items-center gap-1">
          {hasPlan && (
            <>
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
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer ml-1"
            title="Upload PDF"
            disabled={isBusy}
          >
            <Upload className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-auto custom-scrollbar flex items-center justify-center"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {isConverting ? (
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Converting PDF pages...</p>
            <p className="text-xs text-gray-400">This may take a moment for large files</p>
          </div>
        ) : hasPlan && currentPageData ? (
          <div
            className="p-2"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          >
            <img
              src={`data:${currentPageData.mime_type};base64,${currentPageData.data}`}
              alt={`Page ${currentPage}`}
              className="max-w-full shadow-sm border border-gray-200"
              draggable={false}
            />
          </div>
        ) : (
          <div
            className="flex flex-col items-center gap-3 text-center px-6 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <FileText className="h-7 w-7 text-gray-300" />
            </div>
            <p className="text-sm text-gray-500">
              Drop a PDF here or click to upload
            </p>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="border-t border-red-200 bg-red-50 px-3 py-2 shrink-0">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 flex-1">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Analysis progress */}
      {(isAnalyzing || isCalculating) && (
        <div className="border-t border-blue-200 bg-blue-50 px-3 py-2 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-blue-800">
              {isAnalyzing ? 'Analyzing blueprints...' : 'Running calculators...'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-600 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatElapsed(elapsed)}
              </span>
              <button
                onClick={cancel}
                className="text-xs text-red-600 hover:text-red-800 flex items-center gap-0.5 cursor-pointer"
              >
                <X className="h-3 w-3" /> Cancel
              </button>
            </div>
          </div>
          <div className="max-h-[80px] overflow-y-auto">
            {analysisMessages.slice(-5).map((msg, i) => (
              <p key={i} className="text-xs text-blue-700 truncate">
                {msg}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Bottom controls */}
      {hasPlan && (
        <div className="flex flex-col gap-2 border-t border-gray-200 bg-white px-3 py-2 shrink-0">
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                runFullPipeline(pdfPages, {
                  name: state.projectMeta.name,
                  address: state.projectMeta.address,
                  buildingType: state.projectMeta.buildingType,
                })
              }
              disabled={isBusy}
              className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-white text-xs font-medium px-3 py-1.5 rounded hover:bg-primary/90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing...
                </>
              ) : isCalculating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculating...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" /> Analyze &amp; Calculate
                </>
              )}
            </button>
            {buildingModel && (
              <button
                onClick={() => runCalculators()}
                disabled={isBusy}
                className="flex items-center gap-1.5 bg-green-600 text-white text-xs font-medium px-3 py-1.5 rounded hover:bg-green-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                <Calculator className="h-3.5 w-3.5" /> Recalculate
              </button>
            )}
          </div>

          {/* Zoom controls */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setZoom((z) => Math.max(25, z - 25))}
              className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs text-gray-500 min-w-[40px] text-center">
              {zoom}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(400, z + 25))}
              className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setZoom(100)}
              className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
              title="Reset zoom"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { PdfViewer };
