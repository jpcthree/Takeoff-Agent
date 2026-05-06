'use client';

import React, { useCallback } from 'react';
import type { MeasurementPoint, Measurement, MeasurementMode } from '@/lib/types/measurement';
import { getTradeColor } from '@/lib/types/measurement';
import {
  pointDistance,
  polylineLength,
  formatPixelDistance,
  formatMeasurementResult,
  polygonArea,
  pixelAreaToRealSF,
} from '@/lib/utils/measurement-math';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MeasurementOverlayProps {
  /** Completed measurements for the current page */
  measurements: Measurement[];
  /** Points placed so far for the in-progress measurement */
  activePoints: MeasurementPoint[];
  /** Current cursor position for rubber-band line (image-pixel coords) */
  cursorPos: MeasurementPoint | null;
  /** Current zoom level (percentage) */
  zoom: number;
  /** Scale factor for real-world conversion */
  scaleFactor: number;
  /** Active measurement mode */
  mode: MeasurementMode | null;
  /** Active trade (for coloring the in-progress measurement) */
  activeTrade: string | null;
  /** Width/height of the underlying image in pixels */
  imageWidth: number;
  imageHeight: number;
  /** Called when the user clicks to place a point */
  onPointClick: (pt: MeasurementPoint) => void;
  /** Called on double-click to finish a measurement */
  onDoubleClick: () => void;
  /** Called on mouse move for rubber-band tracking */
  onMouseMove: (pt: MeasurementPoint) => void;
  /** ID of highlighted measurement (from Takeoffs list hover) */
  highlightedId?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an SVG points string from an array of MeasurementPoints */
function toSvgPoints(pts: MeasurementPoint[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}

/** Label font size that stays readable regardless of zoom */
function labelSize(zoom: number): number {
  return Math.max(10, 14 / (zoom / 100));
}

/** Vertex circle radius that stays consistent regardless of zoom */
function vertexRadius(zoom: number): number {
  return Math.max(3, 4.5 / (zoom / 100));
}

/** Stroke width that stays consistent regardless of zoom */
function strokeWidth(zoom: number): number {
  return Math.max(1.5, 2.5 / (zoom / 100));
}

/** Midpoint of a segment */
function midpoint(a: MeasurementPoint, b: MeasurementPoint): MeasurementPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Renders a single completed measurement (polyline/polygon + labels) */
function CompletedMeasurement({
  m,
  zoom,
  isHighlighted,
}: {
  m: Measurement;
  zoom: number;
  isHighlighted: boolean;
}) {
  const color = getTradeColor(m.trade);
  const sw = strokeWidth(zoom);
  const vr = vertexRadius(zoom);
  const fs = labelSize(zoom);
  const opacity = isHighlighted ? 1 : 0.7;

  const isClosed = m.mode === 'area' || m.mode === 'surface_area';

  return (
    <g opacity={opacity}>
      {/* Line/polygon shape */}
      {isClosed && m.points.length >= 3 ? (
        <polygon
          points={toSvgPoints(m.points)}
          fill={color}
          fillOpacity={isHighlighted ? 0.2 : 0.1}
          stroke={color}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      ) : (
        <polyline
          points={toSvgPoints(m.points)}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Vertex dots */}
      {m.points.map((pt, i) => (
        <circle key={i} cx={pt.x} cy={pt.y} r={vr} fill={color} />
      ))}

      {/* Result label near the centroid or midpoint */}
      {m.points.length >= 2 && (() => {
        const cx = m.points.reduce((s, p) => s + p.x, 0) / m.points.length;
        const cy = m.points.reduce((s, p) => s + p.y, 0) / m.points.length;
        const label = formatMeasurementResult(m.resultValue, m.resultUnit);
        return (
          <g>
            {/* Background for readability */}
            <rect
              x={cx - (label.length * fs * 0.3)}
              y={cy - fs * 0.8}
              width={label.length * fs * 0.6}
              height={fs * 1.2}
              rx={fs * 0.2}
              fill="white"
              fillOpacity={0.85}
              stroke={color}
              strokeWidth={sw * 0.5}
            />
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={fs}
              fontWeight="600"
              fill={color}
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {label}
            </text>
          </g>
        );
      })()}

      {/* Name label below result. Tooltip exposes semantic tag for debugging
          and to make agent/rules-engine wiring visible. */}
      {m.name && m.points.length >= 2 && (() => {
        const cx = m.points.reduce((s, p) => s + p.x, 0) / m.points.length;
        const cy = m.points.reduce((s, p) => s + p.y, 0) / m.points.length;
        const nameFs = fs * 0.75;
        return (
          <text
            x={cx}
            y={cy + fs * 0.9}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={nameFs}
            fill="#374151"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            <title>{m.semanticTag ? `${m.name} (${m.semanticTag})` : m.name}</title>
            {m.name}
          </text>
        );
      })()}
    </g>
  );
}

/** Renders the in-progress (active) measurement with rubber-band line */
function ActiveMeasurement({
  points,
  cursorPos,
  zoom,
  scaleFactor,
  mode,
  trade,
}: {
  points: MeasurementPoint[];
  cursorPos: MeasurementPoint | null;
  zoom: number;
  scaleFactor: number;
  mode: MeasurementMode;
  trade: string;
}) {
  const color = getTradeColor(trade);
  const sw = strokeWidth(zoom);
  const vr = vertexRadius(zoom);
  const fs = labelSize(zoom);

  // All points including cursor for rubber-band
  const allPoints = cursorPos ? [...points, cursorPos] : points;

  const isClosed = mode === 'area' || mode === 'surface_area';

  // Running distance/area label near cursor
  let runningLabel = '';
  if (allPoints.length >= 2 && scaleFactor > 0) {
    if (mode === 'linear' || mode === 'surface_area') {
      const totalPx = polylineLength(allPoints);
      runningLabel = formatPixelDistance(totalPx, scaleFactor);
    } else if (mode === 'area' && allPoints.length >= 3) {
      const areaPx = polygonArea(allPoints);
      const sf = pixelAreaToRealSF(areaPx, scaleFactor);
      runningLabel = `${Math.round(sf).toLocaleString()} SF`;
    }
  }

  return (
    <g>
      {/* Placed segments */}
      {points.length >= 2 && (
        <polyline
          points={toSvgPoints(points)}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Rubber-band line from last placed point to cursor */}
      {points.length >= 1 && cursorPos && (
        <line
          x1={points[points.length - 1].x}
          y1={points[points.length - 1].y}
          x2={cursorPos.x}
          y2={cursorPos.y}
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={`${sw * 3} ${sw * 2}`}
          strokeLinecap="round"
        />
      )}

      {/* Closing line preview for area modes */}
      {isClosed && allPoints.length >= 3 && cursorPos && (
        <line
          x1={cursorPos.x}
          y1={cursorPos.y}
          x2={points[0].x}
          y2={points[0].y}
          stroke={color}
          strokeWidth={sw * 0.5}
          strokeDasharray={`${sw * 2} ${sw * 2}`}
          opacity={0.5}
        />
      )}

      {/* Polygon fill preview for area modes */}
      {isClosed && allPoints.length >= 3 && (
        <polygon
          points={toSvgPoints(allPoints)}
          fill={color}
          fillOpacity={0.08}
          stroke="none"
        />
      )}

      {/* Placed vertex dots */}
      {points.map((pt, i) => (
        <circle key={i} cx={pt.x} cy={pt.y} r={vr} fill={color} stroke="white" strokeWidth={sw * 0.5} />
      ))}

      {/* Segment dimension labels */}
      {scaleFactor > 0 && points.length >= 2 &&
        points.slice(1).map((pt, i) => {
          const prev = points[i];
          const mid = midpoint(prev, pt);
          const segDist = pointDistance(prev, pt);
          const dimLabel = formatPixelDistance(segDist, scaleFactor);
          const segFs = fs * 0.8;
          return (
            <g key={`seg-${i}`}>
              <rect
                x={mid.x - (dimLabel.length * segFs * 0.3)}
                y={mid.y - segFs * 0.9}
                width={dimLabel.length * segFs * 0.6}
                height={segFs * 1.2}
                rx={segFs * 0.15}
                fill="white"
                fillOpacity={0.9}
              />
              <text
                x={mid.x}
                y={mid.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={segFs}
                fontWeight="500"
                fill={color}
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {dimLabel}
              </text>
            </g>
          );
        })}

      {/* Running total near cursor */}
      {runningLabel && cursorPos && (
        <g>
          <rect
            x={cursorPos.x + vr * 3}
            y={cursorPos.y - fs * 0.6}
            width={runningLabel.length * fs * 0.55 + fs * 0.4}
            height={fs * 1.3}
            rx={fs * 0.15}
            fill={color}
            fillOpacity={0.9}
          />
          <text
            x={cursorPos.x + vr * 3 + fs * 0.2}
            y={cursorPos.y + fs * 0.05}
            dominantBaseline="middle"
            fontSize={fs * 0.85}
            fontWeight="600"
            fill="white"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {runningLabel}
          </text>
        </g>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function MeasurementOverlay({
  measurements,
  activePoints,
  cursorPos,
  zoom,
  scaleFactor,
  mode,
  activeTrade,
  imageWidth,
  imageHeight,
  onPointClick,
  onDoubleClick,
  onMouseMove,
  highlightedId,
}: MeasurementOverlayProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!mode) return;
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left) / (zoom / 100);
      const y = (e.clientY - rect.top) / (zoom / 100);
      onPointClick({ x, y });
    },
    [mode, zoom, onPointClick]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      e.preventDefault();
      if (!mode) return;
      onDoubleClick();
    },
    [mode, onDoubleClick]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!mode) return;
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left) / (zoom / 100);
      const y = (e.clientY - rect.top) / (zoom / 100);
      onMouseMove({ x, y });
    },
    [mode, zoom, onMouseMove]
  );

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      preserveAspectRatio="none"
      className="absolute top-0 left-0"
      style={{
        cursor: mode ? 'crosshair' : 'default',
        pointerEvents: mode ? 'auto' : 'none',
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
    >
      {/* Completed measurements */}
      {measurements.map((m) => (
        <CompletedMeasurement
          key={m.id}
          m={m}
          zoom={zoom}
          isHighlighted={highlightedId === m.id}
        />
      ))}

      {/* Active (in-progress) measurement */}
      {mode && activeTrade && activePoints.length > 0 && (
        <ActiveMeasurement
          points={activePoints}
          cursorPos={cursorPos}
          zoom={zoom}
          scaleFactor={scaleFactor}
          mode={mode}
          trade={activeTrade}
        />
      )}
    </svg>
  );
}

export { MeasurementOverlay };
