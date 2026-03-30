/**
 * Apply detected scales to extracted vector paths and match
 * dimension-text callouts to nearby line segments.
 *
 * This is the "measurement fallback" — when a wall has no explicit
 * dimension callout on the plans, we measure the vector line using
 * the detected drawing scale, exactly as a human would with a scale ruler.
 */

import type { PageVectorData, PathSegment } from './pdf-vector-extract';
import type { ExtractedPageText, ExtractedTextItem } from './pdf-text-extract';
import {
  type ScaleInfo,
  type Dimension,
  pdfUnitsToFeetInches,
  feetInchesToString,
} from './scale-detection';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MeasuredSegment {
  /** Start point in PDF units (top-down Y) */
  startPt: [number, number];
  /** End point in PDF units (top-down Y) */
  endPt: [number, number];
  /** Raw length in PDF coordinate units */
  lengthPdfUnits: number;
  /** Real-world length computed from scale, or null if no scale available */
  realLength: Dimension | null;
  /** Nearby dimension callout text (e.g. "12'-4""), if matched */
  nearbyDimensionText: string | null;
  /** How we determined the length */
  dimensionSource: 'vector_calculated' | 'text_callout' | 'both';
  /** True if vector calc disagrees with callout by >10% */
  discrepancy: boolean;
  /** Orientation of the segment */
  orientation: 'horizontal' | 'vertical' | 'diagonal';
}

export interface PageMeasurements {
  pageNumber: number;
  scale: ScaleInfo | null;
  segments: MeasuredSegment[];
  /** Compact summary for inclusion in Claude prompts */
  summary: string;
}

// ---------------------------------------------------------------------------
// Dimension text parsing
// ---------------------------------------------------------------------------

/**
 * Regex patterns that match common architectural dimension callouts.
 * Captures feet and inches from strings like:
 *   "26'-0"", "12'-6"", "9'-1"", "3'-0"", "26'", "120""
 */
const DIMENSION_PATTERNS = [
  // Standard: 26'-0", 12'-6", etc.
  /(\d+)\s*['\u2032]\s*-?\s*(\d+(?:\s*\d+\/\d+)?)\s*["\u2033]?/,
  // Feet only: 26', 12'
  /(\d+)\s*['\u2032]/,
  // Inches only (for details): 6", 36"
  /(\d+(?:\s*\d+\/\d+)?)\s*["\u2033]/,
];

interface ParsedDimension {
  feet: number;
  inches: number;
  totalInches: number;
  originalText: string;
  textItem: ExtractedTextItem;
}

/**
 * Parse dimension callouts from a page's text items.
 * Returns items that look like architectural dimensions with their positions.
 */
function parseDimensionCallouts(page: ExtractedPageText): ParsedDimension[] {
  const results: ParsedDimension[] = [];

  for (const item of page.textItems) {
    const text = item.str.trim();
    if (!text || text.length > 20) continue; // Dimensions are short strings

    // Try feet-and-inches pattern first
    const ftInMatch = text.match(/^(\d+)\s*['\u2032]\s*-?\s*(\d+(?:\s*\d+\/\d+)?)\s*["\u2033]?\s*$/);
    if (ftInMatch) {
      const ft = parseInt(ftInMatch[1], 10);
      const inStr = ftInMatch[2];
      const inches = parseInchString(inStr);
      results.push({
        feet: ft,
        inches,
        totalInches: ft * 12 + inches,
        originalText: text,
        textItem: item,
      });
      continue;
    }

    // Try feet-only pattern
    const ftMatch = text.match(/^(\d+)\s*['\u2032]\s*$/);
    if (ftMatch) {
      const ft = parseInt(ftMatch[1], 10);
      if (ft > 0 && ft < 200) { // Reasonable building dimension
        results.push({
          feet: ft,
          inches: 0,
          totalInches: ft * 12,
          originalText: text,
          textItem: item,
        });
        continue;
      }
    }

    // Try inches-only pattern (common in detail drawings)
    const inMatch = text.match(/^(\d+(?:\s*\d+\/\d+)?)\s*["\u2033]\s*$/);
    if (inMatch) {
      const inches = parseInchString(inMatch[1]);
      if (inches > 0 && inches < 600) { // Up to 50 feet in inches
        results.push({
          feet: Math.floor(inches / 12),
          inches: inches % 12,
          totalInches: inches,
          originalText: text,
          textItem: item,
        });
      }
    }
  }

  return results;
}

/**
 * Parse an inch string that may include fractions: "6", "6 1/2", "3/4"
 */
function parseInchString(s: string): number {
  const trimmed = s.trim();

  // Mixed: "6 1/2"
  const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    return parseInt(mixedMatch[1], 10) + parseInt(mixedMatch[2], 10) / parseInt(mixedMatch[3], 10);
  }

  // Fraction only: "1/2"
  const fracMatch = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    return parseInt(fracMatch[1], 10) / parseInt(fracMatch[2], 10);
  }

  // Whole number
  return parseFloat(trimmed) || 0;
}

// ---------------------------------------------------------------------------
// Segment classification
// ---------------------------------------------------------------------------

/**
 * Determine if a segment is horizontal, vertical, or diagonal.
 * Uses a 15-degree threshold from axis-aligned.
 */
function classifyOrientation(seg: PathSegment): 'horizontal' | 'vertical' | 'diagonal' {
  if (seg.points.length < 2) return 'diagonal';
  const [x1, y1] = seg.points[0];
  const [x2, y2] = seg.points[seg.points.length - 1];
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);

  if (dy < dx * 0.27) return 'horizontal'; // ~15 degrees
  if (dx < dy * 0.27) return 'vertical';
  return 'diagonal';
}

/**
 * Get the midpoint of a line segment.
 */
function segmentMidpoint(seg: PathSegment): [number, number] {
  if (seg.points.length < 2) return seg.points[0] || [0, 0];
  const [x1, y1] = seg.points[0];
  const [x2, y2] = seg.points[seg.points.length - 1];
  return [(x1 + x2) / 2, (y1 + y2) / 2];
}

/**
 * Euclidean distance between two points.
 */
function distance(a: [number, number], b: [number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

// ---------------------------------------------------------------------------
// Core measurement logic
// ---------------------------------------------------------------------------

/**
 * Match dimension callouts to nearby line segments.
 *
 * For each callout, find the closest line segment whose midpoint is within
 * a reasonable search radius. Then compare the callout value with the
 * vector-calculated length.
 */
function matchCalloutsToSegments(
  callouts: ParsedDimension[],
  segments: PathSegment[],
  scale: ScaleInfo | null
): Map<number, { callout: ParsedDimension; discrepancy: boolean }> {
  const matches = new Map<number, { callout: ParsedDimension; discrepancy: boolean }>();

  // Only match significant segments (likely walls, not tiny lines)
  const significantSegments = segments
    .map((seg, idx) => ({ seg, idx }))
    .filter(({ seg }) => seg.type === 'line' && seg.lengthPdfUnits > 10);

  for (const callout of callouts) {
    const calloutPos: [number, number] = [callout.textItem.x, callout.textItem.y];

    let bestIdx = -1;
    let bestDist = Infinity;

    for (const { seg, idx } of significantSegments) {
      if (matches.has(idx)) continue; // Already matched

      const mid = segmentMidpoint(seg);
      const d = distance(calloutPos, mid);

      // Search radius: proportional to segment length, min 50 PDF units
      const searchRadius = Math.max(seg.lengthPdfUnits * 0.5, 50);
      if (d < searchRadius && d < bestDist) {
        bestDist = d;
        bestIdx = idx;
      }
    }

    if (bestIdx >= 0) {
      let discrepancy = false;
      if (scale) {
        const seg = significantSegments.find(s => s.idx === bestIdx)!.seg;
        const vectorInches = (seg.lengthPdfUnits / 72) * scale.scaleFactor;
        const calloutInches = callout.totalInches;
        if (calloutInches > 0) {
          const pctDiff = Math.abs(vectorInches - calloutInches) / calloutInches;
          discrepancy = pctDiff > 0.10; // >10% difference
        }
      }
      matches.set(bestIdx, { callout, discrepancy });
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Measure vector paths on a page using the detected scale, and match
 * dimension callouts to nearby segments.
 *
 * @param vectorData  - Extracted vector paths for the page
 * @param textPage    - Extracted text for the page (for dimension callouts)
 * @param scale       - Detected scale for this page, or null
 * @returns PageMeasurements with measured segments and a summary string
 */
export function measurePage(
  vectorData: PageVectorData,
  textPage: ExtractedPageText,
  scale: ScaleInfo | null
): PageMeasurements {
  // Parse dimension callouts from text
  const callouts = parseDimensionCallouts(textPage);

  // Match callouts to nearby line segments
  const lineSegments = vectorData.segments.filter(s => s.type === 'line');
  const calloutMatches = matchCalloutsToSegments(callouts, vectorData.segments, scale);

  // Build measured segments (only for significant lines)
  const measured: MeasuredSegment[] = [];

  for (let i = 0; i < vectorData.segments.length; i++) {
    const seg = vectorData.segments[i];
    if (seg.type !== 'line' || seg.lengthPdfUnits < 10) continue;

    const match = calloutMatches.get(i);
    const orientation = classifyOrientation(seg);

    const realLength = scale
      ? pdfUnitsToFeetInches(seg.lengthPdfUnits, scale.scaleFactor)
      : null;

    let dimensionSource: MeasuredSegment['dimensionSource'] = 'vector_calculated';
    let nearbyDimensionText: string | null = null;
    let discrepancy = false;

    if (match) {
      nearbyDimensionText = match.callout.originalText;
      discrepancy = match.discrepancy;
      dimensionSource = realLength ? 'both' : 'text_callout';
    }

    measured.push({
      startPt: seg.points[0] as [number, number],
      endPt: seg.points[seg.points.length - 1] as [number, number],
      lengthPdfUnits: seg.lengthPdfUnits,
      realLength,
      nearbyDimensionText,
      dimensionSource,
      discrepancy,
      orientation,
    });
  }

  // Sort by length descending — longest segments first (likely walls)
  measured.sort((a, b) => b.lengthPdfUnits - a.lengthPdfUnits);

  // Build summary string
  const summary = buildSummary(vectorData, measured, scale, callouts);

  return {
    pageNumber: vectorData.pageNumber,
    scale,
    segments: measured,
    summary,
  };
}

/**
 * Measure all relevant pages.
 */
export function measureAllPages(
  vectorPages: PageVectorData[],
  textPages: ExtractedPageText[],
  scales: ScaleInfo[],
  relevantPageNumbers: number[]
): PageMeasurements[] {
  const scaleByPage = new Map(scales.map(s => [s.pageNumber, s]));
  const textByPage = new Map(textPages.map(p => [p.pageNumber, p]));

  return relevantPageNumbers.map(pageNum => {
    const vectorData = vectorPages.find(v => v.pageNumber === pageNum);
    const textPage = textByPage.get(pageNum);
    const scale = scaleByPage.get(pageNum) ?? null;

    if (!vectorData || !textPage) {
      return {
        pageNumber: pageNum,
        scale,
        segments: [],
        summary: `Page ${pageNum}: No vector or text data available.`,
      };
    }

    return measurePage(vectorData, textPage, scale);
  });
}

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------

function buildSummary(
  vectorData: PageVectorData,
  measured: MeasuredSegment[],
  scale: ScaleInfo | null,
  callouts: ParsedDimension[]
): string {
  const lines: string[] = [];

  // Scale info
  if (scale) {
    lines.push(`Scale: ${scale.scaleString} (factor ${scale.scaleFactor})`);
  } else {
    lines.push('Scale: Not detected — measurements in PDF units only');
  }

  // Segment counts
  const totalLines = vectorData.segments.filter(s => s.type === 'line').length;
  lines.push(`Detected ${totalLines} line segments on this page.`);

  // Top 10 longest segments with real-world dimensions
  const top = measured.slice(0, 10);
  if (top.length > 0 && scale) {
    lines.push('');
    lines.push('Longest segments (likely walls/edges):');
    for (const seg of top) {
      const lengthStr = seg.realLength
        ? feetInchesToString(seg.realLength)
        : `${Math.round(seg.lengthPdfUnits)} PDF units`;
      const calloutStr = seg.nearbyDimensionText
        ? ` [callout: ${seg.nearbyDimensionText}]`
        : '';
      const discStr = seg.discrepancy ? ' ⚠ DISCREPANCY' : '';
      lines.push(`  ${seg.orientation.padEnd(10)} ${lengthStr}${calloutStr}${discStr}`);
    }
  }

  // Dimension callouts found
  if (callouts.length > 0) {
    lines.push('');
    lines.push(`Dimension callouts found: ${callouts.length}`);
    const sample = callouts.slice(0, 5).map(c => c.originalText).join(', ');
    lines.push(`  Sample: ${sample}`);
  }

  // Discrepancies
  const discrepancies = measured.filter(s => s.discrepancy);
  if (discrepancies.length > 0) {
    lines.push('');
    lines.push(`⚠ ${discrepancies.length} discrepancies between vector measurements and callouts`);
  } else if (callouts.length > 0 && scale) {
    lines.push('Discrepancies: none');
  }

  return lines.join('\n');
}
