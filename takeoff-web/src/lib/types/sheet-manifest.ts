/**
 * Sheet manifest — per-PDF-page classification produced by the document
 * ingestion layer (Layer 1 in the v2 architecture).
 *
 * Each sheet is classified by type, scored for relevance to each enabled
 * trade, and tagged with the scale and sheet number printed in the title
 * block. The agent uses this to decide which sheets to walk through for
 * a given trade and to filter out irrelevant pages.
 */

export type SheetType =
  | 'cover'
  | 'site_plan'
  | 'floor_plan'
  | 'reflected_ceiling_plan'
  | 'roof_plan'
  | 'elevation'
  | 'building_section'
  | 'wall_section'
  | 'detail'
  | 'window_schedule'
  | 'door_schedule'
  | 'wall_types'
  | 'specifications'
  | 'mechanical'
  | 'electrical'
  | 'plumbing'
  | 'structural'
  | 'unknown';

export type Relevance = 'primary' | 'secondary' | 'irrelevant';

export interface SheetClassification {
  /** 1-indexed PDF page number */
  page: number;
  /** Classified type (best guess from vision + title block text) */
  sheetType: SheetType;
  /** Title from the title block, e.g. "MAIN FLOOR PLAN" */
  title: string;
  /** Sheet number printed on the page, e.g. "A-101" */
  sheetNumber: string;
  /** Scale string read from the title block, e.g. '1/4" = 1\'-0"' or null */
  scale: string | null;
  /** How relevant this sheet is for each trade. Keyed by trade id. */
  tradeRelevance: Record<string, Relevance>;
  /** Confidence in the classification (model-reported) */
  confidence: 'high' | 'medium' | 'low';
}

export interface SheetManifest {
  /** Project id this manifest belongs to */
  projectId: string;
  /** PDF filename (for cache keying) */
  pdfFilename: string;
  /** ISO timestamp when classification ran */
  classifiedAt: string;
  /** Per-page classifications, in page order */
  sheets: SheetClassification[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sheet types most likely to be useful for a given trade.
 * Mirrors the Sheet Relevance Matrix in the v2 product plan (Section 6.2).
 * Used as a fallback when the model doesn't return per-trade relevance.
 */
export const TRADE_SHEET_RELEVANCE: Record<string, Record<SheetType, Relevance>> = {
  insulation: {
    cover: 'irrelevant',
    site_plan: 'irrelevant',
    floor_plan: 'primary',
    reflected_ceiling_plan: 'secondary',
    roof_plan: 'secondary',
    elevation: 'secondary',
    building_section: 'primary',
    wall_section: 'primary',
    detail: 'secondary',
    window_schedule: 'irrelevant',
    door_schedule: 'irrelevant',
    wall_types: 'secondary',
    specifications: 'primary',
    mechanical: 'irrelevant',
    electrical: 'irrelevant',
    plumbing: 'irrelevant',
    structural: 'secondary',
    unknown: 'irrelevant',
  },
  gutters: {
    cover: 'irrelevant',
    site_plan: 'secondary',
    floor_plan: 'secondary',
    reflected_ceiling_plan: 'irrelevant',
    roof_plan: 'primary',
    elevation: 'primary',
    building_section: 'secondary',
    wall_section: 'secondary',
    detail: 'secondary',
    window_schedule: 'irrelevant',
    door_schedule: 'irrelevant',
    wall_types: 'irrelevant',
    specifications: 'secondary',
    mechanical: 'irrelevant',
    electrical: 'irrelevant',
    plumbing: 'irrelevant',
    structural: 'irrelevant',
    unknown: 'irrelevant',
  },
};

/** Fill in missing tradeRelevance entries from the static matrix. */
export function backfillTradeRelevance(
  sheetType: SheetType,
  partial: Record<string, Relevance> | undefined
): Record<string, Relevance> {
  const result: Record<string, Relevance> = { ...(partial ?? {}) };
  for (const trade of Object.keys(TRADE_SHEET_RELEVANCE)) {
    if (!result[trade]) {
      result[trade] = TRADE_SHEET_RELEVANCE[trade][sheetType] ?? 'irrelevant';
    }
  }
  return result;
}

/** Filter sheets to those with `primary` or `secondary` relevance for a trade. */
export function relevantSheetsForTrade(
  manifest: SheetManifest,
  tradeId: string
): SheetClassification[] {
  return manifest.sheets.filter((s) => {
    const r = s.tradeRelevance[tradeId];
    return r === 'primary' || r === 'secondary';
  });
}

/**
 * Look up the classification for a given page number. Used by the agent and
 * UI layers to join measurements (which carry pageNumber) with sheet metadata
 * without denormalizing the data.
 */
export function sheetForPage(
  manifest: SheetManifest | null | undefined,
  page: number
): SheetClassification | null {
  if (!manifest) return null;
  return manifest.sheets.find((s) => s.page === page) ?? null;
}
