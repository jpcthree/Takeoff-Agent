'use client';

import React from 'react';
import { ProjectCard } from './ProjectCard';
import type { Project } from '@/lib/types/database';

interface ProjectGridProps {
  projects: Project[];
  loading?: boolean;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-pulse">
      <div className="aspect-video bg-gray-100" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-3/4 bg-gray-100 rounded" />
        <div className="h-3 w-1/2 bg-gray-100 rounded" />
        <div className="flex items-center justify-between">
          <div className="h-5 w-20 bg-gray-100 rounded-full" />
          <div className="h-3 w-16 bg-gray-100 rounded" />
        </div>
      </div>
    </div>
  );
}

function ProjectGrid({ projects, loading = false, onDelete, onDuplicate }: ProjectGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mb-4">
          <svg
            className="h-8 w-8 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900">No projects yet</h3>
        <p className="mt-1 text-sm text-gray-500 max-w-sm">
          Create your first project to start generating takeoffs from your
          construction plans.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
        />
      ))}
    </div>
  );
}

export { ProjectGrid };
export type { ProjectGridProps };
