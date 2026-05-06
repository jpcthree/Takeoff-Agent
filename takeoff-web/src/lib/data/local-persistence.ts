/**
 * Local persistence layer using localStorage.
 * Provides offline-first storage for project data when Supabase is not configured.
 * Data persists across page navigations and browser sessions.
 */

import type { SpreadsheetLineItem } from '@/lib/types/line-item';
import type { Measurement } from '@/lib/types/measurement';
import { semanticTagFor, defaultTradeAssociations } from '@/lib/types/measurement';
import type { ScaleInfo } from '@/lib/utils/scale-detection';
import type { SheetManifest } from '@/lib/types/sheet-manifest';
import type {
  Assumption,
  OpenQuestion,
  Inconsistency,
  ScopeItem,
  ConversationPhase,
} from '@/lib/types/project';

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
    const parsed = JSON.parse(raw) as Measurement[];
    // Backfill v2 fields on legacy entries
    return parsed.map((m) => ({
      ...m,
      semanticTag: m.semanticTag ?? semanticTagFor(m.trade, m.measurementType, m.mode),
      tradeAssociations: m.tradeAssociations ?? defaultTradeAssociations(m.trade),
      sourceSheetPage: m.sourceSheetPage ?? m.pageNumber,
    }));
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
// Sheet Manifest (Layer 1)
// ---------------------------------------------------------------------------

export function saveSheetManifestLocal(projectId: string, manifest: SheetManifest): void {
  try {
    localStorage.setItem(projectKey(projectId, 'sheetManifest'), JSON.stringify(manifest));
  } catch (e) {
    console.warn('Failed to save sheet manifest to localStorage:', e);
  }
}

export function loadSheetManifestLocal(projectId: string): SheetManifest | null {
  try {
    const raw = localStorage.getItem(projectKey(projectId, 'sheetManifest'));
    if (!raw) return null;
    return JSON.parse(raw) as SheetManifest;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// V2 conversation entities (Layer 3)
// ---------------------------------------------------------------------------

function saveJson<T>(projectId: string, suffix: string, value: T): void {
  try {
    localStorage.setItem(projectKey(projectId, suffix), JSON.stringify(value));
  } catch (e) {
    console.warn(`Failed to save ${suffix} to localStorage:`, e);
  }
}

function loadJson<T>(projectId: string, suffix: string): T | null {
  try {
    const raw = localStorage.getItem(projectKey(projectId, suffix));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const saveAssumptionsLocal = (id: string, v: Assumption[]) => saveJson(id, 'assumptions', v);
export const loadAssumptionsLocal = (id: string) => loadJson<Assumption[]>(id, 'assumptions');

export const saveOpenQuestionsLocal = (id: string, v: OpenQuestion[]) => saveJson(id, 'openQuestions', v);
export const loadOpenQuestionsLocal = (id: string) => loadJson<OpenQuestion[]>(id, 'openQuestions');

export const saveInconsistenciesLocal = (id: string, v: Inconsistency[]) => saveJson(id, 'inconsistencies', v);
export const loadInconsistenciesLocal = (id: string) => loadJson<Inconsistency[]>(id, 'inconsistencies');

export const saveScopeItemsLocal = (id: string, v: ScopeItem[]) => saveJson(id, 'scopeItems', v);
export const loadScopeItemsLocal = (id: string) => loadJson<ScopeItem[]>(id, 'scopeItems');

export const saveConversationPhaseLocal = (id: string, v: ConversationPhase) =>
  saveJson(id, 'conversationPhase', v);
export const loadConversationPhaseLocal = (id: string) =>
  loadJson<ConversationPhase>(id, 'conversationPhase');

export const saveActiveTradeLocal = (id: string, v: string | null) =>
  saveJson(id, 'activeTrade', v);
export const loadActiveTradeLocal = (id: string) => loadJson<string | null>(id, 'activeTrade');

// ---------------------------------------------------------------------------
// Delete all project data
// ---------------------------------------------------------------------------

export function deleteProjectDataLocal(projectId: string): void {
  const suffixes = [
    'lineItems', 'measurements', 'pageScales', 'scaleOverrides',
    'pageClassifications', 'analysisStatus', 'sheetManifest',
    'assumptions', 'openQuestions', 'inconsistencies', 'scopeItems',
    'conversationPhase', 'activeTrade', 'conversationHistory',
  ];
  for (const suffix of suffixes) {
    try {
      localStorage.removeItem(projectKey(projectId, suffix));
    } catch {
      // ignore
    }
  }
}
