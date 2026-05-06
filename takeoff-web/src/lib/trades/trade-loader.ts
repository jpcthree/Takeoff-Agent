/**
 * Trade module registry.
 *
 * Modules are static JSON imported at build time so the bundler can
 * tree-shake unused trades and the agent has zero-latency access to the
 * full module config. To add a trade: drop a new file under modules/,
 * register it here, ship.
 */

import type { TradeModule } from './trade-types';
import insulation from './modules/insulation.json';
import gutters from './modules/gutters.json';

const MODULES: Record<string, TradeModule> = {
  insulation: insulation as unknown as TradeModule,
  gutters: gutters as unknown as TradeModule,
};

export function getTradeModule(tradeId: string): TradeModule | null {
  return MODULES[tradeId] ?? null;
}

export function listTradeModules(): TradeModule[] {
  return Object.values(MODULES);
}

export function listTradeIds(): string[] {
  return Object.keys(MODULES);
}

/**
 * Get the prompt extensions for a list of active trades. Used by the agent
 * to compose its full system prompt.
 */
export function getPromptExtensions(tradeIds: string[]): string[] {
  return tradeIds
    .map((id) => MODULES[id]?.promptExtension)
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
}

/**
 * Get all required semantic measurement tags across the active trades,
 * sorted by priority. Used by the agent during the Measurement phase.
 */
export function requiredMeasurementsFor(
  tradeIds: string[]
): { tradeId: string; tag: string; label: string; priority: number }[] {
  const out: { tradeId: string; tag: string; label: string; priority: number }[] = [];
  for (const id of tradeIds) {
    const mod = MODULES[id];
    if (!mod) continue;
    for (const m of mod.requiredMeasurements) {
      out.push({ tradeId: id, tag: m.tag, label: m.label, priority: m.priority });
    }
  }
  out.sort((a, b) => a.priority - b.priority);
  return out;
}
