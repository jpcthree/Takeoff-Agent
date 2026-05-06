'use client';

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { PdfPage } from '@/lib/api/python-service';
import type { SpreadsheetLineItem } from '@/lib/types/line-item';
import type { Measurement, ActiveMeasurementTool } from '@/lib/types/measurement';
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
// Types
// ---------------------------------------------------------------------------

export interface ProjectMeta {
  id?: string;
  name: string;
  address: string;
  clientName: string;
  buildingType: string;
  selectedTrades: string[];
}

export type AnalysisStatus =
  | 'idle'
  | 'uploading'
  | 'converting'
  | 'ready'
  | 'error';

export interface ProjectState {
  pdfFile: File | null;
  pdfPages: PdfPage[];
  lineItems: SpreadsheetLineItem[];
  costs: Record<string, unknown> | null;
  projectMeta: ProjectMeta;
  analysisStatus: AnalysisStatus;
  error: string | null;
  analysisMessages: string[];

  // ── Measurement tool fields ──
  measurements: Measurement[];
  pageScales: Record<number, ScaleInfo>;
  scaleOverrides: Record<number, ScaleInfo>;
  pageClassifications: { page: number; type: string; description: string }[];
  activeMeasurementTool: ActiveMeasurementTool | null;

  // ── Document ingestion (Layer 1) ──
  sheetManifest: SheetManifest | null;
  /** True while /api/classify-sheets is running */
  classifyingSheets: boolean;

  // ── Conversation state (Layer 3) ──
  conversationPhase: ConversationPhase;
  /** Active trade in the agent's current focus (for sequential mode) */
  activeTradeId: string | null;
  assumptions: Assumption[];
  openQuestions: OpenQuestion[];
  inconsistencies: Inconsistency[];
  /** Scope items produced by the rules engine */
  scopeItems: ScopeItem[];
  /**
   * Pending agent action for chat-side rendering. The chat panel watches
   * this to render measurement prompt cards and confirmation requests.
   * Cleared when the user responds.
   */
  pendingAgentAction: {
    kind: 'measurement_suggested' | 'confirmation_requested';
    payload: Record<string, unknown>;
    createdAt: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type ProjectAction =
  | { type: 'SET_PDF_FILE'; file: File }
  | { type: 'SET_PDF_PAGES'; pages: PdfPage[] }
  | { type: 'SET_LINE_ITEMS'; items: SpreadsheetLineItem[] }
  | { type: 'UPDATE_LINE_ITEM'; id: string; changes: Partial<SpreadsheetLineItem> }
  | { type: 'REPLACE_TRADE_ITEMS'; trade: string; items: SpreadsheetLineItem[] }
  | { type: 'ADD_LINE_ITEM'; item: SpreadsheetLineItem }
  | { type: 'REMOVE_LINE_ITEM'; id: string }
  | { type: 'SET_COSTS'; costs: Record<string, unknown> }
  | { type: 'SET_PROJECT_META'; meta: Partial<ProjectMeta> }
  | { type: 'SET_STATUS'; status: AnalysisStatus }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'ADD_ANALYSIS_MESSAGE'; message: string }
  | { type: 'CLEAR_ANALYSIS_MESSAGES' }
  | { type: 'SET_PAGE_SCALES'; scales: Record<number, ScaleInfo> }
  | { type: 'SET_SCALE_OVERRIDE'; pageNumber: number; scale: ScaleInfo }
  | { type: 'SET_PAGE_CLASSIFICATIONS'; classifications: { page: number; type: string; description: string }[] }
  | { type: 'ADD_MEASUREMENT'; measurement: Measurement }
  | { type: 'UPDATE_MEASUREMENT'; id: string; changes: Partial<Measurement> }
  | { type: 'REMOVE_MEASUREMENT'; id: string }
  | { type: 'SET_ACTIVE_MEASUREMENT_TOOL'; tool: ActiveMeasurementTool | null }
  | { type: 'SET_SHEET_MANIFEST'; manifest: SheetManifest | null }
  | { type: 'SET_CLASSIFYING_SHEETS'; classifying: boolean }
  | { type: 'SET_CONVERSATION_PHASE'; phase: ConversationPhase }
  | { type: 'SET_ACTIVE_TRADE'; tradeId: string | null }
  | { type: 'ADD_ASSUMPTION'; assumption: Assumption }
  | { type: 'UPDATE_ASSUMPTION'; id: string; changes: Partial<Assumption> }
  | { type: 'REMOVE_ASSUMPTION'; id: string }
  | { type: 'SET_ASSUMPTIONS'; assumptions: Assumption[] }
  | { type: 'ADD_OPEN_QUESTION'; question: OpenQuestion }
  | { type: 'UPDATE_OPEN_QUESTION'; id: string; changes: Partial<OpenQuestion> }
  | { type: 'REMOVE_OPEN_QUESTION'; id: string }
  | { type: 'ADD_INCONSISTENCY'; inconsistency: Inconsistency }
  | { type: 'UPDATE_INCONSISTENCY'; id: string; changes: Partial<Inconsistency> }
  | { type: 'SET_SCOPE_ITEMS'; items: ScopeItem[] }
  | { type: 'REPLACE_TRADE_SCOPE_ITEMS'; tradeId: string; items: ScopeItem[] }
  | { type: 'SET_PENDING_AGENT_ACTION'; action: ProjectState['pendingAgentAction'] }
  | { type: 'RESET' };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: ProjectState = {
  pdfFile: null,
  pdfPages: [],
  lineItems: [],
  costs: null,
  projectMeta: { name: '', address: '', clientName: '', buildingType: 'residential', selectedTrades: [] },
  analysisStatus: 'idle',
  error: null,
  analysisMessages: [],
  measurements: [],
  pageScales: {},
  scaleOverrides: {},
  pageClassifications: [],
  activeMeasurementTool: null,
  sheetManifest: null,
  classifyingSheets: false,
  conversationPhase: 'orientation',
  activeTradeId: null,
  assumptions: [],
  openQuestions: [],
  inconsistencies: [],
  scopeItems: [],
  pendingAgentAction: null,
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case 'SET_PDF_FILE':
      return { ...state, pdfFile: action.file, error: null };

    case 'SET_PDF_PAGES':
      return { ...state, pdfPages: action.pages };

    case 'SET_LINE_ITEMS':
      return { ...state, lineItems: action.items };

    case 'UPDATE_LINE_ITEM':
      return {
        ...state,
        lineItems: state.lineItems.map((item) =>
          item.id === action.id ? { ...item, ...action.changes } : item
        ),
      };

    case 'REPLACE_TRADE_ITEMS': {
      const otherItems = state.lineItems.filter((i) => i.trade !== action.trade);
      return { ...state, lineItems: [...otherItems, ...action.items] };
    }

    case 'ADD_LINE_ITEM':
      return { ...state, lineItems: [...state.lineItems, action.item] };

    case 'REMOVE_LINE_ITEM':
      return {
        ...state,
        lineItems: state.lineItems.filter((i) => i.id !== action.id),
      };

    case 'SET_COSTS':
      return { ...state, costs: action.costs };

    case 'SET_PROJECT_META':
      return { ...state, projectMeta: { ...state.projectMeta, ...action.meta } };

    case 'SET_STATUS':
      return { ...state, analysisStatus: action.status };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.error,
        analysisStatus: action.error ? 'error' : state.analysisStatus,
      };

    case 'ADD_ANALYSIS_MESSAGE':
      return { ...state, analysisMessages: [...state.analysisMessages, action.message] };

    case 'CLEAR_ANALYSIS_MESSAGES':
      return { ...state, analysisMessages: [] };

    case 'SET_PAGE_SCALES':
      return { ...state, pageScales: action.scales };

    case 'SET_SCALE_OVERRIDE':
      return {
        ...state,
        scaleOverrides: { ...state.scaleOverrides, [action.pageNumber]: action.scale },
      };

    case 'SET_PAGE_CLASSIFICATIONS':
      return { ...state, pageClassifications: action.classifications };

    case 'ADD_MEASUREMENT':
      return { ...state, measurements: [...state.measurements, action.measurement] };

    case 'UPDATE_MEASUREMENT':
      return {
        ...state,
        measurements: state.measurements.map((m) =>
          m.id === action.id ? { ...m, ...action.changes } : m
        ),
      };

    case 'REMOVE_MEASUREMENT':
      return { ...state, measurements: state.measurements.filter((m) => m.id !== action.id) };

    case 'SET_ACTIVE_MEASUREMENT_TOOL':
      return { ...state, activeMeasurementTool: action.tool };

    case 'SET_SHEET_MANIFEST':
      return { ...state, sheetManifest: action.manifest };

    case 'SET_CLASSIFYING_SHEETS':
      return { ...state, classifyingSheets: action.classifying };

    case 'SET_CONVERSATION_PHASE':
      return { ...state, conversationPhase: action.phase };

    case 'SET_ACTIVE_TRADE':
      return { ...state, activeTradeId: action.tradeId };

    case 'ADD_ASSUMPTION':
      return { ...state, assumptions: [...state.assumptions, action.assumption] };

    case 'UPDATE_ASSUMPTION':
      return {
        ...state,
        assumptions: state.assumptions.map((a) =>
          a.id === action.id ? { ...a, ...action.changes } : a
        ),
      };

    case 'REMOVE_ASSUMPTION':
      return { ...state, assumptions: state.assumptions.filter((a) => a.id !== action.id) };

    case 'SET_ASSUMPTIONS':
      return { ...state, assumptions: action.assumptions };

    case 'ADD_OPEN_QUESTION':
      return { ...state, openQuestions: [...state.openQuestions, action.question] };

    case 'UPDATE_OPEN_QUESTION':
      return {
        ...state,
        openQuestions: state.openQuestions.map((q) =>
          q.id === action.id ? { ...q, ...action.changes } : q
        ),
      };

    case 'REMOVE_OPEN_QUESTION':
      return { ...state, openQuestions: state.openQuestions.filter((q) => q.id !== action.id) };

    case 'ADD_INCONSISTENCY':
      return { ...state, inconsistencies: [...state.inconsistencies, action.inconsistency] };

    case 'UPDATE_INCONSISTENCY':
      return {
        ...state,
        inconsistencies: state.inconsistencies.map((i) =>
          i.id === action.id ? { ...i, ...action.changes } : i
        ),
      };

    case 'SET_SCOPE_ITEMS':
      return { ...state, scopeItems: action.items };

    case 'REPLACE_TRADE_SCOPE_ITEMS': {
      const others = state.scopeItems.filter((s) => s.tradeId !== action.tradeId);
      return { ...state, scopeItems: [...others, ...action.items] };
    }

    case 'SET_PENDING_AGENT_ACTION':
      return { ...state, pendingAgentAction: action.action };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ProjectStoreContextValue {
  state: ProjectState;
  dispatch: React.Dispatch<ProjectAction>;
  setPdfFile: (file: File) => void;
  setPdfPages: (pages: PdfPage[]) => void;
  setLineItems: (items: SpreadsheetLineItem[]) => void;
  updateLineItem: (id: string, changes: Partial<SpreadsheetLineItem>) => void;
  replaceTradeItems: (trade: string, items: SpreadsheetLineItem[]) => void;
  addLineItem: (item: SpreadsheetLineItem) => void;
  removeLineItem: (id: string) => void;
  setCosts: (costs: Record<string, unknown>) => void;
  setProjectMeta: (meta: Partial<ProjectMeta>) => void;
  setStatus: (status: AnalysisStatus) => void;
  setError: (error: string | null) => void;
  addAnalysisMessage: (message: string) => void;
  setPageScales: (scales: Record<number, ScaleInfo>) => void;
  setScaleOverride: (pageNumber: number, scale: ScaleInfo) => void;
  setPageClassifications: (classifications: { page: number; type: string; description: string }[]) => void;
  addMeasurement: (measurement: Measurement) => void;
  updateMeasurement: (id: string, changes: Partial<Measurement>) => void;
  removeMeasurement: (id: string) => void;
  setActiveMeasurementTool: (tool: ActiveMeasurementTool | null) => void;
  setSheetManifest: (manifest: SheetManifest | null) => void;
  setClassifyingSheets: (classifying: boolean) => void;
  setConversationPhase: (phase: ConversationPhase) => void;
  setActiveTrade: (tradeId: string | null) => void;
  addAssumption: (assumption: Assumption) => void;
  updateAssumption: (id: string, changes: Partial<Assumption>) => void;
  removeAssumption: (id: string) => void;
  setAssumptions: (assumptions: Assumption[]) => void;
  addOpenQuestion: (question: OpenQuestion) => void;
  updateOpenQuestion: (id: string, changes: Partial<OpenQuestion>) => void;
  removeOpenQuestion: (id: string) => void;
  addInconsistency: (inconsistency: Inconsistency) => void;
  updateInconsistency: (id: string, changes: Partial<Inconsistency>) => void;
  setScopeItems: (items: ScopeItem[]) => void;
  replaceTradeScopeItems: (tradeId: string, items: ScopeItem[]) => void;
  setPendingAgentAction: (action: ProjectState['pendingAgentAction']) => void;
}

const ProjectStoreContext = createContext<ProjectStoreContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ProjectStoreProvider({
  children,
  initialMeta,
}: {
  children: React.ReactNode;
  initialMeta?: Partial<ProjectMeta>;
}) {
  const [state, dispatch] = useReducer(projectReducer, {
    ...initialState,
    projectMeta: { ...initialState.projectMeta, ...initialMeta },
  });

  const setPdfFile = useCallback((file: File) => dispatch({ type: 'SET_PDF_FILE', file }), []);
  const setPdfPages = useCallback((pages: PdfPage[]) => dispatch({ type: 'SET_PDF_PAGES', pages }), []);
  const setLineItems = useCallback((items: SpreadsheetLineItem[]) => dispatch({ type: 'SET_LINE_ITEMS', items }), []);
  const updateLineItem = useCallback((id: string, changes: Partial<SpreadsheetLineItem>) => dispatch({ type: 'UPDATE_LINE_ITEM', id, changes }), []);
  const replaceTradeItems = useCallback((trade: string, items: SpreadsheetLineItem[]) => dispatch({ type: 'REPLACE_TRADE_ITEMS', trade, items }), []);
  const addLineItem = useCallback((item: SpreadsheetLineItem) => dispatch({ type: 'ADD_LINE_ITEM', item }), []);
  const removeLineItem = useCallback((id: string) => dispatch({ type: 'REMOVE_LINE_ITEM', id }), []);
  const setCosts = useCallback((costs: Record<string, unknown>) => dispatch({ type: 'SET_COSTS', costs }), []);
  const setProjectMeta = useCallback((meta: Partial<ProjectMeta>) => dispatch({ type: 'SET_PROJECT_META', meta }), []);
  const setStatus = useCallback((status: AnalysisStatus) => dispatch({ type: 'SET_STATUS', status }), []);
  const setError = useCallback((error: string | null) => dispatch({ type: 'SET_ERROR', error }), []);
  const addAnalysisMessage = useCallback((message: string) => dispatch({ type: 'ADD_ANALYSIS_MESSAGE', message }), []);
  const setPageScales = useCallback((scales: Record<number, ScaleInfo>) => dispatch({ type: 'SET_PAGE_SCALES', scales }), []);
  const setScaleOverride = useCallback((pageNumber: number, scale: ScaleInfo) => dispatch({ type: 'SET_SCALE_OVERRIDE', pageNumber, scale }), []);
  const setPageClassifications = useCallback((classifications: { page: number; type: string; description: string }[]) => dispatch({ type: 'SET_PAGE_CLASSIFICATIONS', classifications }), []);
  const addMeasurement = useCallback((measurement: Measurement) => dispatch({ type: 'ADD_MEASUREMENT', measurement }), []);
  const updateMeasurement = useCallback((id: string, changes: Partial<Measurement>) => dispatch({ type: 'UPDATE_MEASUREMENT', id, changes }), []);
  const removeMeasurement = useCallback((id: string) => dispatch({ type: 'REMOVE_MEASUREMENT', id }), []);
  const setActiveMeasurementTool = useCallback((tool: ActiveMeasurementTool | null) => dispatch({ type: 'SET_ACTIVE_MEASUREMENT_TOOL', tool }), []);
  const setSheetManifest = useCallback((manifest: SheetManifest | null) => dispatch({ type: 'SET_SHEET_MANIFEST', manifest }), []);
  const setClassifyingSheets = useCallback((classifying: boolean) => dispatch({ type: 'SET_CLASSIFYING_SHEETS', classifying }), []);
  const setConversationPhase = useCallback((phase: ConversationPhase) => dispatch({ type: 'SET_CONVERSATION_PHASE', phase }), []);
  const setActiveTrade = useCallback((tradeId: string | null) => dispatch({ type: 'SET_ACTIVE_TRADE', tradeId }), []);
  const addAssumption = useCallback((assumption: Assumption) => dispatch({ type: 'ADD_ASSUMPTION', assumption }), []);
  const updateAssumption = useCallback((id: string, changes: Partial<Assumption>) => dispatch({ type: 'UPDATE_ASSUMPTION', id, changes }), []);
  const removeAssumption = useCallback((id: string) => dispatch({ type: 'REMOVE_ASSUMPTION', id }), []);
  const setAssumptions = useCallback((assumptions: Assumption[]) => dispatch({ type: 'SET_ASSUMPTIONS', assumptions }), []);
  const addOpenQuestion = useCallback((question: OpenQuestion) => dispatch({ type: 'ADD_OPEN_QUESTION', question }), []);
  const updateOpenQuestion = useCallback((id: string, changes: Partial<OpenQuestion>) => dispatch({ type: 'UPDATE_OPEN_QUESTION', id, changes }), []);
  const removeOpenQuestion = useCallback((id: string) => dispatch({ type: 'REMOVE_OPEN_QUESTION', id }), []);
  const addInconsistency = useCallback((inconsistency: Inconsistency) => dispatch({ type: 'ADD_INCONSISTENCY', inconsistency }), []);
  const updateInconsistency = useCallback((id: string, changes: Partial<Inconsistency>) => dispatch({ type: 'UPDATE_INCONSISTENCY', id, changes }), []);
  const setScopeItems = useCallback((items: ScopeItem[]) => dispatch({ type: 'SET_SCOPE_ITEMS', items }), []);
  const replaceTradeScopeItems = useCallback((tradeId: string, items: ScopeItem[]) => dispatch({ type: 'REPLACE_TRADE_SCOPE_ITEMS', tradeId, items }), []);
  const setPendingAgentAction = useCallback((action: ProjectState['pendingAgentAction']) => dispatch({ type: 'SET_PENDING_AGENT_ACTION', action }), []);

  return (
    <ProjectStoreContext.Provider
      value={{
        state,
        dispatch,
        setPdfFile,
        setPdfPages,
        setLineItems,
        updateLineItem,
        replaceTradeItems,
        addLineItem,
        removeLineItem,
        setCosts,
        setProjectMeta,
        setStatus,
        setError,
        addAnalysisMessage,
        setPageScales,
        setScaleOverride,
        setPageClassifications,
        addMeasurement,
        updateMeasurement,
        removeMeasurement,
        setActiveMeasurementTool,
        setSheetManifest,
        setClassifyingSheets,
        setConversationPhase,
        setActiveTrade,
        addAssumption,
        updateAssumption,
        removeAssumption,
        setAssumptions,
        addOpenQuestion,
        updateOpenQuestion,
        removeOpenQuestion,
        addInconsistency,
        updateInconsistency,
        setScopeItems,
        replaceTradeScopeItems,
        setPendingAgentAction,
      }}
    >
      {children}
    </ProjectStoreContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProjectStore(): ProjectStoreContextValue {
  const ctx = useContext(ProjectStoreContext);
  if (!ctx) {
    throw new Error('useProjectStore must be used within a ProjectStoreProvider');
  }
  return ctx;
}
