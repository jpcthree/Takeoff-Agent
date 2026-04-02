/**
 * Converts a completed BuildingModel JSON + PageMeasurements[] from the
 * vector measurement phase + page classifications into DetectedMeasurement[]
 * for overlay rendering during the review step.
 *
 * The algorithm cross-references model dimensions with measured vector
 * segments to assign source confidence and spatial positions. Unmatched
 * dimensions are flagged for user review.
 */

import type {
  DetectedMeasurement,
  DetectedMeasurementSource,
  DetectedMeasurementConfidence,
  DetectedMeasurementStatus,
  ModelRef,
} from '../types/detected-measurement';
import {
  createDetectedMeasurementId,
  formatDimension,
} from '../types/detected-measurement';
import type { MeasuredSegment, PageMeasurements } from './vector-measurement';

// ---------------------------------------------------------------------------
// BuildingModel types (mirroring the JSON shape from Claude analysis)
// ---------------------------------------------------------------------------

interface DimValue {
  feet: number;
  inches: number;
}

interface ModelWall {
  id: string;
  wall_type: 'exterior' | 'interior';
  floor: number;
  location: string;
  length: DimValue;
  height: DimValue;
  thickness: string;
}

interface ModelRoom {
  id: string;
  name: string;
  floor: number;
  length: DimValue;
  width: DimValue;
}

interface ModelOpening {
  id: string;
  opening_type: 'window' | 'door';
  width: DimValue;
  height: DimValue;
  quantity: number;
}

interface ModelRoofSection {
  id: string;
  section_type: string;
  area: number;
}

interface ModelFoundation {
  type: string;
  perimeter: number;
  area: number;
}

interface BuildingModel {
  walls: ModelWall[];
  rooms: ModelRoom[];
  openings: ModelOpening[];
  roof_sections: ModelRoofSection[];
  foundation: ModelFoundation;
}

interface PageClassification {
  page: number;
  type: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a {feet, inches} dimension to total inches for comparison. */
function toTotalInches(d: DimValue): number {
  return (d.feet || 0) * 12 + (d.inches || 0);
}

/** Default page dimensions in PDF units (letter size at 72 dpi). */
const DEFAULT_PAGE_WIDTH = 792;  // 11 inches
const DEFAULT_PAGE_HEIGHT = 612; // 8.5 inches

// ---------------------------------------------------------------------------
// Page mapping
// ---------------------------------------------------------------------------

/** Floor-number keywords used to match page descriptions to floor numbers. */
const FLOOR_KEYWORDS: Record<number, RegExp[]> = {
  1: [/floor\s*1/i, /1st\s*floor/i, /first\s*floor/i, /ground/i, /main/i],
  2: [/floor\s*2/i, /2nd\s*floor/i, /second\s*floor/i, /upper/i],
  3: [/floor\s*3/i, /3rd\s*floor/i, /third\s*floor/i],
};

/**
 * Build a map from floor number to the best-matching floor_plan page number.
 */
function buildFloorToPageMap(
  classifications: PageClassification[]
): Map<number, number> {
  const floorPlanPages = classifications.filter((c) => c.type === 'floor_plan');
  const map = new Map<number, number>();

  if (floorPlanPages.length === 0) return map;

  // Try keyword matching first
  for (const [floor, patterns] of Object.entries(FLOOR_KEYWORDS)) {
    const floorNum = Number(floor);
    for (const page of floorPlanPages) {
      if (patterns.some((p) => p.test(page.description))) {
        if (!map.has(floorNum)) {
          map.set(floorNum, page.page);
        }
      }
    }
  }

  // Fallback: assign unmatched floors by position
  const usedPages = new Set(map.values());
  const remaining = floorPlanPages.filter((p) => !usedPages.has(p.page));
  let nextFloor = 1;
  for (const page of remaining) {
    while (map.has(nextFloor)) nextFloor++;
    map.set(nextFloor, page.page);
    nextFloor++;
  }

  // Ensure floor 1 always has a mapping
  if (!map.has(1) && floorPlanPages.length > 0) {
    map.set(1, floorPlanPages[0].page);
  }

  return map;
}

/**
 * Find the first elevation page number, or fall back to the first floor plan.
 */
function findElevationPage(
  classifications: PageClassification[],
  floorToPage: Map<number, number>
): number {
  const elev = classifications.find((c) => c.type === 'elevation');
  if (elev) return elev.page;
  // Fall back to first floor plan page
  return floorToPage.get(1) ?? 1;
}

/**
 * Get the floor plan page for a given floor number.
 * Falls back to floor 1's page, then page 1.
 */
function getFloorPlanPage(floor: number, floorToPage: Map<number, number>): number {
  return floorToPage.get(floor) ?? floorToPage.get(1) ?? 1;
}

// ---------------------------------------------------------------------------
// Segment matching
// ---------------------------------------------------------------------------

/**
 * Find the best matching MeasuredSegment for a given dimension value.
 * Returns the segment index and the segment itself, or null if no match
 * is within the 10% tolerance.
 */
function findBestSegmentMatch(
  targetInches: number,
  segments: MeasuredSegment[],
  usedIndices: Set<number>
): { index: number; segment: MeasuredSegment } | null {
  if (targetInches <= 0) return null;

  let bestIndex = -1;
  let bestDiff = Infinity;

  for (let i = 0; i < segments.length; i++) {
    if (usedIndices.has(i)) continue;

    const seg = segments[i];
    if (!seg.realLength) continue;

    const segInches = toTotalInches(seg.realLength);
    if (segInches <= 0) continue;

    const diff = Math.abs(segInches - targetInches);
    const pctDiff = diff / targetInches;

    if (pctDiff <= 0.10 && diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }

  if (bestIndex >= 0) {
    return { index: bestIndex, segment: segments[bestIndex] };
  }
  return null;
}

/**
 * Determine source and confidence from a matched segment's dimensionSource.
 */
function sourceFromSegment(
  seg: MeasuredSegment
): { source: DetectedMeasurementSource; confidence: DetectedMeasurementConfidence } {
  if (seg.dimensionSource === 'text_callout' || seg.dimensionSource === 'both') {
    return { source: 'text_callout', confidence: 'high' };
  }
  return { source: 'vector_calculated', confidence: 'medium' };
}

// ---------------------------------------------------------------------------
// Approximate position generation (for unmatched entities)
// ---------------------------------------------------------------------------

let _approxCounter = 0;

/**
 * Generate an approximate horizontal line position on a page.
 * Spreads items vertically to avoid overlapping labels.
 */
function generateApproxPosition(
  index: number
): { startPt: [number, number]; endPt: [number, number] } {
  const margin = 72; // 1 inch margin in PDF units
  const yStart = 150 + index * 40;
  const x1 = margin;
  const x2 = DEFAULT_PAGE_WIDTH - margin;
  return {
    startPt: [x1, yStart],
    endPt: [x2, yStart],
  };
}

/**
 * Generate a default vertical line position for height measurements
 * on an elevation page.
 */
function generateHeightPosition(
  index: number
): { startPt: [number, number]; endPt: [number, number] } {
  const xPos = 100 + index * 50;
  return {
    startPt: [xPos, 100],
    endPt: [xPos, DEFAULT_PAGE_HEIGHT - 100],
  };
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

/**
 * Extract DetectedMeasurement[] from a BuildingModel, cross-referenced with
 * vector/text PageMeasurements and page classifications.
 *
 * The result is sorted: flagged items first, then unverified, then verified.
 */
export function extractDetectedMeasurements(
  rawModel: Record<string, unknown>,
  pageMeasurements: PageMeasurements[],
  pageClassifications: PageClassification[]
): DetectedMeasurement[] {
  // Cast the raw model to our local interface shape
  const model = rawModel as unknown as BuildingModel;
  const results: DetectedMeasurement[] = [];

  // Build page lookups
  const floorToPage = buildFloorToPageMap(pageClassifications);
  const elevationPage = findElevationPage(pageClassifications, floorToPage);

  // Index PageMeasurements by page number
  const measurementsByPage = new Map<number, PageMeasurements>();
  for (const pm of pageMeasurements) {
    measurementsByPage.set(pm.pageNumber, pm);
  }

  // Track used segment indices per page to prevent double-assignment
  const usedSegmentsByPage = new Map<number, Set<number>>();
  function getUsedSet(pageNum: number): Set<number> {
    let s = usedSegmentsByPage.get(pageNum);
    if (!s) {
      s = new Set<number>();
      usedSegmentsByPage.set(pageNum, s);
    }
    return s;
  }

  // Counter for approximate position generation
  let approxIndex = 0;
  let heightIndex = 0;

  // ----- Walls -----
  for (const wall of model.walls ?? []) {
    const pageNum = getFloorPlanPage(wall.floor, floorToPage);
    const pm = measurementsByPage.get(pageNum);
    const usedSet = getUsedSet(pageNum);

    // Wall length
    const lengthInches = toTotalInches(wall.length);
    const match = pm
      ? findBestSegmentMatch(lengthInches, pm.segments, usedSet)
      : null;

    if (match) {
      usedSet.add(match.index);
      const { source, confidence } = sourceFromSegment(match.segment);

      results.push({
        id: createDetectedMeasurementId('wall', wall.id, 'length'),
        pageNumber: pageNum,
        modelRef: { entity: 'wall', entityId: wall.id, field: 'length' },
        value: { ...wall.length },
        originalValue: null,
        source,
        confidence,
        startPt: [...match.segment.startPt],
        endPt: [...match.segment.endPt],
        label: `${wall.id}: ${formatDimension(wall.length)}`,
        status: 'unverified',
        entityDescription: `${wall.wall_type} Wall - ${wall.location || 'unknown'}, Floor ${wall.floor}`,
      });
    } else {
      const pos = generateApproxPosition(approxIndex++);
      results.push({
        id: createDetectedMeasurementId('wall', wall.id, 'length'),
        pageNumber: pageNum,
        modelRef: { entity: 'wall', entityId: wall.id, field: 'length' },
        value: { ...wall.length },
        originalValue: null,
        source: 'claude_vision',
        confidence: 'low',
        startPt: pos.startPt,
        endPt: pos.endPt,
        label: `${wall.id}: ${formatDimension(wall.length)}`,
        status: 'flagged',
        entityDescription: `${wall.wall_type} Wall - ${wall.location || 'unknown'}, Floor ${wall.floor}`,
      });
    }

    // Wall height
    const heightPos = generateHeightPosition(heightIndex++);
    results.push({
      id: createDetectedMeasurementId('wall', wall.id, 'height'),
      pageNumber: elevationPage,
      modelRef: { entity: 'wall', entityId: wall.id, field: 'height' },
      value: { ...wall.height },
      originalValue: null,
      source: 'claude_vision',
      confidence: 'medium',
      startPt: heightPos.startPt,
      endPt: heightPos.endPt,
      label: `${wall.id} height: ${formatDimension(wall.height)}`,
      status: 'unverified',
      entityDescription: `${wall.wall_type} Wall - ${wall.location || 'unknown'}, Floor ${wall.floor}`,
    });
  }

  // ----- Rooms -----
  for (const room of model.rooms ?? []) {
    const pageNum = getFloorPlanPage(room.floor, floorToPage);
    const pm = measurementsByPage.get(pageNum);
    const usedSet = getUsedSet(pageNum);

    for (const field of ['length', 'width'] as const) {
      const dimValue = room[field];
      const dimInches = toTotalInches(dimValue);
      const match = pm
        ? findBestSegmentMatch(dimInches, pm.segments, usedSet)
        : null;

      if (match) {
        usedSet.add(match.index);
        const { source, confidence } = sourceFromSegment(match.segment);

        results.push({
          id: createDetectedMeasurementId('room', room.id, field),
          pageNumber: pageNum,
          modelRef: { entity: 'room', entityId: room.id, field },
          value: { ...dimValue },
          originalValue: null,
          source,
          confidence,
          startPt: [...match.segment.startPt],
          endPt: [...match.segment.endPt],
          label: `${room.name} ${field}: ${formatDimension(dimValue)}`,
          status: 'unverified',
          entityDescription: `Room - ${room.name}, Floor ${room.floor}`,
        });
      } else {
        const pos = generateApproxPosition(approxIndex++);
        results.push({
          id: createDetectedMeasurementId('room', room.id, field),
          pageNumber: pageNum,
          modelRef: { entity: 'room', entityId: room.id, field },
          value: { ...dimValue },
          originalValue: null,
          source: 'claude_vision',
          confidence: 'low',
          startPt: pos.startPt,
          endPt: pos.endPt,
          label: `${room.name} ${field}: ${formatDimension(dimValue)}`,
          status: 'flagged',
          entityDescription: `Room - ${room.name}, Floor ${room.floor}`,
        });
      }
    }
  }

  // ----- Openings -----
  for (const opening of model.openings ?? []) {
    // Use the first floor plan page (openings aren't tied to a specific floor in the model)
    const pageNum = floorToPage.get(1) ?? 1;
    const pm = measurementsByPage.get(pageNum);
    const usedSet = getUsedSet(pageNum);

    for (const field of ['width', 'height'] as const) {
      const dimValue = opening[field];
      const dimInches = toTotalInches(dimValue);

      // Only try segment matching for width (visible in floor plans)
      const match =
        field === 'width' && pm
          ? findBestSegmentMatch(dimInches, pm.segments, usedSet)
          : null;

      if (match) {
        usedSet.add(match.index);
        const { source, confidence } = sourceFromSegment(match.segment);

        results.push({
          id: createDetectedMeasurementId('opening', opening.id, field),
          pageNumber: pageNum,
          modelRef: { entity: 'opening', entityId: opening.id, field },
          value: { ...dimValue },
          originalValue: null,
          source,
          confidence,
          startPt: [...match.segment.startPt],
          endPt: [...match.segment.endPt],
          label: `${opening.opening_type} ${opening.id} ${field}: ${formatDimension(dimValue)}`,
          status: 'unverified',
          entityDescription: `${opening.opening_type === 'door' ? 'Door' : 'Window'} - ${opening.id}`,
        });
      } else {
        const pos =
          field === 'height'
            ? generateHeightPosition(heightIndex++)
            : generateApproxPosition(approxIndex++);
        const targetPage = field === 'height' ? elevationPage : pageNum;

        results.push({
          id: createDetectedMeasurementId('opening', opening.id, field),
          pageNumber: targetPage,
          modelRef: { entity: 'opening', entityId: opening.id, field },
          value: { ...dimValue },
          originalValue: null,
          source: 'claude_vision',
          confidence: field === 'height' ? 'medium' : 'low',
          startPt: pos.startPt,
          endPt: pos.endPt,
          label: `${opening.opening_type} ${opening.id} ${field}: ${formatDimension(dimValue)}`,
          status: field === 'height' ? 'unverified' : 'flagged',
          entityDescription: `${opening.opening_type === 'door' ? 'Door' : 'Window'} - ${opening.id}`,
        });
      }
    }
  }

  // ----- Sort: flagged first, then unverified, then corrected, then verified -----
  const statusOrder: Record<DetectedMeasurementStatus, number> = {
    flagged: 0,
    unverified: 1,
    corrected: 2,
    verified: 3,
  };

  results.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return results;
}
