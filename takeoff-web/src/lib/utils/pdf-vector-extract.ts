/**
 * PDF vector path extraction using pdf.js's getOperatorList().
 *
 * Construction CAD PDFs contain actual drawn wall lines, dimension lines,
 * and structural elements as vector paths. This utility extracts those
 * drawing operations so we can measure real geometry from the PDF content
 * rather than relying solely on rasterized images or text labels.
 *
 * Coordinate system:
 *   PDF natively uses bottom-up Y (origin at bottom-left).
 *   All coordinates returned here are converted to top-down Y
 *   (origin at top-left) to match browser/canvas conventions.
 *
 * pdf.js OPS constants used:
 *   13 = moveTo          — start a new sub-path
 *   14 = lineTo          — draw a line from current point
 *   15 = curveTo         — cubic Bezier (6 args)
 *   16 = curveTo2        — cubic Bezier variant
 *   17 = curveTo3        — cubic Bezier variant
 *   18 = closePath       — close the current sub-path
 *   19 = rectangle       — draw a rectangle (x, y, w, h)
 *   20 = stroke          — stroke current path
 *   21 = closeStroke     — close and stroke
 *   22 = fill            — fill current path
 *   23 = eoFill          — even-odd fill
 *   24 = fillStroke      — fill and stroke
 *   91 = constructPath   — bundled draw operations (pdf.js v5+)
 *
 * Modern pdf.js (v5+) primarily emits constructPath (91) which bundles
 * multiple drawing ops into a single operator with sub-opcodes:
 *   DrawOPS.moveTo = 0             (consumes 2 coords: x, y)
 *   DrawOPS.lineTo = 1             (consumes 2 coords: x, y)
 *   DrawOPS.curveTo = 2            (consumes 6 coords)
 *   DrawOPS.quadraticCurveTo = 3   (consumes 4 coords)
 *   DrawOPS.closePath = 4          (consumes 0 coords)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PathSegment {
  type: 'line' | 'curve' | 'rect';
  /** [x, y] pairs in PDF units with top-down Y */
  points: [number, number][];
  /** Euclidean length for lines; 0 for curves and rects */
  lengthPdfUnits: number;
}

export interface PageVectorData {
  pageNumber: number;
  /** Page width in PDF units (1 unit = 1/72 inch) */
  pageWidth: number;
  /** Page height in PDF units */
  pageHeight: number;
  segments: PathSegment[];
  rectangles: { x: number; y: number; w: number; h: number }[];
  totalSegments: number;
  totalLines: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** pdf.js OPS codes */
const OPS_MOVE_TO = 13;
const OPS_LINE_TO = 14;
const OPS_CURVE_TO = 15;
const OPS_CURVE_TO_2 = 16;
const OPS_CURVE_TO_3 = 17;
const OPS_CLOSE_PATH = 18;
const OPS_RECTANGLE = 19;
const OPS_STROKE = 20;
const OPS_CLOSE_STROKE = 21;
const OPS_FILL = 22;
const OPS_EO_FILL = 23;
const OPS_FILL_STROKE = 24;
const OPS_CONSTRUCT_PATH = 91;

/** DrawOPS sub-codes inside constructPath */
const DRAW_MOVE_TO = 0;
const DRAW_LINE_TO = 1;
const DRAW_CURVE_TO = 2;
const DRAW_QUADRATIC_CURVE_TO = 3;
const DRAW_CLOSE_PATH = 4;

/** Discard line segments shorter than this (PDF units ≈ 0.03 inches) */
const MIN_SEGMENT_LENGTH = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Euclidean distance between two points. */
function dist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Convert bottom-up PDF Y to top-down Y. */
function flipY(y: number, pageHeight: number): number {
  return pageHeight - y;
}

// ---------------------------------------------------------------------------
// Core extraction
// ---------------------------------------------------------------------------

/**
 * Extract vector drawing paths from a single PDF page.
 *
 * Uses `page.getOperatorList()` to walk the PDF's drawing instructions
 * and converts them into typed path segments with top-down coordinates.
 *
 * @param page       - A pdf.js page proxy (from `pdf.getPage(n)`)
 * @param pageNumber - 1-based page number for labelling
 * @returns Structured vector data for the page
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function extractPageVectorPaths(page: any, pageNumber: number): Promise<PageVectorData> {
  const viewport = page.getViewport({ scale: 1 });
  const pageWidth: number = viewport.width;
  const pageHeight: number = viewport.height;

  const emptyResult: PageVectorData = {
    pageNumber,
    pageWidth,
    pageHeight,
    segments: [],
    rectangles: [],
    totalSegments: 0,
    totalLines: 0,
  };

  let opList: { fnArray: number[]; argsArray: unknown[] };
  try {
    opList = await page.getOperatorList();
  } catch {
    // If getOperatorList fails (corrupt page, etc.), return empty data
    return emptyResult;
  }

  const { fnArray, argsArray } = opList;

  // State machine
  let currentX = 0;
  let currentY = 0;
  let pathStartX = 0;
  let pathStartY = 0;
  const pendingSegments: PathSegment[] = [];
  const allSegments: PathSegment[] = [];
  const rectangles: { x: number; y: number; w: number; h: number }[] = [];

  /** Add a line segment if it passes the noise filter. */
  function addLine(x1: number, y1: number, x2: number, y2: number): void {
    const len = dist(x1, y1, x2, y2);
    if (len < MIN_SEGMENT_LENGTH) return; // noise filter
    pendingSegments.push({
      type: 'line',
      points: [
        [x1, flipY(y1, pageHeight)],
        [x2, flipY(y2, pageHeight)],
      ],
      lengthPdfUnits: len,
    });
  }

  /** Add a curve segment (no length calculation — control points make it non-trivial). */
  function addCurve(points: [number, number][]): void {
    pendingSegments.push({
      type: 'curve',
      points: points.map(([x, y]) => [x, flipY(y, pageHeight)] as [number, number]),
      lengthPdfUnits: 0,
    });
  }

  /** Commit pending segments to the final list. */
  function commitPath(): void {
    if (pendingSegments.length > 0) {
      allSegments.push(...pendingSegments);
      pendingSegments.length = 0;
    }
  }

  /**
   * Process a constructPath operator (opcode 91) — pdf.js v5+ format.
   *
   * Args layout:
   *   args[0] = paintType (number) — the painting op that triggered the flush
   *             (e.g. OPS.fill=22, OPS.fillStroke=28, OPS.stroke=20)
   *   args[1] = [Float32Array] — single-element array wrapping a typed array
   *             with INTERLEAVED DrawOPS codes and coordinates:
   *             [opCode, x, y, opCode, x, y, ...]
   *   args[2] = [minX, minY, maxX, maxY] bounding box (or null)
   *
   * The Float32Array is walked sequentially: read the op code, then consume
   * the appropriate number of coordinate values for that op.
   */
  function processConstructPath(args: unknown[]): void {
    // args[1] is a single-element array wrapping the Float32Array
    const dataWrapper = args[1] as unknown[];
    if (!dataWrapper || !dataWrapper[0]) return;

    // The typed array (or array-like with numeric keys)
    const data = dataWrapper[0];

    // Get length — works for Float32Array, plain arrays, and array-like objects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const len = (data as any).length as number;
    if (!len || len === 0) return;

    // Access helper — works for typed arrays and plain objects with numeric keys
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;

    let i = 0;
    while (i < len) {
      const drawOp = d[i++];

      switch (drawOp) {
        case DRAW_MOVE_TO: {
          currentX = d[i++];
          currentY = d[i++];
          pathStartX = currentX;
          pathStartY = currentY;
          break;
        }
        case DRAW_LINE_TO: {
          const x = d[i++];
          const y = d[i++];
          addLine(currentX, currentY, x, y);
          currentX = x;
          currentY = y;
          break;
        }
        case DRAW_CURVE_TO: {
          // cubic Bezier: cp1x, cp1y, cp2x, cp2y, x, y
          const cp1x = d[i++];
          const cp1y = d[i++];
          const cp2x = d[i++];
          const cp2y = d[i++];
          const x = d[i++];
          const y = d[i++];
          addCurve([
            [currentX, currentY],
            [cp1x, cp1y],
            [cp2x, cp2y],
            [x, y],
          ]);
          currentX = x;
          currentY = y;
          break;
        }
        case DRAW_QUADRATIC_CURVE_TO: {
          // quadratic Bezier: cpx, cpy, x, y
          const cpx = d[i++];
          const cpy = d[i++];
          const x = d[i++];
          const y = d[i++];
          addCurve([
            [currentX, currentY],
            [cpx, cpy],
            [x, y],
          ]);
          currentX = x;
          currentY = y;
          break;
        }
        case DRAW_CLOSE_PATH: {
          // Close sub-path: draw line back to pathStart if not already there
          if (currentX !== pathStartX || currentY !== pathStartY) {
            addLine(currentX, currentY, pathStartX, pathStartY);
          }
          currentX = pathStartX;
          currentY = pathStartY;
          break;
        }
        default:
          // Unknown DrawOPS — skip to avoid infinite loop
          // If we hit an unrecognized value, bail out of this constructPath
          return;
      }
    }
  }

  // Walk the operator list
  for (let i = 0; i < fnArray.length; i++) {
    const op = fnArray[i];
    const args = argsArray[i] as unknown[];

    switch (op) {
      // --- Bundled path (pdf.js v5+) ---
      // In v5+, constructPath bundles the drawing ops AND the paint type,
      // so we process the path data and immediately commit.
      case OPS_CONSTRUCT_PATH: {
        processConstructPath(args);
        commitPath();
        break;
      }

      // --- Legacy individual operators ---
      case OPS_MOVE_TO: {
        currentX = (args as number[])[0];
        currentY = (args as number[])[1];
        pathStartX = currentX;
        pathStartY = currentY;
        break;
      }
      case OPS_LINE_TO: {
        const x = (args as number[])[0];
        const y = (args as number[])[1];
        addLine(currentX, currentY, x, y);
        currentX = x;
        currentY = y;
        break;
      }
      case OPS_CURVE_TO: {
        // cubic Bezier: cp1x, cp1y, cp2x, cp2y, x, y
        const a = args as number[];
        addCurve([
          [currentX, currentY],
          [a[0], a[1]],
          [a[2], a[3]],
          [a[4], a[5]],
        ]);
        currentX = a[4];
        currentY = a[5];
        break;
      }
      case OPS_CURVE_TO_2:
      case OPS_CURVE_TO_3: {
        // Variant cubic Beziers — treat similarly
        const a = args as number[];
        if (a.length >= 6) {
          addCurve([
            [currentX, currentY],
            [a[0], a[1]],
            [a[2], a[3]],
            [a[4], a[5]],
          ]);
          currentX = a[4];
          currentY = a[5];
        }
        break;
      }
      case OPS_CLOSE_PATH: {
        if (currentX !== pathStartX || currentY !== pathStartY) {
          addLine(currentX, currentY, pathStartX, pathStartY);
        }
        currentX = pathStartX;
        currentY = pathStartY;
        break;
      }
      case OPS_RECTANGLE: {
        const a = args as number[];
        const [rx, ry, rw, rh] = a;
        // Store rectangle with top-down Y
        rectangles.push({
          x: rx,
          y: flipY(ry + rh, pageHeight), // top-left in top-down coords
          w: rw,
          h: Math.abs(rh),
        });
        // Also emit 4 line segments for the rectangle edges
        pendingSegments.push({
          type: 'rect',
          points: [
            [rx, flipY(ry, pageHeight)],
            [rx + rw, flipY(ry, pageHeight)],
            [rx + rw, flipY(ry + rh, pageHeight)],
            [rx, flipY(ry + rh, pageHeight)],
          ],
          lengthPdfUnits: 0,
        });
        break;
      }

      // --- Path-terminating operators: commit pending segments ---
      case OPS_STROKE:
      case OPS_CLOSE_STROKE:
      case OPS_FILL:
      case OPS_EO_FILL:
      case OPS_FILL_STROKE: {
        commitPath();
        break;
      }

      default:
        // Other operators (transforms, color, etc.) — ignore
        break;
    }
  }

  // Commit any remaining segments that were never explicitly stroked/filled
  commitPath();

  const totalLines = allSegments.filter((s) => s.type === 'line').length;

  return {
    pageNumber,
    pageWidth,
    pageHeight,
    segments: allSegments,
    rectangles,
    totalSegments: allSegments.length,
    totalLines,
  };
}

/**
 * Extract vector paths from all pages of a PDF file.
 *
 * Opens the PDF with pdf.js (dynamic import for browser compatibility),
 * iterates every page, and collects structured vector data.
 *
 * @param file - PDF file from a file input or drag-and-drop
 * @returns Array of per-page vector data
 */
export async function extractAllVectorPaths(file: File): Promise<PageVectorData[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf = await (pdfjs as any).getDocument({ data: arrayBuffer }).promise;

  const results: PageVectorData[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const data = await extractPageVectorPaths(page, i);
    results.push(data);
  }

  return results;
}

/**
 * Compute quick statistics about line segments on a page.
 *
 * Useful for classifying pages (floor plan vs. elevation vs. schedule)
 * based on the density and orientation of drawn lines.
 *
 * @param data - Vector data from a single page
 * @returns Line count, average/max length, and dominant orientation
 */
export function getSegmentStats(data: PageVectorData): {
  lineCount: number;
  avgLength: number;
  maxLength: number;
  orientation: 'mostly_horizontal' | 'mostly_vertical' | 'mixed';
} {
  const lines = data.segments.filter((s) => s.type === 'line');

  if (lines.length === 0) {
    return { lineCount: 0, avgLength: 0, maxLength: 0, orientation: 'mixed' };
  }

  let totalLength = 0;
  let maxLength = 0;
  let horizontalCount = 0;
  let verticalCount = 0;

  for (const seg of lines) {
    totalLength += seg.lengthPdfUnits;
    if (seg.lengthPdfUnits > maxLength) {
      maxLength = seg.lengthPdfUnits;
    }

    // Classify orientation by comparing dx vs dy
    const [p1, p2] = seg.points;
    const dx = Math.abs(p2[0] - p1[0]);
    const dy = Math.abs(p2[1] - p1[1]);

    // A line is "horizontal" if dx > 3*dy, "vertical" if dy > 3*dx
    if (dx > 3 * dy) {
      horizontalCount++;
    } else if (dy > 3 * dx) {
      verticalCount++;
    }
    // Otherwise it's diagonal — doesn't count toward either
  }

  const avgLength = totalLength / lines.length;

  // Determine dominant orientation
  const total = horizontalCount + verticalCount;
  let orientation: 'mostly_horizontal' | 'mostly_vertical' | 'mixed' = 'mixed';
  if (total > 0) {
    if (horizontalCount / total > 0.65) {
      orientation = 'mostly_horizontal';
    } else if (verticalCount / total > 0.65) {
      orientation = 'mostly_vertical';
    }
  }

  return {
    lineCount: lines.length,
    avgLength: Math.round(avgLength * 100) / 100,
    maxLength: Math.round(maxLength * 100) / 100,
    orientation,
  };
}
