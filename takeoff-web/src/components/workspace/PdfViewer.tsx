'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  FileText,
  Upload,
  X,
  AlertCircle,
  Ruler,
  LayoutGrid,
} from 'lucide-react';
import { useProjectStore } from '@/hooks/useProjectStore';
import { useMeasurementTool } from '@/hooks/useMeasurementTool';
import { convertPdfClientSide } from '@/lib/utils/pdf-to-images';
import { getPdfFiles, clearPdfFiles } from '@/lib/utils/pdf-store';
import { MeasurementOverlay } from './MeasurementOverlay';
import { MeasurementToolbar } from './MeasurementToolbar';
import {
  polylineLength,
  formatPixelDistance,
  polygonArea,
  pixelAreaToRealSF,
} from '@/lib/utils/measurement-math';
import type { SheetType } from '@/lib/types/sheet-manifest';

/** Compact uppercase badges shown on classified thumbnails. */
const SHEET_TYPE_BADGE: Record<SheetType, string> = {
  cover: 'COVER',
  site_plan: 'SITE',
  floor_plan: 'PLAN',
  reflected_ceiling_plan: 'RCP',
  roof_plan: 'ROOF',
  elevation: 'ELEV',
  building_section: 'SECT',
  wall_section: 'WALL',
  detail: 'DTL',
  window_schedule: 'WIN',
  door_schedule: 'DOOR',
  wall_types: 'WT',
  specifications: 'SPEC',
  mechanical: 'MECH',
  electrical: 'ELEC',
  plumbing: 'PLMB',
  structural: 'STRUCT',
  unknown: '',
};

interface PdfViewerProps {
  onExpand?: () => void;
  onCollapse?: () => void;
  isExpanded?: boolean;
  /** ID of measurement to highlight on the overlay */
  highlightedMeasurementId?: string | null;
  /** External page navigation request (from TakeoffsList) */
  navigateToPage?: number | null;
}

function PdfViewer({ onExpand, onCollapse, isExpanded, highlightedMeasurementId, navigateToPage }: PdfViewerProps = {}) {
  const params = useParams();
  const projectId = params?.id as string;

  const { state, setPdfFile, setPdfPages, setStatus, setError, dispatch } = useProjectStore();
  const { pdfPages, error } = state;

  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [isConverting, setIsConverting] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const [showPageJump, setShowPageJump] = useState(false);
  const [pageJumpValue, setPageJumpValue] = useState('');
  const [showMeasureToolbar, setShowMeasureToolbar] = useState(false);
  const [imageDims, setImageDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageJumpRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalPages = pdfPages.length;
  const hasPlan = totalPages > 0;
  const currentPageData = hasPlan ? pdfPages[currentPage - 1] : null;
  const isBusy = isConverting;

  // ── Scale for measurement (override takes priority) ──
  const pageScaleOverride = state.scaleOverrides[currentPage];
  const pageScaleDetected = state.pageScales[currentPage];
  const effectiveScale = pageScaleOverride || pageScaleDetected;
  const scaleFactor = effectiveScale?.scaleFactor || 48;
  const scaleString = effectiveScale?.scaleString || '';

  // ── Measurement tool ──
  const measurement = useMeasurementTool(scaleFactor, scaleString, currentPage);
  const {
    toolState,
    activePoints,
    cursorPos,
    activeTool,
    startTool,
    handleClick: measureClick,
    handleDoubleClick: measureDoubleClick,
    handleMouseMove: measureMouseMove,
    undoLastPoint,
    cancelMeasurement,
    deactivateTool,
    confirmMeasurement,
    pendingResult,
    pendingLinearFt,
  } = measurement;

  // Measurements for current page only
  const pageMeasurements = state.measurements.filter((m) => m.pageNumber === currentPage);

  // Running label for the toolbar
  let runningLabel = '';
  if (activePoints.length >= 2 && activeTool && scaleFactor > 0) {
    if (activeTool.mode === 'linear' || activeTool.mode === 'surface_area') {
      runningLabel = formatPixelDistance(polylineLength(activePoints), scaleFactor);
    } else if (activeTool.mode === 'area' && activePoints.length >= 3) {
      const sf = pixelAreaToRealSF(polygonArea(activePoints), scaleFactor);
      runningLabel = `${Math.round(sf).toLocaleString()} SF`;
    }
  }

  // Handle external page navigation (prop-based)
  useEffect(() => {
    if (navigateToPage && navigateToPage >= 1 && navigateToPage <= totalPages) {
      setCurrentPage(navigateToPage);
      setViewMode('single');
    }
  }, [navigateToPage, totalPages]);

  // Handle agent-driven page navigation via custom events.
  // The chat panel dispatches `takeoff:navigate-page` from tool executors
  // (highlight_sheet_region, suggest_measurement). Decoupled via window
  // event so the chat doesn't need a prop wired into the viewer.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ page: number }>).detail;
      const target = detail?.page;
      if (typeof target !== 'number' || target < 1 || target > totalPages) return;
      setCurrentPage(target);
      setViewMode('single');
    };
    window.addEventListener('takeoff:navigate-page', handler);
    return () => window.removeEventListener('takeoff:navigate-page', handler);
  }, [totalPages]);

  // Auto-load PDF files from IndexedDB (uploaded during wizard)
  useEffect(() => {
    if (autoLoaded || hasPlan || !projectId) return;
    setAutoLoaded(true);

    (async () => {
      try {
        const files = await getPdfFiles(projectId);
        if (files.length > 0) {
          const file = files[0];
          setPdfFile(file);
          setIsConverting(true);
          setStatus('converting');

          const result = await convertPdfClientSide(file, 150);
          setPdfPages(result.pages);
          setCurrentPage(1);
          setStatus('idle');
          setIsConverting(false);

          // Keep PDF in IndexedDB so it persists across navigations
          // await clearPdfFiles(projectId);
        }
      } catch (err) {
        console.error('Failed to auto-load PDF:', err);
        setIsConverting(false);
        setStatus('idle');
      }
    })();
  }, [projectId, autoLoaded, hasPlan, setPdfFile, setPdfPages, setStatus]);

  // Keyboard shortcuts for measurement tool + arrow page nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'm' || e.key === 'M') {
        if (!activeTool) {
          setShowMeasureToolbar((v) => !v);
        }
      } else if (e.key === 'Escape') {
        if (toolState === 'measuring' || toolState === 'naming') {
          cancelMeasurement();
        } else if (activeTool) {
          deactivateTool();
          setShowMeasureToolbar(false);
        } else if (viewMode === 'grid') {
          setViewMode('single');
        }
      } else if (e.key === 'Backspace' && toolState === 'measuring') {
        e.preventDefault();
        undoLastPoint();
      } else if (e.key === 'ArrowLeft' && hasPlan && viewMode === 'single' && !activeTool) {
        e.preventDefault();
        setCurrentPage((p) => Math.max(1, p - 1));
      } else if (e.key === 'ArrowRight' && hasPlan && viewMode === 'single' && !activeTool) {
        e.preventDefault();
        setCurrentPage((p) => Math.min(totalPages, p + 1));
      } else if (e.key === 'g' || e.key === 'G') {
        if (!activeTool && hasPlan) {
          setViewMode((v) => v === 'grid' ? 'single' : 'grid');
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTool, toolState, cancelMeasurement, deactivateTool, undoLastPoint, hasPlan, totalPages, viewMode]);

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

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    setImageDims({ w: natW, h: natH });

    // Auto-fit zoom to container width on first load (with padding)
    if (containerRef.current && natW > 0) {
      const containerW = containerRef.current.clientWidth - 32; // subtract padding
      if (natW > containerW) {
        const fitZoom = Math.floor((containerW / natW) * 100);
        setZoom(Math.max(25, Math.min(100, fitZoom)));
      }
    }
  }, []);

  /** Handle scale override from toolbar */
  const handleScaleOverride = useCallback((scaleStr: string, factor: number) => {
    dispatch({
      type: 'SET_SCALE_OVERRIDE',
      pageNumber: currentPage,
      scale: {
        pageNumber: currentPage,
        scaleString: scaleStr,
        scaleFactor: factor,
        source: 'user_override',
        confidence: 'high' as const,
        calibrationMethod: 'user_override',
      },
    });
  }, [dispatch, currentPage]);

  /** Get page title from sheet manifest (Layer 1) or legacy classifications. */
  const getPageTitle = (pageNum: number): string => {
    const sheet = state.sheetManifest?.sheets.find((s) => s.page === pageNum);
    if (sheet) {
      if (sheet.title) return sheet.title;
      return sheet.sheetType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
    const cls = state.pageClassifications.find((c) => c.page === pageNum);
    if (cls) {
      return cls.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return `Page ${pageNum}`;
  };

  /** Lookup classification for a specific page from the manifest. */
  const getSheetClassification = (pageNum: number) => {
    return state.sheetManifest?.sheets.find((s) => s.page === pageNum) ?? null;
  };

  const isMeasuring = !!activeTool;

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2 shrink-0">
        <h3 className="text-sm font-semibold text-gray-900">Plans</h3>
        <div className="flex items-center gap-1">
          {hasPlan && viewMode === 'single' && (
            <>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
                title="Previous page (←)"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {showPageJump ? (
                <form
                  className="inline-flex"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const num = parseInt(pageJumpValue);
                    if (num >= 1 && num <= totalPages) {
                      setCurrentPage(num);
                    }
                    setShowPageJump(false);
                    setPageJumpValue('');
                  }}
                >
                  <input
                    ref={pageJumpRef}
                    type="number"
                    min={1}
                    max={totalPages}
                    value={pageJumpValue}
                    onChange={(e) => setPageJumpValue(e.target.value)}
                    onBlur={() => { setShowPageJump(false); setPageJumpValue(''); }}
                    className="w-12 text-xs text-center border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                    placeholder={String(currentPage)}
                  />
                  <span className="text-xs text-gray-500 ml-1">/ {totalPages}</span>
                </form>
              ) : (
                <button
                  onClick={() => {
                    setShowPageJump(true);
                    setPageJumpValue(String(currentPage));
                  }}
                  className="text-xs text-gray-500 min-w-[80px] text-center hover:text-primary cursor-pointer"
                  title="Click to jump to a page"
                >
                  Page {currentPage} of {totalPages}
                </button>
              )}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
                title="Next page (→)"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
          {hasPlan && viewMode === 'grid' && (
            <span className="text-xs text-gray-500">
              {totalPages} pages — click to view
            </span>
          )}
          <div className="flex items-center gap-0.5 ml-1 border-l border-gray-200 pl-1">
            {hasPlan && (
              <button
                onClick={() => setViewMode(viewMode === 'grid' ? 'single' : 'grid')}
                className={`p-1 cursor-pointer transition-colors ${
                  viewMode === 'grid'
                    ? 'text-primary'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                title="Page grid view (G)"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            )}
            {hasPlan && viewMode === 'single' && (
              <button
                onClick={() => {
                  if (isMeasuring) {
                    deactivateTool();
                    setShowMeasureToolbar(false);
                  } else {
                    setShowMeasureToolbar((v) => !v);
                  }
                }}
                className={`p-1 cursor-pointer transition-colors ${
                  isMeasuring || showMeasureToolbar
                    ? 'text-primary'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                title="Measurement tool (M)"
              >
                <Ruler className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
              title="Upload PDF"
              disabled={isBusy}
            >
              <Upload className="h-4 w-4" />
            </button>
            {onExpand && !isExpanded && (
              <button
                onClick={onExpand}
                className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                title="Expand to full screen"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            )}
            {isExpanded && onCollapse && (
              <button
                onClick={onCollapse}
                className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                title="Exit full screen (Esc)"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            )}
          </div>
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

      {/* Measurement toolbar (below header, above content) — single view only */}
      {hasPlan && viewMode === 'single' && (showMeasureToolbar || isMeasuring) && (
        <MeasurementToolbar
          toolState={toolState}
          activeTool={activeTool}
          activePointCount={activePoints.length}
          runningLabel={runningLabel}
          scaleString={scaleString}
          scaleFactor={scaleFactor}
          scaleInfo={effectiveScale}
          pendingResult={pendingResult}
          pendingLinearFt={pendingLinearFt}
          onStartTool={(tool) => {
            startTool(tool);
            setShowMeasureToolbar(false);
          }}
          onFinish={measureDoubleClick}
          onUndo={undoLastPoint}
          onCancel={cancelMeasurement}
          onDeactivate={() => {
            deactivateTool();
            setShowMeasureToolbar(false);
          }}
          onConfirm={confirmMeasurement}
          onScaleOverride={handleScaleOverride}
        />
      )}

      {/* Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto custom-scrollbar flex items-start justify-center"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {isConverting ? (
          <div className="flex flex-col items-center gap-3 text-center px-6 mt-20">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Converting PDF pages...</p>
            <p className="text-xs text-gray-400">This may take a moment for large files</p>
          </div>
        ) : hasPlan && viewMode === 'grid' ? (
          /* ── Thumbnail grid view ── */
          <div className="p-3 w-full">
            {state.classifyingSheets && (
              <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
                <span className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Classifying sheets…
              </div>
            )}
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {pdfPages.map((page, idx) => {
                const pageNum = idx + 1;
                const title = getPageTitle(pageNum);
                const sheet = getSheetClassification(pageNum);
                const measureCount = state.measurements.filter((m) => m.pageNumber === pageNum).length;
                return (
                  <button
                    key={pageNum}
                    onClick={() => {
                      setCurrentPage(pageNum);
                      setViewMode('single');
                    }}
                    className={`group flex flex-col border rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer ${
                      currentPage === pageNum
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="relative bg-white p-1">
                      <img
                        src={`data:${page.mime_type};base64,${page.data}`}
                        alt={`Page ${pageNum}`}
                        className="w-full h-auto"
                        draggable={false}
                      />
                      {measureCount > 0 && (
                        <span className="absolute top-2 right-2 bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          {measureCount}
                        </span>
                      )}
                      {sheet && sheet.sheetType !== 'unknown' && (
                        <span
                          className="absolute top-2 left-2 bg-gray-900/80 text-white text-[8px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide"
                          title={`${sheet.title || sheet.sheetType} (confidence: ${sheet.confidence})`}
                        >
                          {SHEET_TYPE_BADGE[sheet.sheetType] ?? sheet.sheetType}
                        </span>
                      )}
                    </div>
                    <div className="px-2 py-1.5 bg-gray-50 border-t border-gray-100">
                      <p className="text-[10px] font-medium text-gray-700 truncate">{title}</p>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p className="text-[9px] text-gray-400">
                          {sheet?.sheetNumber || `Page ${pageNum}`}
                        </p>
                        {sheet && (
                          <span className="flex items-center gap-0.5" title="Trade relevance">
                            {(['insulation', 'gutters'] as const).map((trade) => {
                              const r = sheet.tradeRelevance[trade];
                              const cls =
                                r === 'primary' ? 'bg-green-500'
                                : r === 'secondary' ? 'bg-amber-400'
                                : 'bg-gray-200';
                              return (
                                <span
                                  key={trade}
                                  className={`inline-block w-1.5 h-1.5 rounded-full ${cls}`}
                                  title={`${trade}: ${r}`}
                                />
                              );
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : hasPlan && currentPageData ? (
          /* ── Single page view with measurement overlay ──
             Apply zoom via explicit width/height so the layout box tracks the
             visual size. This lets the parent flex container center the image
             horizontally; with transform: scale() the layout box stays at
             natural size and flexbox pins the scaled visual to the top-left. */
          <div className="p-2">
            <div
              className="relative inline-block"
              style={imageDims.w > 0 ? {
                width: (imageDims.w * zoom) / 100,
                height: (imageDims.h * zoom) / 100,
              } : undefined}
            >
              <img
                src={`data:${currentPageData.mime_type};base64,${currentPageData.data}`}
                alt={`Page ${currentPage}`}
                className="shadow-sm border border-gray-200 block w-full h-full"
                draggable={false}
                onLoad={handleImageLoad}
              />
            {/* Measurement overlay — must exactly match image dimensions */}
            {imageDims.w > 0 && (
              <MeasurementOverlay
                measurements={pageMeasurements}
                activePoints={activePoints}
                cursorPos={cursorPos}
                zoom={zoom}
                scaleFactor={scaleFactor}
                mode={activeTool?.mode || null}
                activeTrade={activeTool?.trade || null}
                imageWidth={imageDims.w}
                imageHeight={imageDims.h}
                onPointClick={(pt) => measureClick(pt)}
                onDoubleClick={measureDoubleClick}
                onMouseMove={(pt) => measureMouseMove(pt)}
                highlightedId={highlightedMeasurementId}
              />
            )}
            </div>
          </div>
        ) : (
          <div
            className="flex flex-col items-center gap-3 text-center px-6 cursor-pointer mt-20"
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

      {/* Bottom controls */}
      {hasPlan && viewMode === 'single' && (
        <div className="flex flex-col gap-2 border-t border-gray-200 bg-white px-3 py-2 shrink-0">
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
              onClick={() => {
                if (containerRef.current && imageDims.w > 0) {
                  const containerW = containerRef.current.clientWidth - 32;
                  const fitZoom = Math.floor((containerW / imageDims.w) * 100);
                  setZoom(Math.max(25, Math.min(100, fitZoom)));
                } else {
                  setZoom(100);
                }
              }}
              className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
              title="Fit to width"
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
