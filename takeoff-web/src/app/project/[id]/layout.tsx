'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useParams();
  const [projectName, setProjectName] = useState('');
  const [projectAddress, setProjectAddress] = useState('');

  // Read project meta from sessionStorage (same pattern as page.tsx)
  useEffect(() => {
    const id = params?.id as string;
    if (!id) return;
    try {
      const stored = sessionStorage.getItem(`project-meta-${id}`);
      if (stored) {
        const meta = JSON.parse(stored);
        setProjectName(meta.name || '');
        setProjectAddress(meta.address || '');
      }
    } catch {
      // Ignore parse errors
    }
  }, [params?.id]);

  const displayTitle = projectName || projectAddress || 'Project Workspace';
  const showAddress = projectName && projectAddress;
  const [isExporting, setIsExporting] = useState(false);

  // Listen for the page-side handler to acknowledge completion
  useEffect(() => {
    const done = () => setIsExporting(false);
    window.addEventListener('takeoff:export-done', done);
    return () => window.removeEventListener('takeoff:export-done', done);
  }, []);

  const handleExport = useCallback(() => {
    setIsExporting(true);
    window.dispatchEvent(new CustomEvent('takeoff:export'));
    // Failsafe: clear the spinner after 30s if no done event fires
    setTimeout(() => setIsExporting(false), 30000);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top toolbar */}
      <div className="flex h-12 items-center justify-between border-b border-gray-200 bg-white px-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push('/projects')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-gray-900 truncate">
              {displayTitle}
            </span>
            {showAddress && (
              <>
                <span className="text-gray-300 shrink-0">—</span>
                <span className="text-sm text-gray-500 truncate">{projectAddress}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            icon={isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            onClick={handleExport}
            disabled={isExporting}
          >
            Export
          </Button>
        </div>
      </div>

      {/* Panel area */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
