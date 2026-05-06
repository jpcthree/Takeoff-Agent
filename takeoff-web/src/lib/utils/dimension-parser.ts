/**
 * Architectural dimension parser.
 *
 * Takes a string of OCR output and finds dimension callouts in the formats
 * commonly seen on residential plans:
 *
 *   12'-6"        →  feet + inches with dash
 *   12' 6"        →  feet + inches space-separated
 *   24'-0"        →  whole feet (the 0" is conventional)
 *   24'           →  feet only
 *   6"            →  inches only
 *   12'-6 1/2"    →  with fractional inches
 *   1' 6 1/2"     →  same with space
 *   3'-0"         →  3'-0" (door width convention)
 *
 * Output is normalized to total feet (decimal). Source string is preserved
 * for traceability so the agent can reference what it actually read.
 *
 * OCR is noisy: the tick marks (' and ") get mangled into characters like
 * `, ´, ′, ″, ", or even ! and l. We normalize before matching.
 */

export interface ParsedDimension {
  /** Original substring of the OCR output that matched */
  source: string;
  /** Decimal feet */
  totalFeet: number;
  /** Whole feet portion */
  feet: number;
  /** Decimal inches portion (may include fractions) */
  inches: number;
  /** Position in the input string (start, end) */
  range: [number, number];
}

// ---------------------------------------------------------------------------
// Tick-mark normalization
// ---------------------------------------------------------------------------

/**
 * OCR commonly mangles foot/inch tick marks. Normalize to ASCII ' and ".
 * Be conservative: only swap unambiguous tick-like characters. Leave letters
 * (l, I, |) alone — they're too risky to coerce into ticks without context.
 */
export function normalizeTicks(input: string): string {
  return input
    // Foot ticks: ′ (U+2032 prime), ʹ, ` (backtick), ´ (acute accent)
    .replace(/[′ʹ´`]/g, "'")
    // Inch ticks: ″ (U+2033 double prime), ", ", ", ʺ
    .replace(/[″“”„ʺ]/g, '"')
    // Common dash variants
    .replace(/[‐‑‒–—]/g, '-');
}

// ---------------------------------------------------------------------------
// Parse a single dimension token
// ---------------------------------------------------------------------------

/** Parse "1/2", "3/4", "1 1/2", "5/8" etc. → decimal */
function parseFraction(s: string): number | null {
  const trimmed = s.trim();
  // mixed: "1 1/2" or "1-1/2"
  const mixed = trimmed.match(/^(\d+)[\s-]+(\d+)\/(\d+)$/);
  if (mixed) {
    const w = parseInt(mixed[1], 10);
    const n = parseInt(mixed[2], 10);
    const d = parseInt(mixed[3], 10);
    if (d === 0) return null;
    return w + n / d;
  }
  // simple: "1/2"
  const simple = trimmed.match(/^(\d+)\/(\d+)$/);
  if (simple) {
    const n = parseInt(simple[1], 10);
    const d = parseInt(simple[2], 10);
    if (d === 0) return null;
    return n / d;
  }
  // whole number
  const whole = trimmed.match(/^(\d+(?:\.\d+)?)$/);
  if (whole) return parseFloat(whole[1]);
  return null;
}

// ---------------------------------------------------------------------------
// Match patterns. Built around tick characters in the *normalized* string.
// Each capture is wrapped with anchors that prevent matching across line
// breaks or running into adjacent numbers.
// ---------------------------------------------------------------------------

/**
 * Pattern for: feet tick + optional inches.
 *
 *   group 1: feet (1+ digits)
 *   group 2: optional inches portion ("6", "6 1/2", "0", "1/2")
 *
 * `[-\s]+` between feet and inches matches dashes, spaces, or both — this
 * way "12'-6\"", "12' 6\"", and "12'-  6\"" all parse identically.
 */
const FEET_INCHES = /(\d{1,4})'(?:[-\s]+(\d{1,2}(?:\s+\d{1,2}\/\d{1,2})?(?:\.\d+)?|\d{1,2}\/\d{1,2}|0)\s*"?)?/g;

/**
 * Pattern for: inches only. Matched only when NOT preceded by a digit + tick
 * (which would mean it's the inch portion of a feet+inches dimension).
 */
const INCHES_ONLY = /(?<!['\d])(\d{1,2}(?:\s+\d{1,2}\/\d{1,2})?(?:\.\d+)?|\d{1,2}\/\d{1,2})\s*"/g;

/**
 * Find all dimensions in a block of text.
 *
 * Returns matches in source-string order. Overlapping matches are
 * deduplicated — the longer (more specific) match wins.
 */
export function findDimensions(rawText: string): ParsedDimension[] {
  const text = normalizeTicks(rawText);
  const matches: ParsedDimension[] = [];
  // Track every range the FEET_INCHES pass touches, even if the match was
  // rejected (e.g., bogus inches). This prevents the inches-only pass from
  // re-matching the inches portion of a discarded feet+inches token.
  const consumed: [number, number][] = [];

  // Pass 1: feet+inches (the strict, longer pattern)
  for (const m of text.matchAll(FEET_INCHES)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    consumed.push([start, end]);
    const feet = parseInt(m[1], 10);
    let inches = 0;
    if (m[2] !== undefined) {
      const inchesParsed = parseFraction(m[2]);
      if (inchesParsed === null) continue;
      inches = inchesParsed;
    }
    if (inches >= 12) continue; // bogus inches
    if (feet === 0 && inches === 0) continue; // 0'-0" carries no info
    matches.push({
      source: m[0].trim(),
      totalFeet: feet + inches / 12,
      feet,
      inches,
      range: [start, end],
    });
  }

  // Pass 2: inches-only (skip ranges already consumed in pass 1)
  for (const m of text.matchAll(INCHES_ONLY)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const inside = consumed.some(([s, e]) => start >= s && end <= e);
    if (inside) continue;
    const inches = parseFraction(m[1]);
    if (inches === null || inches >= 144) continue;
    matches.push({
      source: m[0].trim(),
      totalFeet: inches / 12,
      feet: 0,
      inches,
      range: [start, end],
    });
  }

  // Sort by position
  matches.sort((a, b) => a.range[0] - b.range[0]);
  return matches;
}

/**
 * Format a decimal-feet value back into architectural notation: 12'-6 1/2".
 * Used to mirror the parsed value back to the agent in a clean shape.
 */
export function formatDimension(totalFeet: number): string {
  const sign = totalFeet < 0 ? '-' : '';
  const abs = Math.abs(totalFeet);
  const feet = Math.floor(abs);
  const inchesDecimal = (abs - feet) * 12;
  const wholeInches = Math.floor(inchesDecimal);
  const fracDecimal = inchesDecimal - wholeInches;

  // Round fraction to nearest 1/8
  const eighths = Math.round(fracDecimal * 8);
  const FRAC: Record<number, string> = {
    1: '1/8', 2: '1/4', 3: '3/8', 4: '1/2', 5: '5/8', 6: '3/4', 7: '7/8',
  };

  let inchStr = '';
  if (eighths === 8) {
    // rounded up to next inch
    return formatDimension(sign === '-' ? -(feet + (wholeInches + 1) / 12) : feet + (wholeInches + 1) / 12);
  }
  if (eighths === 0 && wholeInches === 0) {
    return `${sign}${feet}'-0"`;
  }
  if (eighths === 0) {
    inchStr = `${wholeInches}`;
  } else if (wholeInches === 0) {
    inchStr = FRAC[eighths];
  } else {
    inchStr = `${wholeInches} ${FRAC[eighths]}`;
  }

  if (feet === 0) {
    return `${sign}${inchStr}"`;
  }
  return `${sign}${feet}'-${inchStr}"`;
}
