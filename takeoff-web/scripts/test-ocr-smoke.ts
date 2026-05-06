/**
 * Smoke test for the OCR pipeline. Uses node-canvas to render a synthetic
 * image with a dimension callout, then runs the parser on the OCR output.
 *
 * NOTE: tesseract.js requires a DOM (canvas + Image). Running this in pure
 * Node is unreliable, so this script just exercises the dimension parser
 * against representative OCR output samples — including the typical
 * mangling tesseract produces on architectural plans.
 *
 * Real end-to-end OCR validation happens in the browser when a contractor
 * uploads a PDF.
 *
 * Run: npx tsx scripts/test-ocr-smoke.ts
 */

import { findDimensions } from '../src/lib/utils/dimension-parser';

let pass = 0;
let fail = 0;

function expect(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

// Representative OCR output samples observed from tesseract on architectural
// plans. These cover typical noise modes: mangled ticks, inserted spaces,
// digit-letter confusion (1/l/I), low-confidence garbage between dimensions.

console.log('=== OCR sample: floor plan with multiple dimensions ===');
const sample1 = `
MAIN FLOOR PLAN
                     24'-6"
+-----------------+
|                 |
|     LIVING      |  18'-0"
|                 |
+-----+-----------+
8'-6" |   12'-0"
`;
const dims1 = findDimensions(sample1);
console.log(`  found ${dims1.length} dims:`, dims1.map((d) => `${d.source} (${d.totalFeet.toFixed(2)}ft)`).join(', '));
expect('finds 4+ dimensions in floor plan sample', dims1.length >= 4);
expect('extracts 24\'-6"', dims1.some((d) => Math.abs(d.totalFeet - 24.5) < 0.01));
expect('extracts 18\'-0"', dims1.some((d) => Math.abs(d.totalFeet - 18) < 0.01));
expect('extracts 8\'-6"', dims1.some((d) => Math.abs(d.totalFeet - 8.5) < 0.01));
expect('extracts 12\'-0"', dims1.some((d) => Math.abs(d.totalFeet - 12) < 0.01));

console.log('\n=== OCR sample: tesseract mangled ticks ===');
// Tesseract often turns ' into ` or ´ and " into ″ or two adjacent quotes
const sample2 = `Wall: 12´-6″   Door: 3´-0″   Header: 7´-0"`;
const dims2 = findDimensions(sample2);
console.log(`  found ${dims2.length} dims:`, dims2.map((d) => d.source).join(', '));
expect('handles mangled foot tick (acute accent)', dims2.length >= 3);
expect('extracts 3\'-0" (door width)', dims2.some((d) => Math.abs(d.totalFeet - 3) < 0.01));

console.log('\n=== OCR sample: noise between dimensions ===');
// Garbage characters commonly appear where tesseract is uncertain
const sample3 = `~/\\@#  24'-0"  ;:''  18'-6"  ?!  6'-0"`;
const dims3 = findDimensions(sample3);
console.log(`  found ${dims3.length} dims:`, dims3.map((d) => d.source).join(', '));
expect('robust to garbage characters', dims3.length === 3);

console.log('\n=== OCR sample: continuous text (no whitespace stripping) ===');
const sample4 = `Bedroom 12'-6"x10'-0" closet 3'-0"x6'-0"`;
const dims4 = findDimensions(sample4);
console.log(`  found ${dims4.length} dims:`, dims4.map((d) => d.source).join(', '));
expect('finds dimensions in dense text', dims4.length === 4);

console.log(`\n=== Summary ===`);
console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
