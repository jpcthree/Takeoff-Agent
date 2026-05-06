/**
 * Browser-side OCR using tesseract.js.
 *
 * Tesseract.js is heavy (multi-MB WASM + language model). It's loaded via
 * dynamic import the first time OCR is needed, then cached for subsequent
 * calls. The worker is also reused across calls.
 *
 * Two entry points:
 *   - runOcrOnPage(pageImage)       — OCR the entire page
 *   - runOcrOnRegion(pageImage, r)  — crop to a region first, then OCR
 *
 * Region cropping happens via canvas; the cropped image is passed directly
 * to tesseract (no intermediate base64 round-trip).
 */

import { findDimensions, type ParsedDimension } from './dimension-parser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OcrPageInput {
  /** base64-encoded page image (no data: prefix) */
  data: string;
  /** mime type, e.g. "image/png" */
  mime_type: string;
}

export interface OcrRegion {
  /** image-pixel coordinates */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrResult {
  /** Raw extracted text from the OCR engine */
  rawText: string;
  /** Tesseract's reported confidence (0-100) */
  confidence: number;
  /** Parsed dimensions found in the text */
  dimensions: ParsedDimension[];
  /** Time the OCR took in milliseconds */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Tesseract worker (cached across calls)
// ---------------------------------------------------------------------------

interface TesseractRecognizeData {
  text: string;
  confidence: number;
}

interface TesseractWorker {
  recognize: (image: HTMLCanvasElement | string) => Promise<{ data: TesseractRecognizeData }>;
  terminate: () => Promise<void>;
}

let workerPromise: Promise<TesseractWorker> | null = null;

async function getWorker(): Promise<TesseractWorker> {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const tesseract = await import('tesseract.js');
    // English-only model; adequate for residential plans, lower payload than 'eng+...'.
    const w = await tesseract.createWorker('eng');
    return w as unknown as TesseractWorker;
  })();
  return workerPromise;
}

/**
 * Tear down the cached worker. Call when you want to free memory (e.g.,
 * after a session of heavy use). Safe to call when no worker exists.
 */
export async function disposeOcr(): Promise<void> {
  if (!workerPromise) return;
  try {
    const w = await workerPromise;
    await w.terminate();
  } catch {
    // ignore
  }
  workerPromise = null;
}

// ---------------------------------------------------------------------------
// Image loading + cropping
// ---------------------------------------------------------------------------

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load page image'));
    img.src = dataUrl;
  });
}

function pageToDataUrl(page: OcrPageInput): string {
  return `data:${page.mime_type};base64,${page.data}`;
}

/** Render the full image to a canvas and return it. */
async function pageToCanvas(page: OcrPageInput): Promise<HTMLCanvasElement> {
  const img = await loadImage(pageToDataUrl(page));
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/** Crop the image to the requested region; clip to image bounds. */
async function cropToRegion(
  page: OcrPageInput,
  region: OcrRegion
): Promise<HTMLCanvasElement> {
  const img = await loadImage(pageToDataUrl(page));
  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const w = Math.min(img.naturalWidth - x, Math.ceil(region.width));
  const h = Math.min(img.naturalHeight - y, Math.ceil(region.height));
  if (w <= 0 || h <= 0) throw new Error(`Region out of bounds: ${JSON.stringify(region)}`);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return canvas;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function recognize(canvas: HTMLCanvasElement): Promise<OcrResult> {
  const start = performance.now();
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  const rawText = data.text ?? '';
  const dimensions = findDimensions(rawText);
  return {
    rawText,
    confidence: data.confidence ?? 0,
    dimensions,
    durationMs: Math.round(performance.now() - start),
  };
}

export async function runOcrOnPage(page: OcrPageInput): Promise<OcrResult> {
  const canvas = await pageToCanvas(page);
  return recognize(canvas);
}

export async function runOcrOnRegion(
  page: OcrPageInput,
  region: OcrRegion
): Promise<OcrResult> {
  const canvas = await cropToRegion(page, region);
  return recognize(canvas);
}
