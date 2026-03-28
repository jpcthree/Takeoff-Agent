# UI Restructure — Two Tools + Retrofit Redesign

## Overview
Split the app into two distinct tools (Takeoff Estimator + Retrofit Estimator), redesign the Retrofit experience with Zillow-style property presentation and tabbed trade estimates, add keyboard-navigable spreadsheet editing, and remove auto-populated material costs.

---

## Phase 1: Navigation Restructure
- [ ] Add tool tabs to dashboard sidebar: "Takeoff Estimator", "Retrofit Estimator", "Projects", "Settings"
- [ ] Create `/takeoff` route — simplified project creation for plans upload
- [ ] Create `/retrofit` route — address-first project creation for existing homes
- [ ] Update sidebar active state styling
- [ ] Remove step 3 "choose method" from wizard — each tool IS the method
- [ ] Store `tool_type` in project metadata

## Phase 2: Retrofit Estimator Redesign
- [ ] Build `RetrofitPanel` — Zillow-style property hero (street view banner, stats bar, satellite image)
- [ ] Build `TradeTabBar` — horizontal tabs for each trade (Insulation, Drywall, Roofing, Gutters, etc.)
- [ ] Build `TradeEstimateTab` — per-trade table + notes view
- [ ] Switch retrofit workspace to 2-panel layout (RetrofitPanel + ChatPanel)
- [ ] Trade tabs embedded with estimate tables below property hero
- [ ] Display trade-specific notes (code requirements, assumptions)
- [ ] Track active trade tab in project store

## Phase 3: Spreadsheet Keyboard Navigation
- [ ] Add focused cell state tracking (`focusedCell: {row, col}`)
- [ ] Arrow keys navigate between cells
- [ ] Tab/Shift+Tab move to next/prev editable cell
- [ ] Enter activates edit mode, Enter again commits
- [ ] Typing a number on focused cell starts edit immediately
- [ ] Escape cancels editing
- [ ] Visual focus ring on active cell
- [ ] Extract reusable `EditableTable` component for both tools

## Phase 4: Remove Material Cost Auto-Population
- [ ] Change `pythonLineItemToSpreadsheet()` to set unitCost = 0 (blank)
- [ ] Add "Upload Costs" button to toolbar → Excel upload dialog
- [ ] Parse uploaded Excel, match to line items, populate unitCost
- [ ] Add "Apply Default Costs" button (fills from pipeline defaults as optional)
- [ ] Keep pipeline costs available for chat assistant suggestions

## Phase 5: UI Polish
- [ ] Property hero: full-width street view, pill badges for stats, warm palette
- [ ] Table styling: lighter headers, row stripes, better density
- [ ] Sticky description column on horizontal scroll
- [ ] Sidebar refinement with icons and active indicators
- [ ] Consistent color palette, spacing, shadows throughout

---

## Key Decisions
1. Retrofit uses 2-panel layout (property+trades on left, chat on right) — no separate spreadsheet panel
2. Material costs blank by default — user fills in or uploads Excel
3. Keep current useReducer store pattern, add activeRetrofitTrade state
4. Python pipeline still calculates costs internally (for validation) but frontend ignores them for display
