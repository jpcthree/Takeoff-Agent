import React from 'react';

type BadgeVariant = 'draft' | 'analyzing' | 'in_progress' | 'complete';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantConfig: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
  draft: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    dot: 'bg-gray-500',
  },
  analyzing: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
  },
  in_progress: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  complete: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
};

function Badge({ variant, children, className = '' }: BadgeProps) {
  const config = variantConfig[variant];

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
        config.bg,
        config.text,
        className,
      ].join(' ')}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {children}
    </span>
  );
}

export { Badge };
export type { BadgeProps, BadgeVariant };
