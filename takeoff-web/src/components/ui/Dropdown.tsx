'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

interface DropdownItemProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}

interface DropdownDividerProps {
  className?: string;
}

function Dropdown({ trigger, children, align = 'left', className = '' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, handleClickOutside]);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <div onClick={() => setOpen((prev) => !prev)} className="cursor-pointer">
        {trigger}
      </div>
      {open && (
        <div
          className={[
            'absolute z-40 mt-1 min-w-[180px] bg-white rounded-lg border border-gray-200 shadow-lg py-1 animate-dropdown',
            align === 'right' ? 'right-0' : 'left-0',
          ].join(' ')}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  children,
  icon,
  onClick,
  danger = false,
  disabled = false,
  className = '',
}: DropdownItemProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={[
        'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer',
        danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-gray-700 hover:bg-gray-50',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon && <span className="shrink-0 text-current opacity-60">{icon}</span>}
      {children}
    </button>
  );
}

function DropdownDivider({ className = '' }: DropdownDividerProps) {
  return <div className={`my-1 border-t border-gray-100 ${className}`} />;
}

export { Dropdown, DropdownItem, DropdownDivider };
export type { DropdownProps, DropdownItemProps, DropdownDividerProps };
