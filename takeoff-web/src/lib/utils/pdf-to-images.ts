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
 * Convert a PDF File to an array of base64 PNG page images.
 * Runs entirely in the browser — no API call needed.
 */
export async function convertPdfClientSide(
  file: File,
  dpi: number = 150
): Promise<PdfConvertResult> {
  const pdfjs = await getPdfLib();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const scale = dpi / 72; // PDF default is 72 DPI

  const pages: PdfPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d')!;
    // pdfjs-dist v4+ requires `canvas` in RenderParameters
    await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;

    // Get base64 PNG (strip the data:image/png;base64, prefix)
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];

    pages.push({
      page_number: i,
      data: base64,
      mime_type: 'image/png',
      filename: `${file.name}_page_${i}.png`,
    });

    // Clean up
    canvas.width = 0;
    canvas.height = 0;
  }

  return {
    filename: file.name,
    total_pages: pdf.numPages,
    dpi,
    pages,
  };
}
