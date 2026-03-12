'use client';

import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useParams();

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top toolbar */}
      <div className="flex h-12 items-center justify-between border-b border-gray-200 bg-white px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/projects')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-gray-900">
            Project Workspace
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />}>
            Export
          </Button>
        </div>
      </div>

      {/* Panel area */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
