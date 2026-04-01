/**
 * Local persistence layer using localStorage.
 * Provides offline-first storage for project data when Supabase is not configured.
 * Data persists across page navigations and browser sessions.
 */

import type { SpreadsheetLineItem } from '@/lib/types/line-item';
import type { Measurement } from '@/lib/types/measurement';
import type { ScaleInfo } from '@/lib/utils/scale-detection';

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function projectKey(projectId: string, suffix: string): string {
  return `takeoff-${projectId}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Line Items
// ---------------------------------------------------------------------------

export function saveLineItemsLocal(projectId: string, items: SpreadsheetLineItem[]): void {
  try {
    localStorage.setItem(projectKey(projectId, 'lineItems'), JSON.stringify(items));
  } catch (e) {
    console.warn('Failed to save line items to localStorage:', e);
  }
}

export function loadLineItemsLocal(projectId: string): SpreadsheetLineItem[] | null {
  try {
    const raw = localStorage.getItem(projectKey(projectId, 'lineItems'));
    if (!raw) return null;
    return JSON.parse(raw) as SpreadsheetLineItem[];
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Building Model
// ---------------------------------------------------------------------------

export function saveBuildingModelLocal(projectId: string, model: Record<string, unknown>): void {
  try {
    localStorage.setItem(projectKey(projectId, 'buildingModel'), JSON.stringify(model));
  } catch (e) {
    console.warn('Failed to save building model to localStorage:', e);
  }
}

export function loadBuildingModelLocal(projectId: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(projectKey(projectId, 'buildingModel'));
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

export function saveMeasurementsLocal(projectId: string, measurements: Measurement[]): void {
  try {
    localStorage.setItem(projectKey(projectId, 'measurements'), JSON.stringify(measurements));
  } catch (e) {
    console.warn('Failed to save measurements to localStorage:', e);
  }
}

export function loadMeasurementsLocal(projectId: string): Measurement[] | null {
  try {
    const raw = localStorage.getItem(projectKey(projectId, 'measurements'));
    if (!raw) return null;
    return JSON.parse(raw) as Measurement[];
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Page Scales
// ---------------------------------------------------------------------------

export function savePageScalesLocal(
  projectId: string,
  scales: Record<number, ScaleInfo>,
  overrides: Record<number, ScaleInfo>
): void {
  try {
    localStorage.setItem(projectKey(projectId, 'pageScales'), JSON.stringify(scales));
    localStorage.setItem(projectKey(projectId, 'scaleOverrides'), JSON.stringify(overrides));
  } catch (e) {
    console.warn('Failed to save page scales to localStorage:', e);
  }
}

export function loadPageScalesLocal(projectId: string): {
  scales: Record<number, ScaleInfo>;
  overrides: Record<number, ScaleInfo>;
} | null {
  try {
    const rawScales = localStorage.getItem(projectKey(projectId, 'pageScales'));
    const rawOverrides = localStorage.getItem(projectKey(projectId, 'scaleOverrides'));
    if (!rawScales) return null;
    return {
      scales: JSON.parse(rawScales) as Record<number, ScaleInfo>,
      overrides: rawOverrides ? JSON.parse(rawOverrides) as Record<number, ScaleInfo> : {},
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Page Classifications
// ---------------------------------------------------------------------------

export function savePageClassificationsLocal(
  projectId: string,
  classifications: { page: number; type: string; description: string }[]
): void {
  try {
    localStorage.setItem(projectKey(projectId, 'pageClassifications'), JSON.stringify(classifications));
  } catch (e) {
    console.warn('Failed to save page classifications to localStorage:', e);
  }
}

export function loadPageClassificationsLocal(
  projectId: string
): { page: number; type: string; description: string }[] | null {
  try {
    const raw = localStorage.getItem(projectKey(projectId, 'pageClassifications'));
    if (!raw) return null;
    return JSON.parse(raw) as { page: number; type: string; description: string }[];
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Analysis Status
// ---------------------------------------------------------------------------

export function saveAnalysisStatusLocal(projectId: string, status: string): void {
  try {
    localStorage.setItem(projectKey(projectId, 'analysisStatus'), status);
  } catch {
    // ignore
  }
}

export function loadAnalysisStatusLocal(projectId: string): string | null {
  try {
    return localStorage.getItem(projectKey(projectId, 'analysisStatus'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Delete all project data
// ---------------------------------------------------------------------------

export function deleteProjectDataLocal(projectId: string): void {
  const suffixes = ['lineItems', 'buildingModel', 'measurements', 'pageScales', 'scaleOverrides', 'pageClassifications', 'analysisStatus'];
  for (const suffix of suffixes) {
    try {
      localStorage.removeItem(projectKey(projectId, suffix));
    } catch {
      // ignore
    }
  }
}
