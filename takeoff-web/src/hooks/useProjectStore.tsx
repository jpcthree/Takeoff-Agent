'use client';

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { PdfPage, LineItemDict } from '@/lib/api/python-service';
import type { SpreadsheetLineItem } from '@/lib/types/line-item';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectMeta {
  name: string;
  address: string;
  clientName: string;
  buildingType: string;
}

export type AnalysisStatus =
  | 'idle'
  | 'uploading'
  | 'converting'
  | 'analyzing'
  | 'calculating'
  | 'ready'
  | 'error';

export interface ProjectState {
  /** Uploaded PDF file */
  pdfFile: File | null;
  /** Converted page images from the Python service */
  pdfPages: PdfPage[];
  /** Extracted building model from Claude vision analysis */
  buildingModel: Record<string, unknown> | null;
  /** Calculated line items (frontend representation) */
  lineItems: SpreadsheetLineItem[];
  /** Raw line items from Python API (for export) */
  rawLineItems: LineItemDict[];
  /** Cost database */
  costs: Record<string, unknown> | null;
  /** Project metadata */
  projectMeta: ProjectMeta;
  /** Pipeline status */
  analysisStatus: AnalysisStatus;
  /** Error message */
  error: string | null;
  /** Analysis progress messages */
  analysisMessages: string[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type ProjectAction =
  | { type: 'SET_PDF_FILE'; file: File }
  | { type: 'SET_PDF_PAGES'; pages: PdfPage[] }
  | { type: 'SET_BUILDING_MODEL'; model: Record<string, unknown> }
  | { type: 'UPDATE_BUILDING_MODEL'; changes: Record<string, unknown> }
  | { type: 'SET_LINE_ITEMS'; items: SpreadsheetLineItem[]; raw: LineItemDict[] }
  | { type: 'UPDATE_LINE_ITEM'; id: string; changes: Partial<SpreadsheetLineItem> }
  | { type: 'REPLACE_TRADE_ITEMS'; trade: string; items: SpreadsheetLineItem[]; raw: LineItemDict[] }
  | { type: 'ADD_LINE_ITEM'; item: SpreadsheetLineItem; raw?: LineItemDict }
  | { type: 'REMOVE_LINE_ITEM'; id: string }
  | { type: 'SET_COSTS'; costs: Record<string, unknown> }
  | { type: 'SET_PROJECT_META'; meta: Partial<ProjectMeta> }
  | { type: 'SET_STATUS'; status: AnalysisStatus }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'ADD_ANALYSIS_MESSAGE'; message: string }
  | { type: 'CLEAR_ANALYSIS_MESSAGES' }
  | { type: 'RESET' };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: ProjectState = {
  pdfFile: null,
  pdfPages: [],
  buildingModel: null,
  lineItems: [],
  rawLineItems: [],
  costs: null,
  projectMeta: { name: '', address: '', clientName: '', buildingType: 'residential' },
  analysisStatus: 'idle',
  error: null,
  analysisMessages: [],
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

    case 'SET_BUILDING_MODEL':
      return { ...state, buildingModel: action.model };

    case 'UPDATE_BUILDING_MODEL':
      return {
        ...state,
        buildingModel: state.buildingModel
          ? { ...state.buildingModel, ...action.changes }
          : action.changes,
      };

    case 'SET_LINE_ITEMS':
      return { ...state, lineItems: action.items, rawLineItems: action.raw };

    case 'UPDATE_LINE_ITEM':
      return {
        ...state,
        lineItems: state.lineItems.map((item) =>
          item.id === action.id ? { ...item, ...action.changes } : item
        ),
      };

    case 'REPLACE_TRADE_ITEMS': {
      const otherItems = state.lineItems.filter((i) => i.trade !== action.trade);
      const otherRaw = state.rawLineItems.filter((i) => i.trade !== action.trade);
      return {
        ...state,
        lineItems: [...otherItems, ...action.items],
        rawLineItems: [...otherRaw, ...action.raw],
      };
    }

    case 'ADD_LINE_ITEM':
      return {
        ...state,
        lineItems: [...state.lineItems, action.item],
        rawLineItems: action.raw
          ? [...state.rawLineItems, action.raw]
          : state.rawLineItems,
      };

    case 'REMOVE_LINE_ITEM':
      return {
        ...state,
        lineItems: state.lineItems.filter((i) => i.id !== action.id),
      };

    case 'SET_COSTS':
      return { ...state, costs: action.costs };

    case 'SET_PROJECT_META':
      return {
        ...state,
        projectMeta: { ...state.projectMeta, ...action.meta },
      };

    case 'SET_STATUS':
      return { ...state, analysisStatus: action.status };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.error,
        analysisStatus: action.error ? 'error' : state.analysisStatus,
      };

    case 'ADD_ANALYSIS_MESSAGE':
      return {
        ...state,
        analysisMessages: [...state.analysisMessages, action.message],
      };

    case 'CLEAR_ANALYSIS_MESSAGES':
      return { ...state, analysisMessages: [] };

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
  // Convenience helpers
  setPdfFile: (file: File) => void;
  setPdfPages: (pages: PdfPage[]) => void;
  setBuildingModel: (model: Record<string, unknown>) => void;
  updateBuildingModel: (changes: Record<string, unknown>) => void;
  setLineItems: (items: SpreadsheetLineItem[], raw: LineItemDict[]) => void;
  updateLineItem: (id: string, changes: Partial<SpreadsheetLineItem>) => void;
  replaceTradeItems: (trade: string, items: SpreadsheetLineItem[], raw: LineItemDict[]) => void;
  addLineItem: (item: SpreadsheetLineItem, raw?: LineItemDict) => void;
  removeLineItem: (id: string) => void;
  setCosts: (costs: Record<string, unknown>) => void;
  setProjectMeta: (meta: Partial<ProjectMeta>) => void;
  setStatus: (status: AnalysisStatus) => void;
  setError: (error: string | null) => void;
  addAnalysisMessage: (message: string) => void;
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
  const setBuildingModel = useCallback((model: Record<string, unknown>) => dispatch({ type: 'SET_BUILDING_MODEL', model }), []);
  const updateBuildingModel = useCallback((changes: Record<string, unknown>) => dispatch({ type: 'UPDATE_BUILDING_MODEL', changes }), []);
  const setLineItems = useCallback((items: SpreadsheetLineItem[], raw: LineItemDict[]) => dispatch({ type: 'SET_LINE_ITEMS', items, raw }), []);
  const updateLineItem = useCallback((id: string, changes: Partial<SpreadsheetLineItem>) => dispatch({ type: 'UPDATE_LINE_ITEM', id, changes }), []);
  const replaceTradeItems = useCallback((trade: string, items: SpreadsheetLineItem[], raw: LineItemDict[]) => dispatch({ type: 'REPLACE_TRADE_ITEMS', trade, items, raw }), []);
  const addLineItem = useCallback((item: SpreadsheetLineItem, raw?: LineItemDict) => dispatch({ type: 'ADD_LINE_ITEM', item, raw }), []);
  const removeLineItem = useCallback((id: string) => dispatch({ type: 'REMOVE_LINE_ITEM', id }), []);
  const setCosts = useCallback((costs: Record<string, unknown>) => dispatch({ type: 'SET_COSTS', costs }), []);
  const setProjectMeta = useCallback((meta: Partial<ProjectMeta>) => dispatch({ type: 'SET_PROJECT_META', meta }), []);
  const setStatus = useCallback((status: AnalysisStatus) => dispatch({ type: 'SET_STATUS', status }), []);
  const setError = useCallback((error: string | null) => dispatch({ type: 'SET_ERROR', error }), []);
  const addAnalysisMessage = useCallback((message: string) => dispatch({ type: 'ADD_ANALYSIS_MESSAGE', message }), []);

  return (
    <ProjectStoreContext.Provider
      value={{
        state,
        dispatch,
        setPdfFile,
        setPdfPages,
        setBuildingModel,
        updateBuildingModel,
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
