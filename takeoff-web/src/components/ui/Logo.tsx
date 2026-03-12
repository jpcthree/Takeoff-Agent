import React from 'react';

type LogoVariant = 'full' | 'icon';
type LogoTheme = 'light' | 'dark';

interface LogoProps {
  variant?: LogoVariant;
  theme?: LogoTheme;
  className?: string;
}

function LogoIcon({ className = '', color = 'currentColor' }: { className?: string; color?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Blueprint/building icon */}
      <rect x="4" y="8" width="24" height="20" rx="2" stroke={color} strokeWidth="2" />
      <path d="M4 14h24" stroke={color} strokeWidth="2" />
      <path d="M12 14v14" stroke={color} strokeWidth="2" />
      <rect x="15" y="18" width="4" height="4" rx="0.5" stroke={color} strokeWidth="1.5" />
      <rect x="21" y="18" width="4" height="4" rx="0.5" stroke={color} strokeWidth="1.5" />
      <rect x="15" y="24" width="4" height="4" rx="0.5" stroke={color} strokeWidth="1.5" />
      <rect x="21" y="24" width="4" height="4" rx="0.5" stroke={color} strokeWidth="1.5" />
      <path d="M6 18h4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 22h4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 26h4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Ruler accent */}
      <path d="M8 4v4" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M16 4v4" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M24 4v4" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Logo({ variant = 'full', theme = 'dark', className = '' }: LogoProps) {
  const textColor = theme === 'light' ? 'text-white' : 'text-gray-900';
  const iconColor = theme === 'light' ? '#ffffff' : '#2F5496';

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoIcon className="h-8 w-8" color={iconColor} />
      {variant === 'full' && (
        <span className={`text-xl font-bold tracking-tight ${textColor}`}>
          Takeoff
        </span>
      )}
    </div>
  );
}

export { Logo, LogoIcon };
export type { LogoProps, LogoVariant, LogoTheme };
