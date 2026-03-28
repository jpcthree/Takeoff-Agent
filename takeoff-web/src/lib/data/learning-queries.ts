/**
 * Learning loop queries.
 * Aggregates adjustment patterns across all projects to inject
 * into the chat system prompt so the AI improves over time.
 */

import { getFrequentAdjustments } from './estimate-persistence';

export interface AdjustmentPattern {
  item_description: string;
  field_changed: string;
  avg_original: number;
  avg_new: number;
  adjustment_count: number;
  pct_change: number; // percentage change from original
}

/**
 * Build a human-readable summary of adjustment patterns for the system prompt.
 * Groups by trade and describes the most common corrections.
 */
export async function buildLearningContext(trades: string[]): Promise<string> {
  const allPatterns: Array<AdjustmentPattern & { trade: string }> = [];

  for (const trade of trades) {
    const patterns = await getFrequentAdjustments(trade, 10);
    for (const p of patterns) {
      const pctChange = p.avg_original !== 0
        ? ((p.avg_new - p.avg_original) / p.avg_original) * 100
        : 0;
      allPatterns.push({ ...p, pct_change: pctChange, trade });
    }
  }

  if (allPatterns.length === 0) return '';

  const lines = [
    `## Historical Adjustment Patterns`,
    `Based on previous estimates, users frequently make these corrections:`,
    ``,
  ];

  // Group by trade
  const byTrade = new Map<string, typeof allPatterns>();
  for (const p of allPatterns) {
    const existing = byTrade.get(p.trade) || [];
    existing.push(p);
    byTrade.set(p.trade, existing);
  }

  for (const [trade, patterns] of byTrade) {
    lines.push(`### ${trade}`);
    for (const p of patterns) {
      const direction = p.pct_change > 0 ? 'increased' : 'decreased';
      const absPct = Math.abs(p.pct_change).toFixed(0);
      lines.push(
        `- "${p.item_description}" ${p.field_changed} is typically ${direction} by ~${absPct}% ` +
        `(from ${p.avg_original.toFixed(1)} to ${p.avg_new.toFixed(1)}, seen ${p.adjustment_count} times)`
      );
    }
    lines.push(``);
  }

  lines.push(`Consider proactively suggesting these adjustments when relevant.`);

  return lines.join('\n');
}
