'use client';

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { PdfPage, LineItemDict, NoteSection, PropertyInfo } from '@/lib/api/python-service';
import type { SpreadsheetLineItem } from '@/lib/types/line-item';
import type { Measurement, ActiveMeasurementTool } from '@/lib/types/measurement';
import type { DetectedMeasurement } from '@/lib/types/detected-measurement';
import type { PageMeasurements } from '@/lib/utils/vector-measurement';
import type { ScaleInfo } from '@/lib/utils/scale-detection';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectMeta {
  /** Supabase project ID (if persisted) */
  id?: string;
  name: string;
  address: string;
  clientName: string;
  buildingType: string;
  /** Which trades to run takeoffs for. Empty = all available. */
  selectedTrades: string[];
}

export type AnalysisStatus =
  | 'idle'
  | 'uploading'
  | 'converting'
  | 'analyzing'
  | 'reviewing'
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

  // ── Address-based estimate fields ──
  /** Whether this project uses plans or address-based estimation */
  projectType: 'plans' | 'address';
  /** Property data from address lookup */
  propertyData: PropertyInfo | null;
  /** Base64-encoded property images */
  propertyImages: Record<string, string | null>;
  /** Notes for property sheet */
  propertyNotes: NoteSection[];
  /** Notes for insulation sheet (includes code requirements) */
  insulationNotes: NoteSection[];
  /** Heuristic assumptions made during model generation */
  assumptions: string[];
  /** Roof material classification from Claude Vision */
  roofClassification: Record<string, string>;

  // ── Measurement tool fields ──
  /** User-created manual measurements from blueprint pages */
  measurements: Measurement[];
  /** Detected scale per page number */
  pageScales: Record<number, ScaleInfo>;
  /** User-overridden scales per page (takes priority over detected) */
  scaleOverrides: Record<number, ScaleInfo>;
  /** Page classifications from analysis (type + description for thumbnails) */
  pageClassifications: { page: number; type: string; description: string }[];
  /** Currently active measurement tool configuration (null = tool inactive) */
  activeMeasurementTool: ActiveMeasurementTool | null;

  // ── Measurement review fields ──
  /** Auto-detected measurements from BuildingModel cross-referenced with vector data */
  detectedMeasurements: DetectedMeasurement[];
  /** Whether the user has completed reviewing detected measurements */
  measurementReviewComplete: boolean;
  /** Raw page measurements from Phase 3 vector measurement (preserved for review logic) */
  rawPageMeasurements: PageMeasurements[];
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
  | { type: 'SET_PROJECT_TYPE'; projectType: 'plans' | 'address' }
  | { type: 'SET_ESTIMATE_DATA'; propertyData: PropertyInfo; propertyImages: Record<string, string | null>; propertyNotes: NoteSection[]; insulationNotes: NoteSection[]; assumptions: string[]; roofClassification: Record<string, string> }
  | { type: 'SET_PAGE_SCALES'; scales: Record<number, ScaleInfo> }
  | { type: 'SET_SCALE_OVERRIDE'; pageNumber: number; scale: ScaleInfo }
  | { type: 'SET_PAGE_CLASSIFICATIONS'; classifications: { page: number; type: string; description: string }[] }
  | { type: 'ADD_MEASUREMENT'; measurement: Measurement }
  | { type: 'UPDATE_MEASUREMENT'; id: string; changes: Partial<Measurement> }
  | { type: 'REMOVE_MEASUREMENT'; id: string }
  | { type: 'SET_ACTIVE_MEASUREMENT_TOOL'; tool: ActiveMeasurementTool | null }
  | { type: 'SET_DETECTED_MEASUREMENTS'; measurements: DetectedMeasurement[] }
  | { type: 'UPDATE_DETECTED_MEASUREMENT'; id: string; changes: Partial<DetectedMeasurement> }
  | { type: 'SET_MEASUREMENT_REVIEW_COMPLETE'; complete: boolean }
  | { type: 'SET_RAW_PAGE_MEASUREMENTS'; measurements: PageMeasurements[] }
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
  projectMeta: { name: '', address: '', clientName: '', buildingType: 'residential', selectedTrades: [] },
  analysisStatus: 'idle',
  error: null,
  analysisMessages: [],
  projectType: 'plans',
  propertyData: null,
  propertyImages: {},
  propertyNotes: [],
  insulationNotes: [],
  assumptions: [],
  roofClassification: {},
  measurements: [],
  pageScales: {},
  scaleOverrides: {},
  pageClassifications: [],
  activeMeasurementTool: null,
  detectedMeasurements: [],
  measurementReviewComplete: false,
  rawPageMeasurements: [],
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

    case 'SET_PROJECT_TYPE':
      return { ...state, projectType: action.projectType };

    case 'SET_ESTIMATE_DATA':
      return {
        ...state,
        propertyData: action.propertyData,
        propertyImages: action.propertyImages,
        propertyNotes: action.propertyNotes,
        insulationNotes: action.insulationNotes,
        assumptions: action.assumptions,
        roofClassification: action.roofClassification,
      };

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
      return {
        ...state,
        measurements: state.measurements.filter((m) => m.id !== action.id),
      };

    case 'SET_ACTIVE_MEASUREMENT_TOOL':
      return { ...state, activeMeasurementTool: action.tool };

    case 'SET_DETECTED_MEASUREMENTS':
      return { ...state, detectedMeasurements: action.measurements };

    case 'UPDATE_DETECTED_MEASUREMENT':
      return {
        ...state,
        detectedMeasurements: state.detectedMeasurements.map((m) =>
          m.id === action.id ? { ...m, ...action.changes } : m
        ),
      };

    case 'SET_MEASUREMENT_REVIEW_COMPLETE':
      return { ...state, measurementReviewComplete: action.complete };

    case 'SET_RAW_PAGE_MEASUREMENTS':
      return { ...state, rawPageMeasurements: action.measurements };

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
  setProjectType: (projectType: 'plans' | 'address') => void;
  setEstimateData: (data: {
    propertyData: PropertyInfo;
    propertyImages: Record<string, string | null>;
    propertyNotes: NoteSection[];
    insulationNotes: NoteSection[];
    assumptions: string[];
    roofClassification: Record<string, string>;
  }) => void;
  setPageScales: (scales: Record<number, ScaleInfo>) => void;
  setScaleOverride: (pageNumber: number, scale: ScaleInfo) => void;
  setPageClassifications: (classifications: { page: number; type: string; description: string }[]) => void;
  addMeasurement: (measurement: Measurement) => void;
  updateMeasurement: (id: string, changes: Partial<Measurement>) => void;
  removeMeasurement: (id: string) => void;
  setActiveMeasurementTool: (tool: ActiveMeasurementTool | null) => void;
  setDetectedMeasurements: (measurements: DetectedMeasurement[]) => void;
  updateDetectedMeasurement: (id: string, changes: Partial<DetectedMeasurement>) => void;
  setMeasurementReviewComplete: (complete: boolean) => void;
  setRawPageMeasurements: (measurements: PageMeasurements[]) => void;
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
  const setProjectType = useCallback((projectType: 'plans' | 'address') => dispatch({ type: 'SET_PROJECT_TYPE', projectType }), []);
  const setEstimateData = useCallback((data: {
    propertyData: PropertyInfo;
    propertyImages: Record<string, string | null>;
    propertyNotes: NoteSection[];
    insulationNotes: NoteSection[];
    assumptions: string[];
    roofClassification: Record<string, string>;
  }) => dispatch({ type: 'SET_ESTIMATE_DATA', ...data }), []);
  const setPageScales = useCallback((scales: Record<number, ScaleInfo>) => dispatch({ type: 'SET_PAGE_SCALES', scales }), []);
  const setScaleOverride = useCallback((pageNumber: number, scale: ScaleInfo) => dispatch({ type: 'SET_SCALE_OVERRIDE', pageNumber, scale }), []);
  const setPageClassifications = useCallback((classifications: { page: number; type: string; description: string }[]) => dispatch({ type: 'SET_PAGE_CLASSIFICATIONS', classifications }), []);
  const addMeasurement = useCallback((measurement: Measurement) => dispatch({ type: 'ADD_MEASUREMENT', measurement }), []);
  const updateMeasurement = useCallback((id: string, changes: Partial<Measurement>) => dispatch({ type: 'UPDATE_MEASUREMENT', id, changes }), []);
  const removeMeasurement = useCallback((id: string) => dispatch({ type: 'REMOVE_MEASUREMENT', id }), []);
  const setActiveMeasurementTool = useCallback((tool: ActiveMeasurementTool | null) => dispatch({ type: 'SET_ACTIVE_MEASUREMENT_TOOL', tool }), []);
  const setDetectedMeasurements = useCallback((measurements: DetectedMeasurement[]) => dispatch({ type: 'SET_DETECTED_MEASUREMENTS', measurements }), []);
  const updateDetectedMeasurement = useCallback((id: string, changes: Partial<DetectedMeasurement>) => dispatch({ type: 'UPDATE_DETECTED_MEASUREMENT', id, changes }), []);
  const setMeasurementReviewComplete = useCallback((complete: boolean) => dispatch({ type: 'SET_MEASUREMENT_REVIEW_COMPLETE', complete }), []);
  const setRawPageMeasurements = useCallback((measurements: PageMeasurements[]) => dispatch({ type: 'SET_RAW_PAGE_MEASUREMENTS', measurements }), []);

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
        setProjectType,
        setEstimateData,
        setPageScales,
        setScaleOverride,
        setPageClassifications,
        addMeasurement,
        updateMeasurement,
        removeMeasurement,
        setActiveMeasurementTool,
        setDetectedMeasurements,
        updateDetectedMeasurement,
        setMeasurementReviewComplete,
        setRawPageMeasurements,
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
