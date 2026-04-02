/**
 * Data model for auto-detected measurements extracted from the BuildingModel
 * and cross-referenced with vector/text measurements from the PDF.
 *
 * These are displayed on the DetectionOverlay during the 'reviewing' phase
 * so users can verify and correct dimensions before estimate generation.
 *
 * Coordinates are stored in PDF units (72 per inch, top-down Y) to match
 * the coordinate system used by pdf-vector-extract.ts and vector-measurement.ts.
 */

// ---------------------------------------------------------------------------
// Core Types
// ---------------------------------------------------------------------------

export type DetectedMeasurementSource =
  | 'text_callout'       // Matched a dimension callout in PDF text layer
  | 'vector_calculated'  // Calculated from vector line length × scale
  | 'claude_vision'      // From Claude's image analysis (no vector/text confirmation)
  | 'user_manual';       // User-provided via correction or manual measurement

export type DetectedMeasurementConfidence = 'high' | 'medium' | 'low';

export type DetectedMeasurementStatus =
  | 'verified'    // User confirmed this is correct
  | 'unverified'  // Not yet reviewed
  | 'flagged'     // Needs attention (low confidence or discrepancy)
  | 'corrected';  // User provided a different value

export interface ModelRef {
  entity: 'wall' | 'room' | 'opening' | 'roof' | 'foundation';
  entityId: string;  // e.g. "ext_wall_n1", "room_kitchen"
  field: string;     // e.g. "length", "height", "width", "area"
}

export interface DetectedMeasurement {
  id: string;
  pageNumber: number;
  modelRef: ModelRef;
  /** The dimension value from the BuildingModel (or corrected by user) */
  value: { feet: number; inches: number };
  /** Original value before correction (null if never corrected) */
  originalValue: { feet: number; inches: number } | null;
  source: DetectedMeasurementSource;
  confidence: DetectedMeasurementConfidence;
  /** Start point in PDF units (top-down Y). May be approximate for claude_vision source. */
  startPt: [number, number];
  /** End point in PDF units (top-down Y). May be approximate for claude_vision source. */
  endPt: [number, number];
  /** Display label, e.g. "W1: 26'-0\" (exterior, north)" */
  label: string;
  status: DetectedMeasurementStatus;
  /** Additional context for display */
  entityDescription: string;  // e.g. "Exterior Wall - North, Floor 1"
}

// ---------------------------------------------------------------------------
// Status Colors (for overlay rendering)
// ---------------------------------------------------------------------------

export const STATUS_COLORS: Record<DetectedMeasurementStatus, string> = {
  verified: '#22c55e',   // green
  unverified: '#f59e0b', // amber
  flagged: '#ef4444',    // red
  corrected: '#3b82f6',  // blue
};

export function getStatusColor(status: DetectedMeasurementStatus): string {
  return STATUS_COLORS[status] || '#6b7280';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a dimension value as architectural string, e.g. "26'-0\"" */
export function formatDimension(value: { feet: number; inches: number }): string {
  const ft = Math.floor(value.feet);
  const totalInches = (value.feet - ft) * 12 + value.inches;
  const inches = Math.round(totalInches);
  if (inches === 0) return `${ft}'-0"`;
  if (inches === 12) return `${ft + 1}'-0"`;
  return `${ft}'-${inches}"`;
}

/** Generate a unique ID for a detected measurement */
export function createDetectedMeasurementId(
  entity: string,
  entityId: string,
  field: string
): string {
  return `dm-${entity}-${entityId}-${field}`;
}
