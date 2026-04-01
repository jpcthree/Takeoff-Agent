/**
 * Coordinate conversion and geometry math for the interactive measurement tool.
 *
 * Conversion chain:
 *   screenPixel / zoom → imagePixel (at 150 DPI)
 *   imagePixel × (72 / 150) = pdfUnits
 *   (pdfUnits / 72) × scaleFactor = realInches
 *   realInches / 12 = realFeet
 *
 * All measurement points are stored in image-pixel coordinates at 150 DPI.
 */

import type { MeasurementPoint, Measurement } from '@/lib/types/measurement';
import { pdfUnitsToFeetInches, feetInchesToString } from '@/lib/utils/scale-detection';
import type { Dimension } from '@/lib/utils/scale-detection';

/** DPI used for the PdfViewer display images */
const DISPLAY_DPI = 150;
/** PDF native resolution */
const PDF_DPI = 72;
/** Conversion factor: image pixels to PDF units */
const PX_TO_PDF = PDF_DPI / DISPLAY_DPI; // 0.48

// ---------------------------------------------------------------------------
// Screen ↔ Image coordinate mapping
// ---------------------------------------------------------------------------

/**
 * Convert screen (mouse event) coordinates to image-pixel coordinates.
 * Accounts for zoom level and the image's position in the scrollable container.
 */
export function screenToImageCoords(
  screenX: number,
  screenY: number,
  imgRect: DOMRect,
  zoom: number
): MeasurementPoint {
  // imgRect is the bounding rect of the zoomed image container
  // Divide by zoom to get the coordinate in the unzoomed image space
  const x = (screenX - imgRect.left) / (zoom / 100);
  const y = (screenY - imgRect.top) / (zoom / 100);
  return { x, y };
}

// ---------------------------------------------------------------------------
// Image pixel → Real-world conversions
// ---------------------------------------------------------------------------

/**
 * Convert a distance in image pixels to real-world inches.
 */
export function imagePixelToRealInches(pixelDistance: number, scaleFactor: number): number {
  const pdfUnits = pixelDistance * PX_TO_PDF;
  return (pdfUnits / PDF_DPI) * scaleFactor;
}

/**
 * Convert a distance in image pixels to real-world feet + inches.
 */
export function imagePixelToRealFeetInches(pixelDistance: number, scaleFactor: number): Dimension {
  const pdfUnits = pixelDistance * PX_TO_PDF;
  return pdfUnitsToFeetInches(pdfUnits, scaleFactor);
}

/**
 * Convert an area in image pixels² to real-world square feet.
 */
export function pixelAreaToRealSF(pixelArea: number, scaleFactor: number): number {
  // Each pixel dimension converts by PX_TO_PDF, then by scaleFactor/72
  // Area scales by the square of the linear conversion factor
  const linearFactor = (PX_TO_PDF / PDF_DPI) * scaleFactor; // inches per pixel
  const areaFactor = linearFactor * linearFactor; // sq inches per sq pixel
  return (pixelArea * areaFactor) / 144; // 144 sq inches per sq foot
}

// ---------------------------------------------------------------------------
// Geometry: polyline length and polygon area
// ---------------------------------------------------------------------------

/** Euclidean distance between two image-pixel points. */
export function pointDistance(a: MeasurementPoint, b: MeasurementPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Total length of a polyline defined by an array of points (image pixels). */
export function polylineLength(points: MeasurementPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += pointDistance(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Area of a polygon using the Shoelace formula (image pixels²).
 * Points should be ordered (CW or CCW). Returns absolute area.
 */
export function polygonArea(points: MeasurementPoint[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    sum += points[i].x * points[j].y;
    sum -= points[j].x * points[i].y;
  }
  return Math.abs(sum) / 2;
}

/** Perimeter of a closed polygon (image pixels). */
export function polygonPerimeter(points: MeasurementPoint[]): number {
  if (points.length < 2) return 0;
  let total = polylineLength(points);
  // Close the polygon
  total += pointDistance(points[points.length - 1], points[0]);
  return total;
}

// ---------------------------------------------------------------------------
// Compute measurement result
// ---------------------------------------------------------------------------

/**
 * Compute the final result value and unit for a measurement.
 */
export function computeMeasurementResult(m: Pick<Measurement, 'mode' | 'points' | 'scaleFactor' | 'heightFt' | 'isClosed'>): {
  value: number;
  unit: string;
} {
  const { mode, points, scaleFactor, heightFt } = m;

  if (points.length < 2) return { value: 0, unit: mode === 'linear' ? 'LF' : 'SF' };

  switch (mode) {
    case 'linear': {
      const pixelLen = polylineLength(points);
      const realInches = imagePixelToRealInches(pixelLen, scaleFactor);
      const realFeet = realInches / 12;
      return { value: Math.round(realFeet * 100) / 100, unit: 'LF' };
    }
    case 'area': {
      const pixelArea = polygonArea(points);
      const realSF = pixelAreaToRealSF(pixelArea, scaleFactor);
      return { value: Math.round(realSF * 100) / 100, unit: 'SF' };
    }
    case 'surface_area': {
      // Surface area = linear feet of wall × wall height
      const pixelLen = polylineLength(points);
      const realInches = imagePixelToRealInches(pixelLen, scaleFactor);
      const realFeetLinear = realInches / 12;
      const height = heightFt || 8; // default 8 ft if not specified
      const sf = realFeetLinear * height;
      return { value: Math.round(sf * 100) / 100, unit: 'SF' };
    }
    default:
      return { value: 0, unit: 'LF' };
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/**
 * Format a pixel distance as a real-world dimension string (e.g., "12'-6"").
 */
export function formatPixelDistance(pixelDistance: number, scaleFactor: number): string {
  const dim = imagePixelToRealFeetInches(pixelDistance, scaleFactor);
  return feetInchesToString(dim);
}

/**
 * Format a measurement result for display (e.g., "24.5 LF" or "187 SF").
 */
export function formatMeasurementResult(value: number, unit: string): string {
  if (unit === 'SF') {
    return `${Math.round(value).toLocaleString()} SF`;
  }
  // LF: show one decimal if fractional, whole number otherwise
  const display = value % 1 === 0 ? value.toLocaleString() : value.toFixed(1);
  return `${display} LF`;
}

/**
 * Snap a point to horizontal or vertical alignment with the previous point.
 * Returns the snapped point if within threshold, otherwise returns the original.
 */
export function snapToAxis(
  point: MeasurementPoint,
  prevPoint: MeasurementPoint,
  thresholdDeg: number = 5
): MeasurementPoint {
  const dx = point.x - prevPoint.x;
  const dy = point.y - prevPoint.y;
  const angle = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));

  // Snap to horizontal
  if (angle < thresholdDeg || angle > 180 - thresholdDeg) {
    return { x: point.x, y: prevPoint.y };
  }
  // Snap to vertical
  if (Math.abs(angle - 90) < thresholdDeg) {
    return { x: prevPoint.x, y: point.y };
  }

  return point;
}
