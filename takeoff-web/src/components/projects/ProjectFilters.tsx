'use client';

import React from 'react';
import { Search, LayoutGrid, List } from 'lucide-react';
import { Input } from '@/components/ui/Input';

export type SortOption = 'newest' | 'oldest' | 'name_asc';
export type ViewMode = 'grid' | 'list';
export type StatusFilter = 'all' | 'draft' | 'in_progress' | 'complete';

interface ProjectFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
}

function ProjectFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sort,
  onSortChange,
  viewMode,
  onViewModeChange,
}: ProjectFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* Search */}
      <div className="flex-1 max-w-xs">
        <Input
          placeholder="Search projects..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          icon={<Search className="h-4 w-4" />}
        />
      </div>

      {/* Status filter */}
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
      >
        <option value="all">All Statuses</option>
        <option value="draft">Draft</option>
        <option value="in_progress">In Progress</option>
        <option value="complete">Complete</option>
      </select>

      {/* Sort */}
      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value as SortOption)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
      >
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="name_asc">Name A-Z</option>
      </select>

      {/* View toggle */}
      <div className="flex rounded-lg border border-gray-300 overflow-hidden">
        <button
          onClick={() => onViewModeChange('grid')}
          className={[
            'flex items-center justify-center p-2 transition-colors cursor-pointer',
            viewMode === 'grid'
              ? 'bg-gray-100 text-gray-900'
              : 'bg-white text-gray-400 hover:text-gray-600',
          ].join(' ')}
          title="Grid view"
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        <button
          onClick={() => onViewModeChange('list')}
          className={[
            'flex items-center justify-center p-2 transition-colors cursor-pointer border-l border-gray-300',
            viewMode === 'list'
              ? 'bg-gray-100 text-gray-900'
              : 'bg-white text-gray-400 hover:text-gray-600',
          ].join(' ')}
          title="List view"
        >
          <List className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export { ProjectFilters };
export type { ProjectFiltersProps };
