/**
 * Data model for user-created manual measurements on blueprint pages.
 *
 * Points are stored in image-pixel coordinates at the 150 DPI render resolution
 * used by PdfViewer. Conversion to real-world dimensions requires the page scale.
 */

// ---------------------------------------------------------------------------
// Core Types
// ---------------------------------------------------------------------------

export interface MeasurementPoint {
  x: number; // image pixel X at 150 DPI
  y: number; // image pixel Y at 150 DPI
}

export type MeasurementMode = 'linear' | 'area' | 'surface_area';

export interface Measurement {
  id: string;
  name: string;                    // user-editable label
  trade: string;                   // 'insulation', 'drywall', etc.
  measurementType: string;         // 'exterior_wall', 'ceiling', 'roof_plane', etc.
  mode: MeasurementMode;           // linear → LF, area → SF, surface_area → LF × height → SF
  pageNumber: number;
  points: MeasurementPoint[];      // click points in image-pixel coords
  isClosed: boolean;               // true for area/surface_area polygons
  heightFt: number | null;         // wall height for surface_area (AI-suggested or user-entered)
  resultValue: number;             // computed LF or SF
  resultUnit: string;              // 'LF' or 'SF'
  scaleString: string;             // scale used at time of measurement
  scaleFactor: number;             // scale factor used
  createdAt: string;               // ISO timestamp
  addedToEstimate: boolean;        // true if converted to a line item
}

// ---------------------------------------------------------------------------
// Active Tool State
// ---------------------------------------------------------------------------

export interface ActiveMeasurementTool {
  trade: string;
  measurementType: string;
  mode: MeasurementMode;
}

// ---------------------------------------------------------------------------
// Trade Measurement Type Definitions
// ---------------------------------------------------------------------------

export interface MeasurementTypeOption {
  id: string;
  label: string;
  mode: MeasurementMode;
}

export const MEASUREMENT_TYPES: Record<string, MeasurementTypeOption[]> = {
  insulation: [
    { id: 'exterior_wall', label: 'Exterior Wall', mode: 'surface_area' },
    { id: 'interior_wall', label: 'Interior Wall', mode: 'surface_area' },
    { id: 'ceiling', label: 'Ceiling', mode: 'area' },
    { id: 'attic_floor', label: 'Attic Floor', mode: 'area' },
    { id: 'floor', label: 'Floor', mode: 'area' },
    { id: 'crawlspace_wall', label: 'Crawlspace Wall', mode: 'surface_area' },
    { id: 'crawlspace_floor', label: 'Crawlspace Floor', mode: 'area' },
    { id: 'rim_joist', label: 'Rim Joist', mode: 'linear' },
    { id: 'other', label: 'Other', mode: 'linear' },
  ],
  drywall: [
    { id: 'ceiling', label: 'Ceiling', mode: 'area' },
    { id: 'standard_wall', label: 'Standard Wall', mode: 'surface_area' },
    { id: 'garage_separation', label: 'Garage Separation', mode: 'surface_area' },
    { id: 'wet_area_wall', label: 'Wet Area Wall', mode: 'surface_area' },
    { id: 'fire_rated_wall', label: 'Fire-Rated Wall', mode: 'surface_area' },
    { id: 'other', label: 'Other', mode: 'linear' },
  ],
  roofing: [
    { id: 'roof_plane', label: 'Roof Plane', mode: 'area' },
    { id: 'valley', label: 'Valley', mode: 'linear' },
    { id: 'ridge', label: 'Ridge', mode: 'linear' },
    { id: 'hip', label: 'Hip', mode: 'linear' },
    { id: 'eave', label: 'Eave', mode: 'linear' },
    { id: 'rake', label: 'Rake', mode: 'linear' },
    { id: 'other', label: 'Other', mode: 'linear' },
  ],
  gutters: [
    { id: 'eave_run', label: 'Eave Run', mode: 'linear' },
    { id: 'downspout', label: 'Downspout Location', mode: 'linear' },
    { id: 'other', label: 'Other', mode: 'linear' },
  ],
  framing: [
    { id: 'exterior_wall', label: 'Exterior Wall', mode: 'linear' },
    { id: 'interior_wall', label: 'Interior Wall', mode: 'linear' },
    { id: 'header', label: 'Header', mode: 'linear' },
    { id: 'floor_joist_area', label: 'Floor Joist Area', mode: 'area' },
    { id: 'other', label: 'Other', mode: 'linear' },
  ],
  electrical: [
    { id: 'circuit_run', label: 'Circuit Run', mode: 'linear' },
    { id: 'device_area', label: 'Device Count Area', mode: 'area' },
    { id: 'other', label: 'Other', mode: 'linear' },
  ],
  plumbing: [
    { id: 'pipe_run', label: 'Pipe Run', mode: 'linear' },
    { id: 'other', label: 'Other', mode: 'linear' },
  ],
  hvac: [
    { id: 'duct_run', label: 'Duct Run', mode: 'linear' },
    { id: 'register_area', label: 'Register Area', mode: 'area' },
    { id: 'other', label: 'Other', mode: 'linear' },
  ],
  exterior: [
    { id: 'siding_area', label: 'Siding Area', mode: 'area' },
    { id: 'trim_run', label: 'Trim Run', mode: 'linear' },
    { id: 'soffit_area', label: 'Soffit Area', mode: 'area' },
    { id: 'fascia_run', label: 'Fascia Run', mode: 'linear' },
    { id: 'other', label: 'Other', mode: 'linear' },
  ],
  interior: [
    { id: 'floor_area', label: 'Floor Area', mode: 'area' },
    { id: 'baseboard_run', label: 'Baseboard Run', mode: 'linear' },
    { id: 'door_casing', label: 'Door Casing', mode: 'linear' },
    { id: 'paint_area', label: 'Paint Area', mode: 'area' },
    { id: 'other', label: 'Other', mode: 'linear' },
  ],
};

// ---------------------------------------------------------------------------
// Trade Colors (for overlay rendering)
// ---------------------------------------------------------------------------

export const TRADE_COLORS: Record<string, string> = {
  insulation: '#f59e0b',  // amber
  drywall: '#8b5cf6',     // violet
  roofing: '#ef4444',     // red
  gutters: '#06b6d4',     // cyan
  framing: '#84cc16',     // lime
  electrical: '#f97316',  // orange
  plumbing: '#3b82f6',    // blue
  hvac: '#10b981',        // emerald
  exterior: '#a855f7',    // purple
  interior: '#ec4899',    // pink
};

export function getTradeColor(trade: string): string {
  return TRADE_COLORS[trade.toLowerCase()] || '#6b7280'; // gray fallback
}
