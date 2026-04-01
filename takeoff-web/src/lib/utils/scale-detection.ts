/**
 * Architectural drawing scale detection and unit conversion.
 *
 * Detects scale notations from PDF text content (e.g. '1/4" = 1'-0"')
 * and converts between PDF coordinate units and real-world dimensions.
 *
 * No external dependencies beyond the ExtractedPageText type.
 */

import type { ExtractedPageText } from '@/lib/utils/pdf-text-extract';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScaleInfo {
  pageNumber: number;
  /** The raw scale string found in the text, e.g. '1/4" = 1\'-0"' */
  scaleString: string;
  /** Multiplier from paper inches to real inches */
  scaleFactor: number;
  source: 'text_regex' | 'claude_classification' | 'both' | 'user_override';
  confidence: 'high' | 'medium' | 'low';
}

export interface Dimension {
  feet: number;
  inches: number;
}

// ---------------------------------------------------------------------------
// Known scale-factor lookup
// Maps the paper-side fraction (as a decimal) to the scale factor.
// scaleFactor = 12 / fractionDecimal
// ---------------------------------------------------------------------------

const KNOWN_SCALES: Record<string, number> = {
  '0.125':  96,   // 1/8"  = 1'-0"
  '0.1875': 64,   // 3/16" = 1'-0"
  '0.25':   48,   // 1/4"  = 1'-0"
  '0.375':  32,   // 3/8"  = 1'-0"
  '0.5':    24,   // 1/2"  = 1'-0"
  '0.75':   16,   // 3/4"  = 1'-0"
  '1':      12,   // 1"    = 1'-0"
  '1.5':     8,   // 1-1/2" = 1'-0"
  '3':       4,   // 3"    = 1'-0"
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise various Unicode quote characters to plain ASCII equivalents
 * so regex patterns can match consistently.
 */
function normalizeQuotes(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')   // " " „ ‟ ″  → "
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")   // ' ' ‚ ‛ ′  → '
    .replace(/\u2013/g, '-')                               // en-dash → hyphen
    .replace(/\u2014/g, '-');                               // em-dash → hyphen
}

/**
 * Convert a fraction string like "1/4" or "3/16" to its decimal value.
 * Also handles whole numbers ("1") and mixed numbers ("1-1/2").
 * Returns null if unparseable.
 */
function fractionToDecimal(frac: string): number | null {
  const trimmed = frac.trim();

  // Mixed number: "1-1/2" or "1 1/2"
  const mixedMatch = trimmed.match(/^(\d+)[\s-]+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num   = parseInt(mixedMatch[2], 10);
    const den   = parseInt(mixedMatch[3], 10);
    if (den === 0) return null;
    return whole + num / den;
  }

  // Simple fraction: "1/4", "3/16"
  const fracMatch = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    if (den === 0) return null;
    return num / den;
  }

  // Whole number: "1", "3"
  const wholeMatch = trimmed.match(/^(\d+)$/);
  if (wholeMatch) {
    return parseInt(wholeMatch[1], 10);
  }

  return null;
}

/**
 * Round a value to the nearest 1/8 inch (0.125).
 */
function roundToEighth(value: number): number {
  return Math.round(value * 8) / 8;
}

// ---------------------------------------------------------------------------
// Scale regex patterns
// ---------------------------------------------------------------------------

/**
 * Each pattern returns a capture group that can be fed to `fractionToDecimal`
 * (for fraction-based scales) or parsed as an integer (for ratio scales).
 *
 * We test against quote-normalised text so we only need ASCII quote chars.
 */
const SCALE_PATTERNS: {
  regex: RegExp;
  type: 'fraction' | 'ratio';
  /** Confidence when this pattern matches */
  confidence: 'high' | 'medium';
}[] = [
  // ---- Fraction-based scales: <frac>" = 1'-0" --------------------------

  // "1/4" = 1'-0""  (most explicit form)
  {
    regex: /(\d+(?:[\s-]+\d+)?\/\d+)\s*"?\s*=\s*1\s*'-?\s*0?\s*"?/gi,
    type: 'fraction',
    confidence: 'high',
  },
  // "1/4" = 1'"  (abbreviated foot mark)
  {
    regex: /(\d+(?:[\s-]+\d+)?\/\d+)\s*"\s*=\s*1\s*'/gi,
    type: 'fraction',
    confidence: 'high',
  },
  // Whole-number inch scales: "1" = 1'-0"", "3" = 1'-0""
  {
    regex: /(\d+)\s*"\s*=\s*1\s*'-?\s*0?\s*"?/gi,
    type: 'fraction',
    confidence: 'high',
  },
  // Mixed number: "1-1/2" = 1'-0""
  {
    regex: /(\d+[\s-]+\d+\/\d+)\s*"?\s*=\s*1\s*'-?\s*0?\s*"?/gi,
    type: 'fraction',
    confidence: 'high',
  },
  // "SCALE: 1/4" = 1'"  or "SCALE = 1/4" = 1'-0""
  {
    regex: /SCALE\s*[:=]\s*(\d+(?:[\s-]+\d+)?\/\d+)\s*"?\s*=\s*1\s*'?/gi,
    type: 'fraction',
    confidence: 'high',
  },
  // "SCALE: 1" = 1'-0"" (whole number with SCALE prefix)
  {
    regex: /SCALE\s*[:=]\s*(\d+)\s*"\s*=\s*1\s*'-?\s*0?\s*"?/gi,
    type: 'fraction',
    confidence: 'high',
  },

  // ---- Ratio-based scales: 1:48 ----------------------------------------

  // "SCALE: 1:48" or "SCALE = 1:48"
  {
    regex: /SCALE\s*[:=]\s*1\s*[:]\s*(\d+)/gi,
    type: 'ratio',
    confidence: 'high',
  },
  // Bare "1:48" (no SCALE prefix — lower confidence)
  {
    regex: /\b1\s*:\s*(\d+)\b/gi,
    type: 'ratio',
    confidence: 'medium',
  },
];

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Parse a scale string into a numeric scale factor.
 *
 * Examples:
 *   '1/4" = 1\'-0"'  → 48
 *   '1:48'            → 48
 *   '3/16"=1\'-0"'    → 64
 *   'SCALE: 1/4"'     → 48
 *
 * Returns null if the string cannot be parsed.
 */
export function parseScaleString(scaleStr: string): number | null {
  const normalised = normalizeQuotes(scaleStr);

  // Try ratio format first: "1:N"
  const ratioMatch = normalised.match(/1\s*:\s*(\d+)/);
  if (ratioMatch) {
    const n = parseInt(ratioMatch[1], 10);
    if (n > 0) return n;
  }

  // Try fraction-based: extract the paper-side measurement
  // Look for patterns like "1/4" = 1'" or "3/16" = 1'-0""
  const fracPatterns = [
    // Mixed number first so it doesn't get partially matched
    /(\d+[\s-]+\d+\/\d+)\s*"?\s*=\s*1/i,
    // Simple fraction
    /(\d+\/\d+)\s*"?\s*=\s*1/i,
    // Whole number inch
    /(\d+)\s*"\s*=\s*1/i,
    // "SCALE: <frac>"" (without the "= 1'" part)
    /SCALE\s*[:=]\s*(\d+(?:[\s-]+\d+)?\/\d+)\s*"?$/i,
    /SCALE\s*[:=]\s*(\d+)\s*"?$/i,
  ];

  for (const pat of fracPatterns) {
    const m = normalised.match(pat);
    if (m) {
      const dec = fractionToDecimal(m[1]);
      if (dec !== null && dec > 0) {
        // Look up known scale or compute
        const key = String(dec);
        if (KNOWN_SCALES[key] !== undefined) {
          return KNOWN_SCALES[key];
        }
        // Compute: scaleFactor = 12 / paperInches
        return 12 / dec;
      }
    }
  }

  return null;
}

/**
 * Scan extracted PDF text for architectural scale notations.
 *
 * Searches both rawText and spatialText of each page. Returns at most one
 * ScaleInfo per page (the highest-confidence match).
 */
export function detectScalesFromText(pages: ExtractedPageText[]): ScaleInfo[] {
  const results: ScaleInfo[] = [];

  for (const page of pages) {
    // Combine both text representations for broader matching
    const textsToSearch = [
      normalizeQuotes(page.rawText ?? ''),
      normalizeQuotes(page.spatialText ?? ''),
    ];

    let bestMatch: {
      scaleString: string;
      scaleFactor: number;
      confidence: 'high' | 'medium';
    } | null = null;

    for (const text of textsToSearch) {
      if (!text) continue;

      for (const pattern of SCALE_PATTERNS) {
        // Reset lastIndex for global regexes
        pattern.regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.regex.exec(text)) !== null) {
          let factor: number | null = null;
          const captured = match[1];

          if (pattern.type === 'ratio') {
            const n = parseInt(captured, 10);
            if (n > 0) factor = n;
          } else {
            const dec = fractionToDecimal(captured);
            if (dec !== null && dec > 0) {
              const key = String(dec);
              factor = KNOWN_SCALES[key] !== undefined
                ? KNOWN_SCALES[key]
                : 12 / dec;
            }
          }

          if (factor === null) continue;

          // Keep the highest-confidence match for this page
          const isBetter =
            !bestMatch ||
            (pattern.confidence === 'high' && bestMatch.confidence !== 'high');

          if (isBetter) {
            bestMatch = {
              scaleString: match[0].trim(),
              scaleFactor: factor,
              confidence: pattern.confidence,
            };
          }
        }
      }
    }

    if (bestMatch) {
      results.push({
        pageNumber: page.pageNumber,
        scaleString: bestMatch.scaleString,
        scaleFactor: bestMatch.scaleFactor,
        source: 'text_regex',
        confidence: bestMatch.confidence,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Unit conversion
// ---------------------------------------------------------------------------

/**
 * Convert PDF coordinate units to a real-world Dimension (feet + inches).
 *
 * PDF units are 1/72 of an inch at paper scale.
 *   paperInches = pdfUnits / 72
 *   realInches  = paperInches * scaleFactor
 *
 * Inches are rounded to the nearest 1/8".
 */
export function pdfUnitsToFeetInches(pdfUnits: number, scaleFactor: number): Dimension {
  const totalRealInches = (pdfUnits / 72) * scaleFactor;
  const feet = Math.floor(totalRealInches / 12);
  const inches = roundToEighth(totalRealInches - feet * 12);

  // Handle edge case where rounding pushes inches to 12
  if (inches >= 12) {
    return { feet: feet + 1, inches: 0 };
  }

  return { feet, inches };
}

/**
 * Convert PDF coordinate units to total real-world inches (decimal).
 */
export function pdfUnitsTotalInches(pdfUnits: number, scaleFactor: number): number {
  return (pdfUnits / 72) * scaleFactor;
}

/**
 * Format a Dimension as an architectural string, e.g. "12'-6"".
 *
 * - If feet is 0, omits the foot portion: '6"'
 * - If inches is 0, omits the inch portion: "12'-0""
 * - Fractional inches shown as fractions: "12'-6 1/2""
 */
export function feetInchesToString(dim: Dimension): string {
  const { feet, inches } = dim;
  const inchStr = formatInches(inches);

  if (feet === 0) {
    return `${inchStr}"`;
  }

  return `${feet}'-${inchStr}"`;
}

/**
 * Format inches as a string, using fractions for non-integer values.
 * e.g. 6.5 → "6 1/2", 3.125 → "3 1/8", 0 → "0"
 */
function formatInches(inches: number): string {
  const whole = Math.floor(inches);
  const frac = inches - whole;

  if (frac < 0.001) {
    return String(whole);
  }

  // Map common eighths to fraction strings
  const eighths = Math.round(frac * 8);
  const FRAC_STRINGS: Record<number, string> = {
    1: '1/8',
    2: '1/4',
    3: '3/8',
    4: '1/2',
    5: '5/8',
    6: '3/4',
    7: '7/8',
  };

  const fracStr = FRAC_STRINGS[eighths] ?? '';
  if (!fracStr) {
    return String(whole);
  }

  if (whole === 0) {
    return fracStr;
  }

  return `${whole} ${fracStr}`;
}
