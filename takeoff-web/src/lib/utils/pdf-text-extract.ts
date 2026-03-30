/**
 * PDF text extraction with spatial layout reconstruction.
 * Uses pdf.js getTextContent() to pull text from the PDF text layer,
 * then reconstructs spatial positioning from transform matrices.
 *
 * Construction blueprints from CAD software typically have selectable text
 * for dimensions, room labels, notes, and specifications.
 */

export interface ExtractedTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
}

export interface ExtractedPageText {
  pageNumber: number;
  hasTextLayer: boolean;
  textItemCount: number;
  rawText: string;
  spatialText: string;
  pageWidth: number;
  pageHeight: number;
  textItems: ExtractedTextItem[];
}

// Minimum number of meaningful text items to consider a page as having a text layer
const TEXT_LAYER_THRESHOLD = 10;
// Y-tolerance for grouping text items into the same "line" (in PDF units)
const LINE_Y_TOLERANCE = 5;

/**
 * Extract text content from a single PDF page using pdf.js.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extractPageText(page: any, pageNumber: number): Promise<ExtractedPageText> {
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();

  const textItems: ExtractedTextItem[] = [];
  const rawParts: string[] = [];

  for (const item of textContent.items) {
    // Skip marked content items (they don't have str)
    if (!('str' in item) || !item.str.trim()) continue;

    const str = item.str.trim();
    rawParts.push(str);

    // Extract position from transform matrix:
    // transform = [scaleX, shearX, shearY, scaleY, translateX, translateY]
    const transform = item.transform || [1, 0, 0, 1, 0, 0];
    const x = transform[4];
    // PDF coordinates are bottom-up; convert to top-down
    const y = viewport.height - transform[5];

    textItems.push({
      str,
      x,
      y,
      width: item.width || 0,
      height: item.height || Math.abs(transform[3]) || 12,
      fontName: item.fontName || '',
    });
  }

  const hasTextLayer = textItems.length >= TEXT_LAYER_THRESHOLD;
  const spatialText = hasTextLayer ? reconstructSpatialLayout(textItems, viewport.width, viewport.height) : '';

  return {
    pageNumber,
    hasTextLayer,
    textItemCount: textItems.length,
    rawText: rawParts.join(' '),
    spatialText,
    pageWidth: viewport.width,
    pageHeight: viewport.height,
    textItems,
  };
}

/**
 * Reconstruct a spatial text representation from extracted text items.
 * Groups items into lines based on Y-proximity, then formats with indentation
 * to approximate horizontal positioning.
 */
function reconstructSpatialLayout(
  items: ExtractedTextItem[],
  pageWidth: number,
  pageHeight: number
): string {
  if (items.length === 0) return '';

  // Sort by Y (top-down), then X (left to right)
  const sorted = [...items].sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > LINE_Y_TOLERANCE) return yDiff;
    return a.x - b.x;
  });

  // Group into lines (items within Y-tolerance of each other)
  const lines: ExtractedTextItem[][] = [];
  let currentLine: ExtractedTextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= LINE_Y_TOLERANCE) {
      currentLine.push(item);
    } else {
      // Sort current line by X before pushing
      currentLine.sort((a, b) => a.x - b.x);
      lines.push(currentLine);
      currentLine = [item];
      currentY = item.y;
    }
  }
  // Don't forget the last line
  currentLine.sort((a, b) => a.x - b.x);
  lines.push(currentLine);

  // Format lines with spatial context
  const output: string[] = [];
  output.push(`[Page dimensions: ${Math.round(pageWidth)}x${Math.round(pageHeight)} PDF units]`);
  output.push('');

  for (const line of lines) {
    const yPos = Math.round(line[0].y);
    const parts: string[] = [];

    for (let i = 0; i < line.length; i++) {
      const item = line[i];
      if (i > 0) {
        // Add spacing proportional to X gap
        const gap = item.x - (line[i - 1].x + line[i - 1].width);
        if (gap > 50) {
          parts.push('    '); // Large gap
        } else if (gap > 20) {
          parts.push('  '); // Medium gap
        } else {
          parts.push(' '); // Small gap
        }
      }
      parts.push(item.str);
    }

    output.push(`[y=${yPos}] ${parts.join('')}`);
  }

  return output.join('\n');
}

/**
 * Extract text from all pages of a PDF file.
 * Returns per-page text with spatial layout and a summary of which pages have text.
 */
export async function extractPdfText(file: File): Promise<{
  pages: ExtractedPageText[];
  totalPages: number;
  pagesWithText: number;
  pagesWithoutText: number;
}> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf = await (pdfjs as any).getDocument({ data: arrayBuffer }).promise;

  const pages: ExtractedPageText[] = [];
  let pagesWithText = 0;
  let pagesWithoutText = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const extracted = await extractPageText(page, i);
    pages.push(extracted);

    if (extracted.hasTextLayer) {
      pagesWithText++;
    } else {
      pagesWithoutText++;
    }
  }

  return { pages, totalPages: pdf.numPages, pagesWithText, pagesWithoutText };
}

/**
 * Get a compact text excerpt from a page, suitable for classification prompts.
 * Returns the first `maxChars` characters of raw text, trimmed.
 */
export function getTextExcerpt(page: ExtractedPageText, maxChars: number = 200): string {
  const text = page.rawText.trim();
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '…';
}
