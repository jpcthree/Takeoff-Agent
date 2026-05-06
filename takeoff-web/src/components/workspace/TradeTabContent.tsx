'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SpreadsheetTable } from './SpreadsheetTable';
import { getTradeLabel } from '@/lib/api/python-service';
import type { NoteSection } from '@/lib/api/python-service';

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
// Component
// ---------------------------------------------------------------------------
interface TradeTabContentProps {
  trade: string;
  notes?: NoteSection[];
}

function TradeTabContent({
  trade,
  notes,
}: TradeTabContentProps) {
  // Filter notes relevant to this trade
  const tradeNotes = notes?.filter((note) => {
    const titleLower = note.title.toLowerCase();
    const tradeLower = trade.toLowerCase();
    const tradeLabelLower = getTradeLabel(trade).toLowerCase();
    // Trade-specific code requirements
    if (titleLower.includes('code')) {
      return (
        titleLower.includes(tradeLower) ||
        titleLower.includes(tradeLabelLower) ||
        (titleLower.includes('building code') && tradeLower === 'insulation')
      );
    }
    // Match notes that mention the trade name, or general notes
    return (
      titleLower.includes(tradeLower) ||
      titleLower.includes(tradeLabelLower) ||
      titleLower.includes('general')
    );
  });

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
      </div>
    </div>
  );
}

export { TradeTabContent };
