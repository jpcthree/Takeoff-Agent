'use client';

import React, { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

interface DialogTitleProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogActionsProps {
  children: React.ReactNode;
  className?: string;
}

function Dialog({ open, onClose, children }: DialogProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 animate-dialog-overlay"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg animate-dialog-content">
        <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}

function DialogTitle({ children, className = '' }: DialogTitleProps) {
  return (
    <h2 className={`text-lg font-semibold text-gray-900 pr-8 ${className}`}>
      {children}
    </h2>
  );
}

function DialogDescription({ children, className = '' }: DialogDescriptionProps) {
  return (
    <p className={`mt-2 text-sm text-gray-500 ${className}`}>{children}</p>
  );
}

function DialogActions({ children, className = '' }: DialogActionsProps) {
  return (
    <div className={`mt-6 flex items-center justify-end gap-3 ${className}`}>
      {children}
    </div>
  );
}

export { Dialog, DialogTitle, DialogDescription, DialogActions };
export type { DialogProps, DialogTitleProps, DialogDescriptionProps, DialogActionsProps };
