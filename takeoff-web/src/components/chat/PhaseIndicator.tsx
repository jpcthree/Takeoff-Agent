'use client';

import React from 'react';
import { CONVERSATION_PHASES, PHASE_LABELS } from '@/lib/types/project';
import type { ConversationPhase } from '@/lib/types/project';

interface PhaseIndicatorProps {
  phase: ConversationPhase;
}

export function PhaseIndicator({ phase }: PhaseIndicatorProps) {
  const currentIdx = CONVERSATION_PHASES.indexOf(phase);

  return (
    <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
      <div className="flex items-center justify-between gap-1">
        {CONVERSATION_PHASES.map((p, idx) => {
          const isCurrent = idx === currentIdx;
          const isPast = idx < currentIdx;
          return (
            <React.Fragment key={p}>
              <div
                className={`flex items-center gap-1.5 ${
                  isCurrent
                    ? 'text-primary font-semibold'
                    : isPast
                      ? 'text-gray-500'
                      : 'text-gray-300'
                }`}
                title={`Phase: ${PHASE_LABELS[p]}`}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    isCurrent ? 'bg-primary' : isPast ? 'bg-gray-400' : 'bg-gray-200'
                  }`}
                />
                <span className="text-[10px] uppercase tracking-wide">{PHASE_LABELS[p]}</span>
              </div>
              {idx < CONVERSATION_PHASES.length - 1 && (
                <span
                  className={`h-px flex-1 ${
                    isPast ? 'bg-gray-300' : 'bg-gray-200'
                  }`}
                  aria-hidden
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
