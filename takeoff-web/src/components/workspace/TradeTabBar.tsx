'use client';

import React from 'react';
import { getTradeLabel } from '@/lib/api/python-service';
import type { TradeSubtotal } from '@/lib/types/line-item';

interface TradeTabBarProps {
  trades: string[];
  activeTrade: string;
  onTabChange: (trade: string) => void;
  tradeItemCounts: Record<string, number>;
  tradeSubtotals?: Record<string, TradeSubtotal>;
  /** Override display labels for specific tab IDs (e.g. "project" → "Project") */
  tabLabels?: Record<string, string>;
  /** Optional icon elements for specific tab IDs */
  tabIcons?: Record<string, React.ReactNode>;
}

function TradeTabBar({ trades, activeTrade, onTabChange, tradeItemCounts, tradeSubtotals, tabLabels, tabIcons }: TradeTabBarProps) {
  if (trades.length === 0) return null;

  return (
    <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
      <div className="px-5 flex gap-1 overflow-x-auto">
        {trades.map((trade) => {
          const isActive = trade === activeTrade;
          const count = tradeItemCounts[trade] || 0;
          const subtotal = tradeSubtotals?.[trade];

          return (
            <button
              key={trade}
              onClick={() => onTabChange(trade)}
              className={[
                'flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              ].join(' ')}
            >
              {tabIcons?.[trade] && <span className="mr-0.5">{tabIcons[trade]}</span>}
              {tabLabels?.[trade] ?? getTradeLabel(trade)}
              <span
                className={[
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'bg-gray-100 text-gray-500',
                ].join(' ')}
              >
                {count}
              </span>
              {subtotal && subtotal.amount > 0 && (
                <span className="text-[10px] text-gray-400 ml-1">
                  {subtotal.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { TradeTabBar };
