/**
 * Tool executor for v2 agent tools.
 *
 * The chat panel calls executeToolCall() once per tool_use block returned
 * by the model. Read tools return JSON for the model. Mutate/UI tools
 * dispatch to the project store and return a short summary string.
 */

import type { ToolCall } from '@/hooks/useChat';
import type {
  Assumption,
  OpenQuestion,
  Inconsistency,
  ScopeItem,
  ConversationPhase,
} from '@/lib/types/project';
import {
  newAssumption,
  newOpenQuestion,
  newInconsistency,
  scopeItemFromResult,
  CONVERSATION_PHASES,
  nextPhase,
} from '@/lib/types/project';
import type { Measurement, ActiveMeasurementTool } from '@/lib/types/measurement';
import type { SheetManifest } from '@/lib/types/sheet-manifest';
import type { TradeModule } from '@/lib/trades/trade-types';
import { getTradeModule } from '@/lib/trades/trade-loader';
import { generateEstimate } from '@/lib/engine/estimate-engine';
import type { CostDatabase, ScopeItemResult } from '@/lib/engine/estimate-engine';
import { runOcrOnPage, runOcrOnRegion } from '@/lib/utils/ocr';
import type { OcrPageInput } from '@/lib/utils/ocr';
import { formatDimension } from '@/lib/utils/dimension-parser';

// ---------------------------------------------------------------------------
// Result + store callbacks
// ---------------------------------------------------------------------------

export interface ActionResult {
  success: boolean;
  /** Plain-text summary returned to the agent */
  message: string;
  /** Optional structured payload (returned to read tools) */
  payload?: unknown;
}

export interface StoreCallbacks {
  // Reads
  getProjectMeta: () => { id?: string; name: string; address: string; clientName: string; buildingType: string; selectedTrades: string[] };
  getMeasurements: () => Measurement[];
  getAssumptions: () => Assumption[];
  getOpenQuestions: () => OpenQuestion[];
  getInconsistencies: () => Inconsistency[];
  getScopeItems: () => ScopeItem[];
  getConversationPhase: () => ConversationPhase;
  getActiveTradeId: () => string | null;
  getSheetManifest: () => SheetManifest | null;
  getCosts: () => CostDatabase | null;
  /** Look up a page image by 1-indexed page number. Used for OCR. */
  getPdfPage: (page: number) => OcrPageInput | null;

  // Mutations
  addAssumption: (a: Assumption) => void;
  addOpenQuestion: (q: OpenQuestion) => void;
  addInconsistency: (i: Inconsistency) => void;
  setConversationPhase: (p: ConversationPhase) => void;
  setActiveTrade: (tradeId: string | null) => void;
  replaceTradeScopeItems: (tradeId: string, items: ScopeItem[]) => void;
  setPendingAgentAction: (action: { kind: 'measurement_suggested' | 'confirmation_requested'; payload: Record<string, unknown>; createdAt: string } | null) => void;

  // UI
  navigateToPage: (page: number) => void;
  startMeasurementTool: (tool: ActiveMeasurementTool) => void;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function executeToolCall(
  toolCall: ToolCall,
  store: StoreCallbacks
): Promise<ActionResult> {
  try {
    switch (toolCall.name) {
      // Read tools
      case 'get_sheet_manifest':
        return readSheetManifest(store);
      case 'get_project_state':
        return readProjectState(store);
      case 'get_trade_module':
        return readTradeModule(toolCall.input as unknown as { trade_id?: string }, store);
      case 'read_written_dimension':
        return readWrittenDimension(toolCall.input as unknown as ReadWrittenDimensionInput, store);

      // UI tools
      case 'highlight_sheet_region':
        return highlightSheetRegion(toolCall.input as unknown as HighlightInput, store);
      case 'suggest_measurement':
        return suggestMeasurement(toolCall.input as unknown as SuggestMeasurementInput, store);
      case 'request_user_confirmation':
        return requestUserConfirmation(toolCall.input as unknown as ConfirmationInput, store);

      // Mutate tools
      case 'add_assumption':
        return addAssumption(toolCall.input as unknown as AddAssumptionInput, store);
      case 'add_open_question':
        return addOpenQuestion(toolCall.input as unknown as AddOpenQuestionInput, store);
      case 'flag_inconsistency':
        return flagInconsistency(toolCall.input as unknown as FlagInconsistencyInput, store);
      case 'mark_phase_complete':
        return markPhaseComplete(toolCall.input as unknown as MarkPhaseInput, store);
      case 'generate_estimate_draft':
        return generateEstimateDraft(toolCall.input as unknown as GenerateEstimateInput, store);

      default:
        return { success: false, message: `Unknown tool: ${toolCall.name}` };
    }
  } catch (err) {
    return {
      success: false,
      message: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Tool input types
// ---------------------------------------------------------------------------

interface ReadWrittenDimensionInput {
  page: number;
  /** Optional region in image-pixel coords. If omitted, OCR runs on the full page. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}
interface HighlightInput {
  page: number;
  reason?: string;
}
interface SuggestMeasurementInput {
  semantic_tag: string;
  label: string;
  target_page: number;
  mode: 'linear' | 'area' | 'surface_area';
}
interface ConfirmationInput {
  question: string;
  context?: string;
}
interface AddAssumptionInput {
  trade_id: string;
  key: string;
  value: string;
  source?: 'agent_suggested' | 'user_confirmed' | 'user_override' | 'default';
}
interface AddOpenQuestionInput {
  question: string;
  trade_id?: string;
}
interface FlagInconsistencyInput {
  summary: string;
  detail?: string;
  page_number?: number;
}
interface MarkPhaseInput {
  completed_phase: ConversationPhase;
  rationale?: string;
}
interface GenerateEstimateInput {
  trade_id?: string;
}

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------

function readSheetManifest(store: StoreCallbacks): ActionResult {
  const manifest = store.getSheetManifest();
  if (!manifest) {
    return {
      success: true,
      message: 'No sheet manifest yet — the user has not uploaded a PDF (or classification is still running).',
      payload: null,
    };
  }
  // Return a compact, agent-friendly view
  const compact = manifest.sheets.map((s) => ({
    page: s.page,
    type: s.sheetType,
    title: s.title,
    sheet_number: s.sheetNumber,
    scale: s.scale,
    relevance: s.tradeRelevance,
  }));
  return {
    success: true,
    message: `Manifest with ${manifest.sheets.length} sheets returned.`,
    payload: { sheets: compact },
  };
}

function readProjectState(store: StoreCallbacks): ActionResult {
  const meta = store.getProjectMeta();
  const measurements = store.getMeasurements();
  const assumptions = store.getAssumptions();
  const openQuestions = store.getOpenQuestions();
  const inconsistencies = store.getInconsistencies();
  const scopeItems = store.getScopeItems();
  const phase = store.getConversationPhase();
  const activeTradeId = store.getActiveTradeId();

  // Aggregate measurements by semantic tag for quick visibility
  const measurementsByTag: Record<string, { value: number; unit: string; pages: number[] }> = {};
  for (const m of measurements) {
    if (!m.semanticTag) continue;
    const existing = measurementsByTag[m.semanticTag];
    if (existing) {
      existing.value += m.resultValue;
      if (!existing.pages.includes(m.pageNumber)) existing.pages.push(m.pageNumber);
    } else {
      measurementsByTag[m.semanticTag] = {
        value: m.resultValue,
        unit: m.resultUnit,
        pages: [m.pageNumber],
      };
    }
  }

  // Identify gaps for the active trade
  const missingMeasurements: string[] = [];
  const missingAssumptions: string[] = [];
  if (activeTradeId) {
    const mod = getTradeModule(activeTradeId);
    if (mod) {
      for (const rm of mod.requiredMeasurements) {
        if (!(rm.tag in measurementsByTag)) missingMeasurements.push(rm.tag);
      }
      const assumedKeys = new Set(
        assumptions.filter((a) => a.tradeId === activeTradeId).map((a) => a.key)
      );
      for (const ra of mod.requiredAssumptions) {
        if (!assumedKeys.has(ra.key)) missingAssumptions.push(ra.key);
      }
    }
  }

  return {
    success: true,
    message: 'Project state returned.',
    payload: {
      project: {
        id: meta.id,
        name: meta.name,
        address: meta.address,
        building_type: meta.buildingType,
        enabled_trades: meta.selectedTrades,
        active_trade: activeTradeId,
      },
      conversation_phase: phase,
      measurements_by_tag: measurementsByTag,
      assumptions: assumptions.map((a) => ({ trade: a.tradeId, key: a.key, value: a.value })),
      open_questions: openQuestions.filter((q) => q.status === 'open').map((q) => ({ id: q.id, question: q.question, trade: q.tradeId })),
      inconsistencies: inconsistencies.filter((i) => i.status !== 'resolved').map((i) => ({ id: i.id, summary: i.summary, detail: i.detail, page: i.pageNumber })),
      scope_items_count: scopeItems.length,
      gaps: {
        missing_measurements: missingMeasurements,
        missing_assumptions: missingAssumptions,
      },
    },
  };
}

function readTradeModule(input: { trade_id?: string }, store: StoreCallbacks): ActionResult {
  const tradeId = input.trade_id ?? store.getActiveTradeId();
  if (!tradeId) {
    return { success: false, message: 'No trade specified and no active trade set.' };
  }
  const mod = getTradeModule(tradeId);
  if (!mod) {
    return { success: false, message: `Unknown trade '${tradeId}'.` };
  }
  return {
    success: true,
    message: `Trade module '${mod.tradeId}' returned.`,
    payload: compactTradeModule(mod),
  };
}

function compactTradeModule(mod: TradeModule) {
  return {
    trade_id: mod.tradeId,
    display_name: mod.displayName,
    prompt_extension: mod.promptExtension,
    sheet_relevance: mod.sheetRelevance,
    required_measurements: mod.requiredMeasurements.map((m) => ({
      tag: m.tag,
      label: m.label,
      mode: m.mode,
      preferred_sheets: m.preferredSheets,
      priority: m.priority,
    })),
    required_assumptions: mod.requiredAssumptions.map((a) => ({
      key: a.key,
      prompt: a.prompt,
      default: a.default,
      options: a.options.map((o) => ({ value: o.value, label: o.label })),
    })),
    scope_items: mod.scopeItems.map((s) => ({
      id: s.id,
      category: s.category,
      description: s.description,
      unit: s.unit,
      requires: s.requiredMeasurements,
      gated_on: s.applies,
    })),
    common_inconsistencies: mod.commonInconsistencies,
  };
}

async function readWrittenDimension(
  input: ReadWrittenDimensionInput,
  store: StoreCallbacks
): Promise<ActionResult> {
  const page = store.getPdfPage(input.page);
  if (!page) {
    return {
      success: false,
      message: `Page ${input.page} is not loaded. Ask the user to upload the PDF first.`,
    };
  }

  const hasRegion =
    typeof input.x === 'number' &&
    typeof input.y === 'number' &&
    typeof input.width === 'number' &&
    typeof input.height === 'number';

  try {
    const result = hasRegion
      ? await runOcrOnRegion(page, {
          x: input.x as number,
          y: input.y as number,
          width: input.width as number,
          height: input.height as number,
        })
      : await runOcrOnPage(page);

    if (result.dimensions.length === 0) {
      return {
        success: true,
        message: hasRegion
          ? `OCR found no dimensions in the requested region of page ${input.page} (confidence ${result.confidence.toFixed(0)}). Consider expanding the region or asking the user to take a click-measurement.`
          : `OCR found no dimensions on page ${input.page} (confidence ${result.confidence.toFixed(0)}). Ask the user to take a click-measurement.`,
        payload: {
          dimensions: [],
          confidence: result.confidence,
          duration_ms: result.durationMs,
        },
      };
    }

    // Return the parsed dimensions in a compact form. If a region was given,
    // pixel coords are relative to that region; otherwise they're page-level.
    const dims = result.dimensions.map((d) => ({
      text: d.source,
      total_feet: d.totalFeet,
      formatted: formatDimension(d.totalFeet),
    }));

    return {
      success: true,
      message: `Found ${dims.length} dimension(s) on page ${input.page}: ${dims
        .slice(0, 5)
        .map((d) => d.formatted)
        .join(', ')}${dims.length > 5 ? ` (+${dims.length - 5} more)` : ''}. Confidence ${result.confidence.toFixed(0)}.`,
      payload: {
        dimensions: dims,
        confidence: result.confidence,
        duration_ms: result.durationMs,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `OCR failed: ${msg}. Fall back to suggest_measurement.`,
    };
  }
}

// ---------------------------------------------------------------------------
// UI tools
// ---------------------------------------------------------------------------

function highlightSheetRegion(input: HighlightInput, store: StoreCallbacks): ActionResult {
  store.navigateToPage(input.page);
  return {
    success: true,
    message: input.reason
      ? `Navigated to page ${input.page} — ${input.reason}`
      : `Navigated to page ${input.page}.`,
  };
}

function suggestMeasurement(input: SuggestMeasurementInput, store: StoreCallbacks): ActionResult {
  // Render the prompt card by setting the pending action
  store.setPendingAgentAction({
    kind: 'measurement_suggested',
    payload: { ...input },
    createdAt: new Date().toISOString(),
  });
  // Pre-navigate the viewer so the user is on the right page when they click
  store.navigateToPage(input.target_page);
  return {
    success: true,
    message: `Measurement card shown to user: "${input.label}" (page ${input.target_page}, ${input.mode}). The user will click "Measure" to begin.`,
  };
}

function requestUserConfirmation(input: ConfirmationInput, store: StoreCallbacks): ActionResult {
  store.setPendingAgentAction({
    kind: 'confirmation_requested',
    payload: { ...input },
    createdAt: new Date().toISOString(),
  });
  return {
    success: true,
    message: `Confirmation card shown: "${input.question}". Wait for the user's response before proceeding.`,
  };
}

// ---------------------------------------------------------------------------
// Mutate tools
// ---------------------------------------------------------------------------

function addAssumption(input: AddAssumptionInput, store: StoreCallbacks): ActionResult {
  const mod = getTradeModule(input.trade_id);
  if (!mod) {
    return { success: false, message: `Unknown trade '${input.trade_id}'.` };
  }
  const a = mod.requiredAssumptions.find((x) => x.key === input.key);
  if (!a) {
    return {
      success: false,
      message: `Unknown assumption key '${input.key}' for trade '${input.trade_id}'. Valid keys: ${mod.requiredAssumptions.map((r) => r.key).join(', ')}`,
    };
  }
  if (!a.options.some((o) => o.value === input.value)) {
    return {
      success: false,
      message: `Invalid value '${input.value}' for '${input.key}'. Options: ${a.options.map((o) => o.value).join(', ')}`,
    };
  }
  store.addAssumption(
    newAssumption({
      tradeId: input.trade_id,
      key: input.key,
      value: input.value,
      source: input.source ?? 'agent_suggested',
    })
  );
  return {
    success: true,
    message: `Recorded ${input.trade_id}.${input.key} = ${input.value}`,
  };
}

function addOpenQuestion(input: AddOpenQuestionInput, store: StoreCallbacks): ActionResult {
  store.addOpenQuestion(newOpenQuestion({ tradeId: input.trade_id, question: input.question }));
  return { success: true, message: `Open question logged: "${input.question}"` };
}

function flagInconsistency(input: FlagInconsistencyInput, store: StoreCallbacks): ActionResult {
  store.addInconsistency(
    newInconsistency({
      summary: input.summary,
      detail: input.detail,
      pageNumber: input.page_number,
    })
  );
  return { success: true, message: `Inconsistency flagged: ${input.summary}` };
}

function markPhaseComplete(input: MarkPhaseInput, store: StoreCallbacks): ActionResult {
  const current = store.getConversationPhase();
  if (input.completed_phase !== current) {
    return {
      success: false,
      message: `Phase '${input.completed_phase}' isn't the current phase ('${current}'). No change.`,
    };
  }
  const next = nextPhase(current);
  if (!next) {
    return { success: true, message: `Already at the final phase ('${current}'). No advance.` };
  }
  store.setConversationPhase(next);
  return {
    success: true,
    message: `Phase advanced: ${current} → ${next}${input.rationale ? ` (${input.rationale})` : ''}`,
  };
}

function generateEstimateDraft(input: GenerateEstimateInput, store: StoreCallbacks): ActionResult {
  const tradeId = input.trade_id ?? store.getActiveTradeId();
  if (!tradeId) {
    return { success: false, message: 'No trade specified and no active trade set.' };
  }
  const mod = getTradeModule(tradeId);
  if (!mod) {
    return { success: false, message: `Unknown trade '${tradeId}'.` };
  }
  const costs = store.getCosts();
  if (!costs) {
    return { success: false, message: 'Cost database unavailable.' };
  }

  // Build assumption map from confirmed assumptions
  const assumptionMap: Record<string, string> = {};
  for (const a of store.getAssumptions()) {
    if (a.tradeId === tradeId) assumptionMap[a.key] = a.value;
  }

  const result = generateEstimate({
    module: mod,
    measurements: store.getMeasurements(),
    assumptions: assumptionMap,
    costs,
  });

  // Persist as ScopeItems
  const scopeItems = result.items.map(scopeItemFromResult);
  store.replaceTradeScopeItems(tradeId, scopeItems);

  // Compact summary for the agent
  const total = result.items.reduce((s, i) => s + i.lineTotal, 0);
  return {
    success: true,
    message: `Generated ${result.items.length} scope items for ${tradeId} (total $${total.toFixed(2)}). ${result.skipped.length} skipped.`,
    payload: {
      items: result.items.map((r: ScopeItemResult) => ({
        id: r.scopeItemId,
        description: r.description,
        quantity: r.quantity,
        unit: r.unit,
        unit_cost: r.unitCost,
        line_total: r.lineTotal,
      })),
      skipped: result.skipped,
      total,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const PHASE_ORDER = CONVERSATION_PHASES;
