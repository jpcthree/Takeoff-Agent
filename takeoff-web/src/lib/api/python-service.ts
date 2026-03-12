/**
 * Typed client for the FastAPI Python service.
 */

const PYTHON_API_URL = process.env.NEXT_PUBLIC_PYTHON_API_URL || process.env.PYTHON_API_URL || 'http://localhost:8000';

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
}

export interface CalculateAllResponse {
  items: LineItemDict[];
  count: number;
  trades: string[];
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
// API Client
// ---------------------------------------------------------------------------

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${PYTHON_API_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }

  return res.json();
}

/**
 * Run all 9 trade calculators against a building model.
 */
export async function calculateAll(
  buildingModel: Record<string, unknown>,
  costs?: Record<string, unknown>
): Promise<CalculateAllResponse> {
  return apiRequest<CalculateAllResponse>('/calculate/all', {
    method: 'POST',
    body: JSON.stringify({
      building_model: buildingModel,
      costs: costs || null,
    }),
  });
}

/**
 * Run a single trade calculator.
 */
export async function calculateTrade(
  trade: string,
  buildingModel: Record<string, unknown>,
  costs?: Record<string, unknown>
): Promise<CalculateTradeResponse> {
  return apiRequest<CalculateTradeResponse>(`/calculate/${trade}`, {
    method: 'POST',
    body: JSON.stringify({
      building_model: buildingModel,
      costs: costs || null,
    }),
  });
}

/**
 * Convert a PDF file to page images.
 */
export async function convertPdf(file: File, dpi: number = 300): Promise<PdfConvertResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const url = `${PYTHON_API_URL}/pdf/convert?dpi=${dpi}`;
  const res = await fetch(url, {
    method: 'POST',
    body: formData,
    // Don't set Content-Type header — let browser set multipart boundary
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `PDF conversion failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Export line items to an .xlsx file and trigger browser download.
 */
export async function exportXlsx(
  lineItems: LineItemDict[],
  projectName: string = '',
  projectAddress: string = ''
): Promise<void> {
  const url = `${PYTHON_API_URL}/export/xlsx`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      line_items: lineItems,
      project_name: projectName,
      project_address: projectAddress,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Export failed: ${res.status}`);
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

/**
 * Get the default cost database.
 */
export async function getDefaultCosts(): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>('/costs/default');
}

/**
 * List available trade calculators.
 */
export async function listTrades(): Promise<{ trades: string[] }> {
  return apiRequest<{ trades: string[] }>('/calculate/trades');
}
