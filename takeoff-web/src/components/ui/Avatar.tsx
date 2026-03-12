import React from 'react';

type AvatarSize = 'sm' | 'md' | 'lg';

interface AvatarProps {
  name?: string;
  src?: string;
  size?: AvatarSize;
  className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-11 w-11 text-base',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const initials = name ? getInitials(name) : '?';

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        className={`${sizeClasses[size]} rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={[
        sizeClasses[size],
        'rounded-full bg-primary/10 text-primary font-medium',
        'flex items-center justify-center select-none',
        className,
      ].join(' ')}
      title={name}
    >
      {initials}
    </div>
  );
}

export { Avatar };
export type { AvatarProps, AvatarSize };
