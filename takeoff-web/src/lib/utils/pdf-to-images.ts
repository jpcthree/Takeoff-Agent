/**
 * Client-side PDF → PNG conversion using pdf.js.
 * No server round-trip needed — renders each page to a canvas
 * and exports as base64 PNG.
 */

import type { PdfPage } from '@/lib/api/python-service';

// Dynamic import to avoid SSR issues
async function getPdfLib() {
  const pdfjs = await import('pdfjs-dist');
  // Set worker source
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  return pdfjs;
}

export interface PdfConvertResult {
  filename: string;
  total_pages: number;
  dpi: number;
  pages: PdfPage[];
}

/**
 * Render a single PDF page to a canvas and return base64 data.
 */
async function renderPage(
  pdf: { getPage: (n: number) => Promise<unknown> },
  pageNum: number,
  scale: number,
  format: 'image/png' | 'image/jpeg' = 'image/png',
  quality: number = 0.85
): Promise<{ data: string; mime_type: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await pdf.getPage(pageNum) as any;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;

  const dataUrl = canvas.toDataURL(format, quality);
  const base64 = dataUrl.split(',')[1];

  // Clean up
  canvas.width = 0;
  canvas.height = 0;

  return { data: base64, mime_type: format };
}

/**
 * Convert a PDF File to an array of base64 page images.
 * Runs entirely in the browser — no API call needed.
 *
 * Produces two versions of each page:
 * - High-res PNG for display (at requested DPI)
 * - Compressed JPEG for API analysis (at lower DPI, ~200KB-500KB per page)
 */
export async function convertPdfClientSide(
  file: File,
  dpi: number = 150
): Promise<PdfConvertResult> {
  const pdfjs = await getPdfLib();

  const arrayBuffer = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf = await (pdfjs as any).getDocument({ data: arrayBuffer }).promise;
  const scale = dpi / 72; // PDF default is 72 DPI

  const pages: PdfPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const { data, mime_type } = await renderPage(pdf, i, scale);

    pages.push({
      page_number: i,
      data,
      mime_type,
      filename: `${file.name}_page_${i}.png`,
    });
  }

  return {
    filename: file.name,
    total_pages: pdf.numPages,
    dpi,
    pages,
  };
}

/**
 * Create compressed JPEG versions of pages for API analysis.
 * Uses lower DPI and JPEG compression to keep payload under Vercel's 4.5MB limit.
 * Claude vision works well with JPEG at moderate resolution.
 */
export async function createAnalysisPages(
  file: File,
  maxDpi: number = 100
): Promise<PdfPage[]> {
  const pdfjs = await getPdfLib();
  const arrayBuffer = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf = await (pdfjs as any).getDocument({ data: arrayBuffer }).promise;
  const scale = maxDpi / 72;

  const pages: PdfPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const { data, mime_type } = await renderPage(pdf, i, scale, 'image/jpeg', 0.75);

    pages.push({
      page_number: i,
      data,
      mime_type,
      filename: `${file.name}_page_${i}.jpg`,
    });
  }

  return pages;
}

/**
 * Create tiny JPEG thumbnails for visual layout context.
 * Used alongside extracted text to give Claude spatial reference.
 * ~50-100KB each at 50 DPI, quality 0.5.
 */
export async function createThumbnails(
  file: File,
  dpi: number = 50,
  quality: number = 0.5
): Promise<PdfPage[]> {
  return createAnalysisPages(file, dpi);
}

/**
 * Create a single-page vision image for scanned/raster PDFs (no text layer).
 * 100 DPI JPEG, one page only — stays well under API limits.
 */
export async function createVisionPage(
  file: File,
  pageNumber: number,
  dpi: number = 100,
  quality: number = 0.75
): Promise<PdfPage> {
  const pdfjs = await getPdfLib();
  const arrayBuffer = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf = await (pdfjs as any).getDocument({ data: arrayBuffer }).promise;
  const scale = dpi / 72;

  const { data, mime_type } = await renderPage(pdf, pageNumber, scale, 'image/jpeg', quality);

  return {
    page_number: pageNumber,
    data,
    mime_type,
    filename: `${file.name}_page_${pageNumber}.jpg`,
  };
}
