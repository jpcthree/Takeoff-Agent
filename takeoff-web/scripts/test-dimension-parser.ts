/**
 * Tests for the dimension parser. Real OCR output is noisy; cases here cover
 * both clean text and the typical mangling tesseract produces on architectural
 * tick marks.
 *
 * Run: npx tsx scripts/test-dimension-parser.ts
 */

import { findDimensions, formatDimension } from '../src/lib/utils/dimension-parser';

let pass = 0;
let fail = 0;

function close(a: number, b: number, tol = 0.001): boolean {
  return Math.abs(a - b) <= tol;
}

function expectDim(input: string, expected: number[]): void {
  const matches = findDimensions(input);
  const totals = matches.map((m) => m.totalFeet);
  const ok =
    totals.length === expected.length &&
    expected.every((e, i) => close(totals[i], e));
  if (ok) {
    pass++;
    console.log(`  ✓ "${input}" → [${totals.map((t) => t.toFixed(3)).join(', ')}]`);
  } else {
    fail++;
    console.log(
      `  ✗ "${input}" → got [${totals.map((t) => t.toFixed(3)).join(', ')}], expected [${expected.join(', ')}]`
    );
  }
}

function expectFormat(feet: number, expected: string): void {
  const got = formatDimension(feet);
  if (got === expected) {
    pass++;
    console.log(`  ✓ format(${feet}) → "${got}"`);
  } else {
    fail++;
    console.log(`  ✗ format(${feet}) → "${got}", expected "${expected}"`);
  }
}

console.log('=== Clean dimension formats ===');
expectDim(`12'-6"`, [12.5]);
expectDim(`24'-0"`, [24]);
expectDim(`24'`, [24]);
expectDim(`6"`, [0.5]);
expectDim(`12'-6 1/2"`, [12 + 6.5 / 12]);
expectDim(`1' 6"`, [1.5]);
expectDim(`3'-0"`, [3]);
expectDim(`18'-9 3/4"`, [18 + (9 + 0.75) / 12]);

console.log('\n=== Multiple dimensions in one string ===');
expectDim(`Wall: 12'-6" by 8'-0"`, [12.5, 8]);
expectDim(`A1: 24'-0"  A2: 36'-0"`, [24, 36]);

console.log('\n=== OCR-mangled tick marks ===');
expectDim(`12´-6"`, [12.5]); // acute accent for foot
expectDim(`12'-6″`, [12.5]); // double prime for inch
expectDim(`12′-6″`, [12.5]); // both with primes
expectDim(`12'—6"`, [12.5]); // em-dash
expectDim(`12'–6"`, [12.5]); // en-dash

console.log('\n=== Should NOT match ===');
expectDim(`Page 12 of 24`, []);
expectDim(`Sheet A-101`, []);
expectDim(`R-19 batt`, []);
expectDim(``, []);

console.log('\n=== Edge cases ===');
expectDim(`0'-0"`, []); // zero
expectDim(`12'-13"`, []); // bogus inches
expectDim(`100'-0"`, [100]); // larger feet
expectDim(`1/2"`, [1 / 24]); // bare fractional inch

console.log('\n=== formatDimension ===');
expectFormat(12.5, `12'-6"`);
expectFormat(24, `24'-0"`);
expectFormat(0.5, `6"`);
expectFormat(12 + 6.5 / 12, `12'-6 1/2"`);
expectFormat(1.5, `1'-6"`);
expectFormat(0, `0'-0"`);
expectFormat(0.0625, `3/4"`); // 0.75 inches = 0.0625 ft

console.log(`\n=== Summary ===`);
console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
