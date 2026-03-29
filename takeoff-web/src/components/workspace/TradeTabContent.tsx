'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SpreadsheetTable } from './SpreadsheetTable';
import { getTradeLabel } from '@/lib/api/python-service';
import type { NoteSection, PropertyInfo } from '@/lib/api/python-service';

// ---------------------------------------------------------------------------
// Collapsible Section
// ---------------------------------------------------------------------------
function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-5 py-3 text-left hover:bg-gray-100 transition-colors cursor-pointer"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {title}
        </span>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCurrency(value: number): string {
  return `$${value.toLocaleString()}`;
}

function cleanLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface TradeTabContentProps {
  trade: string;
  notes?: NoteSection[];
  propertyData?: PropertyInfo | null;
  roofClassification?: Record<string, string>;
  assumptions?: string[];
}

function TradeTabContent({
  trade,
  notes,
  propertyData,
  roofClassification,
  assumptions,
}: TradeTabContentProps) {
  // Filter notes relevant to this trade
  const tradeNotes = notes?.filter((note) => {
    const titleLower = note.title.toLowerCase();
    const tradeLower = trade.toLowerCase();
    // Filter out Property Summary — that data lives in PropertyHero now
    if (titleLower.includes('property summary')) return false;
    // Building Code Requirements only on insulation tab
    if (titleLower.includes('code')) return tradeLower === 'insulation';
    // Match notes that mention the trade name, or general notes
    return (
      titleLower.includes(tradeLower) ||
      titleLower.includes(getTradeLabel(trade).toLowerCase()) ||
      titleLower.includes('general')
    );
  });

  // Build comprehensive property detail rows
  const propertyDetails: { label: string; value: string }[] = [];
  if (propertyData) {
    const p = propertyData;
    if (p.year_built) propertyDetails.push({ label: 'Year Built', value: String(p.year_built) });
    if (p.total_sqft) propertyDetails.push({ label: 'Total SF', value: p.total_sqft.toLocaleString() });
    if (p.stories) propertyDetails.push({ label: 'Stories', value: String(p.stories) });
    if (p.bedrooms) propertyDetails.push({ label: 'Bedrooms', value: String(p.bedrooms) });
    if (p.bathrooms) propertyDetails.push({ label: 'Bathrooms', value: String(p.bathrooms) });

    // Foundation & Basement
    if (p.foundation_type && p.foundation_type !== 'unknown') {
      propertyDetails.push({ label: 'Foundation', value: cleanLabel(p.foundation_type) });
    }
    if (p.basement && p.basement !== 'unknown' && p.basement !== 'none') {
      const bsmtVal = p.basement_sqft
        ? `${cleanLabel(p.basement)} (${p.basement_sqft.toLocaleString()} SF)`
        : cleanLabel(p.basement);
      propertyDetails.push({ label: 'Basement', value: bsmtVal });
    }

    // Roof
    if (p.roof_material && p.roof_material !== 'unknown') {
      propertyDetails.push({ label: 'Roof Material', value: cleanLabel(p.roof_material) });
    }
    if (p.roof_type && p.roof_type !== 'unknown') {
      propertyDetails.push({ label: 'Roof Type', value: cleanLabel(p.roof_type) });
    }
    if (roofClassification?.material) {
      propertyDetails.push({
        label: 'AI Roof Classification',
        value: `${cleanLabel(roofClassification.material)} (${roofClassification.confidence || 'n/a'} confidence)`,
      });
    }
    if (roofClassification?.condition) {
      propertyDetails.push({ label: 'Roof Condition', value: cleanLabel(roofClassification.condition) });
    }
    if (p.roof_pitch_deg > 0) {
      const rise = Math.tan((p.roof_pitch_deg * Math.PI) / 180) * 12;
      propertyDetails.push({ label: 'Roof Pitch', value: `${rise.toFixed(1)}/12 (${p.roof_pitch_deg.toFixed(1)}°)` });
    }
    if (p.roof_segments_count > 0) {
      propertyDetails.push({ label: 'Roof Segments', value: String(p.roof_segments_count) });
    }
    if (p.roof_area_sqft > 0) {
      propertyDetails.push({ label: 'Roof Area', value: `${p.roof_area_sqft.toLocaleString()} SF` });
    }

    // Lot
    if (p.lot_sqft && p.lot_sqft > 0) {
      const acres = p.lot_sqft / 43560;
      propertyDetails.push({
        label: 'Lot Size',
        value: acres >= 0.5
          ? `${acres.toFixed(2)} acres (${p.lot_sqft.toLocaleString()} SF)`
          : `${p.lot_sqft.toLocaleString()} SF`,
      });
    }

    // Value & Sale
    if (p.estimated_value > 0) {
      propertyDetails.push({ label: 'Est. Market Value', value: formatCurrency(p.estimated_value) });
    } else if (p.total_value > 0) {
      propertyDetails.push({ label: 'Est. Market Value', value: formatCurrency(p.total_value) });
    }
    if (p.land_value > 0) {
      propertyDetails.push({ label: 'Land Value', value: formatCurrency(p.land_value) });
    }
    if (p.improvement_value > 0) {
      propertyDetails.push({ label: 'Improvement Value', value: formatCurrency(p.improvement_value) });
    }
    if (p.last_sale_price > 0) {
      propertyDetails.push({ label: 'Last Sale Price', value: formatCurrency(p.last_sale_price) });
    }
    if (p.last_sale_date) {
      propertyDetails.push({ label: 'Last Sale Date', value: p.last_sale_date });
    }

    // Coordinates
    if (p.lat && p.lng) {
      propertyDetails.push({ label: 'Coordinates', value: `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}` });
    }
  }

  return (
    <div className="flex flex-col">
      {/* Spreadsheet for this trade */}
      <div className="min-h-0">
        <SpreadsheetTable tradeFilter={trade} />
      </div>

      {/* Below-table sections — all collapsible */}
      <div className="bg-gray-50">
        {/* Notes & Requirements */}
        {tradeNotes && tradeNotes.length > 0 && (
          <CollapsibleSection title="Notes &amp; Requirements" defaultOpen>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tradeNotes.map((note, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-lg border border-gray-200 p-3"
                >
                  <h4 className="text-xs font-semibold text-gray-700 mb-2">
                    {note.title}
                  </h4>
                  <ul className="space-y-1">
                    {note.lines.map((line, lineIdx) => (
                      <li
                        key={lineIdx}
                        className="text-xs text-gray-600 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-gray-400"
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Property Details — comprehensive */}
        {propertyDetails.length > 0 && (
          <CollapsibleSection title="Property Details">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
              {propertyDetails.map((detail, idx) => (
                <div key={idx} className="text-sm">
                  <span className="text-gray-400 text-xs">{detail.label}</span>
                  <div className="text-gray-800 font-medium capitalize">{detail.value}</div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Assumptions */}
        {assumptions && assumptions.length > 0 && (
          <CollapsibleSection title="Assumptions">
            <ul className="space-y-1.5">
              {assumptions.map((assumption, idx) => (
                <li
                  key={idx}
                  className="text-xs text-gray-600 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-gray-400"
                >
                  {assumption}
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}

export { TradeTabContent };
