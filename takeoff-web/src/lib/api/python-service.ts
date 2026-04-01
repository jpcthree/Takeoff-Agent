/**
 * Typed client for the Python service — all calls go through
 * Next.js API routes (server-side proxies) to avoid CORS and
 * keep the Python API URL private.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LineItemDict {
  trade: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  material_unit_cost: number;
  material_total: number;
  labor_hours: number;
  labor_rate: number;
  labor_total: number;
  line_total: number;
  code_requirement?: string;
  sheets?: number;
}

// ---------------------------------------------------------------------------
// Address Estimate Types
// ---------------------------------------------------------------------------

export interface NoteSection {
  title: string;
  lines: string[];
}

export interface PropertyInfo {
  address: string;
  lat: number;
  lng: number;
  year_built: number | null;
  total_sqft: number | null;
  stories: number;
  bedrooms: number;
  bathrooms: number;
  basement: string;
  basement_sqft: number;
  foundation_type: string;
  lot_sqft: number;
  roof_type: string;
  roof_material: string;
  last_sale_date: string;
  last_sale_price: number;
  roof_pitch_deg: number;
  roof_segments_count: number;
  roof_area_sqft: number;
  total_value: number;
  land_value: number;
  improvement_value: number;
  estimated_value: number;
  sources: Record<string, string>;
  warnings: string[];
}

export interface EstimateFromAddressResponse {
  line_items: LineItemDict[];
  property_data: PropertyInfo;
  notes: NoteSection[];
  insulation_notes: NoteSection[];
  assumptions: string[];
  images: Record<string, string | null>;
  roof_classification: Record<string, string>;
}

export interface CalculateAllResponse {
  items: LineItemDict[];
  count: number;
  trades: string[];
  failedTrades?: string[];
}

export interface CalculateTradeResponse {
  trade: string;
  items: LineItemDict[];
  count: number;
}

export interface PdfPage {
  page_number: number;
  data: string; // base64
  mime_type: string;
  filename: string;
}

export interface PdfConvertResponse {
  filename: string;
  total_pages: number;
  dpi: number;
  pages: PdfPage[];
}

// ---------------------------------------------------------------------------
// PDF Conversion — via /api/pdf/convert proxy
// ---------------------------------------------------------------------------

export async function convertPdf(
  file: File,
  dpi: number = 150,
  signal?: AbortSignal
): Promise<PdfConvertResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('dpi', String(dpi));

  const res = await fetch('/api/pdf/convert', {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `PDF conversion failed: ${res.status}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Calculators — via /api/calculate proxy
// ---------------------------------------------------------------------------

export async function calculateAll(
  buildingModel: Record<string, unknown>,
  costs?: Record<string, unknown>,
  signal?: AbortSignal
): Promise<CalculateAllResponse> {
  const res = await fetch('/api/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ building_model: buildingModel, costs: costs || null }),
    signal,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `Calculation failed: ${res.status}`);
  }

  return res.json();
}

export async function calculateTrade(
  trade: string,
  buildingModel: Record<string, unknown>,
  costs?: Record<string, unknown>,
  signal?: AbortSignal
): Promise<CalculateTradeResponse> {
  const res = await fetch('/api/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ building_model: buildingModel, costs: costs || null, trade }),
    signal,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `Calculation failed: ${res.status}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Export — via /api/export proxy
// ---------------------------------------------------------------------------

export async function exportXlsx(
  lineItems: LineItemDict[],
  projectName: string = '',
  projectAddress: string = '',
  signal?: AbortSignal,
  options?: {
    notes?: NoteSection[];
    insulation_notes?: NoteSection[];
    images?: Record<string, string | null>;
    building_model?: Record<string, unknown>;
    code_notes?: Record<string, NoteSection[]>;
  }
): Promise<void> {
  const res = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      line_items: lineItems,
      project_name: projectName,
      project_address: projectAddress,
      ...(options?.notes && { notes: options.notes }),
      ...(options?.insulation_notes && { insulation_notes: options.insulation_notes }),
      ...(options?.images && { images: options.images }),
      ...(options?.building_model && { building_model: options.building_model }),
      ...(options?.code_notes && { code_notes: options.code_notes }),
    }),
    signal,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `Export failed: ${res.status}`);
  }

  // Download the file
  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${projectName || 'Estimate'}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

// ---------------------------------------------------------------------------
// Costs — via /api/costs (already exists as Next.js route)
// ---------------------------------------------------------------------------

export async function getDefaultCosts(): Promise<Record<string, unknown>> {
  const res = await fetch('/api/costs');
  if (!res.ok) {
    throw new Error('Failed to load default costs');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Available Trades
// ---------------------------------------------------------------------------

/** Trades available for takeoff selection. */
export const AVAILABLE_TRADES = [
  { id: 'insulation', label: 'Insulation' },
  { id: 'drywall', label: 'Drywall' },
  { id: 'roofing', label: 'Roofing' },
  { id: 'gutters', label: 'Gutters & Downspouts' },
] as const;

/**
 * Maps frontend trade IDs to the Python API endpoint that produces them.
 * Most trades map 1:1, but gutters are produced by the roofing endpoint.
 */
const TRADE_TO_API_ENDPOINT: Record<string, string> = {
  gutters: 'roofing',
};

export type TradeId = (typeof AVAILABLE_TRADES)[number]['id'];

export function getTradeLabel(tradeId: string): string {
  const trade = AVAILABLE_TRADES.find((t) => t.id === tradeId);
  return trade?.label ?? tradeId;
}

export async function listTrades(): Promise<{ trades: string[] }> {
  return {
    trades: AVAILABLE_TRADES.map((t) => t.id),
  };
}

// ---------------------------------------------------------------------------
// Address Estimate — via /api/estimate proxy
// ---------------------------------------------------------------------------

export async function estimateFromAddress(
  address: string,
  climateZone: string = '5B',
  signal?: AbortSignal
): Promise<EstimateFromAddressResponse> {
  const res = await fetch('/api/estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, climate_zone: climateZone }),
    signal,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `Estimate failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Run calculators for a specific set of trades.
 *
 * Handles bundled endpoints: e.g. "gutters" and "roofing" both come from the
 * Python `/calculate/roofing` endpoint. If either (or both) is selected we
 * call the endpoint once and filter the returned items to only the requested
 * trade(s).
 */
export async function calculateSelectedTrades(
  trades: string[],
  buildingModel: Record<string, unknown>,
  costs?: Record<string, unknown>,
  signal?: AbortSignal,
  onTradeComplete?: (trade: string, index: number, total: number) => void
): Promise<CalculateAllResponse> {
  const allItems: LineItemDict[] = [];
  const completedTrades: string[] = [];

  // Group selected trades by the API endpoint that produces them.
  // Most map 1:1 (framing→framing), but gutters→roofing.
  const endpointToTrades = new Map<string, string[]>();
  for (const trade of trades) {
    const endpoint = TRADE_TO_API_ENDPOINT[trade] ?? trade;
    const existing = endpointToTrades.get(endpoint) ?? [];
    existing.push(trade);
    endpointToTrades.set(endpoint, existing);
  }

  const endpoints = Array.from(endpointToTrades.entries());
  let progress = 0;

  const failedTrades: string[] = [];

  for (const [endpoint, wantedTrades] of endpoints) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      const result = await calculateTrade(endpoint, buildingModel, costs, signal);

      // Filter items to only the trades the user actually selected.
      const wantedSet = new Set(wantedTrades);
      const filtered = result.items.filter((item) => wantedSet.has(item.trade));
      allItems.push(...filtered);
      completedTrades.push(...wantedTrades);
    } catch (err) {
      // Abort errors should still propagate (user cancelled)
      if (err instanceof DOMException && err.name === 'AbortError') throw err;

      // Log but continue with remaining trades
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Calculator failed for ${endpoint} (trades: ${wantedTrades.join(', ')}): ${msg}`);
      failedTrades.push(...wantedTrades);
    }

    // Report progress for each wanted trade from this endpoint.
    for (const t of wantedTrades) {
      progress++;
      onTradeComplete?.(t, progress, trades.length);
    }
  }

  if (failedTrades.length > 0) {
    console.warn(`Trades that failed: ${failedTrades.join(', ')}. ${completedTrades.length} trades succeeded.`);
  }

  return {
    items: allItems,
    count: allItems.length,
    trades: completedTrades,
    failedTrades: failedTrades.length > 0 ? failedTrades : undefined,
  };
}
