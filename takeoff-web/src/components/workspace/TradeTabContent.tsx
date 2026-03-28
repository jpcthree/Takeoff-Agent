'use client';

import React from 'react';
import { SpreadsheetTable } from './SpreadsheetTable';
import { getTradeLabel } from '@/lib/api/python-service';
import type { NoteSection } from '@/lib/api/python-service';

interface TradeTabContentProps {
  trade: string;
  notes?: NoteSection[];
}

function TradeTabContent({ trade, notes }: TradeTabContentProps) {
  // Filter notes relevant to this trade
  const tradeNotes = notes?.filter((note) => {
    const titleLower = note.title.toLowerCase();
    const tradeLower = trade.toLowerCase();
    // Match notes that mention the trade name, or show all notes for the trade
    return (
      titleLower.includes(tradeLower) ||
      titleLower.includes(getTradeLabel(trade).toLowerCase()) ||
      // Show general notes on first trade
      titleLower.includes('general') ||
      titleLower.includes('summary') ||
      titleLower.includes('code')
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Spreadsheet for this trade */}
      <div className="flex-1 min-h-0">
        <SpreadsheetTable tradeFilter={trade} />
      </div>

      {/* Notes section */}
      {tradeNotes && tradeNotes.length > 0 && (
        <div className="border-t border-gray-200 bg-gray-50 px-5 py-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Notes &amp; Requirements
          </h3>
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
        </div>
      )}
    </div>
  );
}

export { TradeTabContent };
