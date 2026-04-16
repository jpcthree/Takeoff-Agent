'use client';

import React, { useCallback, useMemo } from 'react';
import type {
  DetectedMeasurement,
  DetectedMeasurementConfidence,
  DetectedMeasurementStatus,
} from '@/lib/types/detected-measurement';
import { STATUS_COLORS, formatDimension } from '@/lib/types/detected-measurement';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DetectionOverlayProps {
  /** Detected measurements for the current page */
  measurements: DetectedMeasurement[];
  /** Image width in pixels at 150 DPI */
  imageWidth: number;
  /** Image height in pixels at 150 DPI */
  imageHeight: number;
  /** Current zoom level (percentage, e.g. 100 = 100%) */
  zoom: number;
  /** ID of the currently highlighted measurement (from sidebar hover/select) */
  highlightedId: string | null;
  /** Callback when user clicks a measurement during review */
  onMeasurementClick: (measurement: DetectedMeasurement) => void;
  /** Whether the review phase is active — enables click interactions */
  isReviewing: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Conversion factor from PDF units (72 DPI) to image pixels (150 DPI).
 * PDF stores coordinates at 72 points per inch; rendered images are 150 DPI.
 * So: imagePixel = pdfUnit * (150 / 72) ≈ 2.0833
 */
const PDF_TO_IMAGE_PX = 150 / 72;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a PDF-unit coordinate pair to image-pixel coordinates */
function toImagePx(pt: [number, number]): { x: number; y: number } {
  return {
    x: pt[0] * PDF_TO_IMAGE_PX,
    y: pt[1] * PDF_TO_IMAGE_PX,
  };
}

/** Zoom-compensated stroke width so lines stay readable at any zoom */
function strokeWidth(zoom: number, highlighted: boolean): number {
  const base = highlighted ? 3 : 2;
  return Math.max(1.5, base / (zoom / 100));
}

/** Zoom-compensated font size */
function fontSize(zoom: number): number {
  return Math.max(9, 12 / (zoom / 100));
}

/** Zoom-compensated endpoint circle radius */
function endpointRadius(zoom: number): number {
  return Math.max(2, 3 / (zoom / 100));
}

/** Dash pattern based on measurement confidence */
function dashArray(
  confidence: DetectedMeasurementConfidence,
  zoom: number
): string | undefined {
  const scale = 1 / (zoom / 100);
  switch (confidence) {
    case 'high':
      return undefined; // solid line
    case 'medium':
      return `${8 * scale} ${4 * scale}`;
    case 'low':
      return `${4 * scale} ${4 * scale}`;
  }
}

/** Angle (degrees) of the line from start to end, for label rotation */
function lineAngleDeg(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): number {
  let angle = (Math.atan2(ey - sy, ex - sx) * 180) / Math.PI;
  // Keep text upright: flip if the label would render upside-down
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return angle;
}

// ---------------------------------------------------------------------------
// Single Measurement Rendering
// ---------------------------------------------------------------------------

interface DetectedMeasurementItemProps {
  measurement: DetectedMeasurement;
  zoom: number;
  isHighlighted: boolean;
  isReviewing: boolean;
  onClick: (m: DetectedMeasurement) => void;
}

const DetectedMeasurementItem = React.memo(function DetectedMeasurementItem({
  measurement,
  zoom,
  isHighlighted,
  isReviewing,
  onClick,
}: DetectedMeasurementItemProps) {
  const color = STATUS_COLORS[measurement.status] ?? '#6b7280';
  const sw = strokeWidth(zoom, isHighlighted);
  const fs = fontSize(zoom);
  const er = endpointRadius(zoom);
  const dash = dashArray(measurement.confidence, zoom);

  // Convert PDF-unit endpoints to image pixels
  const start = toImagePx(measurement.startPt);
  const end = toImagePx(measurement.endPt);

  // Midpoint for label placement
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;

  // Rotation angle so the label reads along the measurement line
  const angle = lineAngleDeg(start.x, start.y, end.x, end.y);

  // Formatted dimension text
  const labelText = measurement.label || formatDimension(measurement.value);

  // Approximate label background dimensions
  const labelWidth = labelText.length * fs * 0.55 + fs * 0.6;
  const labelHeight = fs * 1.4;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick(measurement);
    },
    [onClick, measurement]
  );

  return (
    <g
      style={{
        cursor: isReviewing ? 'pointer' : 'default',
        pointerEvents: isReviewing ? 'visiblePainted' : 'none',
      }}
      onClick={isReviewing ? handleClick : undefined}
      opacity={isHighlighted ? 1 : 0.8}
    >
      {/* Glow effect for highlighted measurement */}
      {isHighlighted && (
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={color}
          strokeWidth={sw * 2.5}
          strokeOpacity={0.3}
          strokeLinecap="round"
        />
      )}

      {/* Main measurement line */}
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={dash}
      />

      {/* Start endpoint */}
      <circle cx={start.x} cy={start.y} r={er} fill={color} />

      {/* End endpoint */}
      <circle cx={end.x} cy={end.y} r={er} fill={color} />

      {/* Label group — rotated to align with the line */}
      <g transform={`translate(${mx}, ${my}) rotate(${angle})`}>
        {/* Background rect for readability */}
        <rect
          x={-labelWidth / 2}
          y={-labelHeight / 2}
          width={labelWidth}
          height={labelHeight}
          rx={fs * 0.2}
          fill={color}
          fillOpacity={0.85}
        />

        {/* Label text */}
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fs}
          fontWeight="600"
          fill="white"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {labelText}
        </text>
      </g>

      {/* Invisible wider hit area for easier clicking */}
      {isReviewing && (
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke="transparent"
          strokeWidth={Math.max(sw * 4, 12 / (zoom / 100))}
          strokeLinecap="round"
        />
      )}
    </g>
  );
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function DetectionOverlayInner({
  measurements,
  imageWidth,
  imageHeight,
  zoom,
  highlightedId,
  onMeasurementClick,
  isReviewing,
}: DetectionOverlayProps) {
  // Sort so highlighted measurement renders on top
  const sortedMeasurements = useMemo(() => {
    if (!highlightedId) return measurements;
    return [...measurements].sort((a, b) => {
      if (a.id === highlightedId) return 1;
      if (b.id === highlightedId) return -1;
      return 0;
    });
  }, [measurements, highlightedId]);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      preserveAspectRatio="none"
      className="absolute top-0 left-0"
      style={{
        pointerEvents: isReviewing ? 'auto' : 'none',
      }}
    >
      {sortedMeasurements.map((m) => (
        <DetectedMeasurementItem
          key={m.id}
          measurement={m}
          zoom={zoom}
          isHighlighted={highlightedId === m.id}
          isReviewing={isReviewing}
          onClick={onMeasurementClick}
        />
      ))}
    </svg>
  );
}

export const DetectionOverlay = React.memo(DetectionOverlayInner);
