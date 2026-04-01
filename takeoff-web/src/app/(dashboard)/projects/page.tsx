'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogTitle, DialogDescription, DialogActions } from '@/components/ui/Dialog';
import { ProjectGrid } from '@/components/projects/ProjectGrid';
import {
  ProjectFilters,
  type StatusFilter,
  type SortOption,
  type ViewMode,
} from '@/components/projects/ProjectFilters';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { clearPdfFiles } from '@/lib/utils/pdf-store';
import { deleteProjectDataLocal } from '@/lib/data/local-persistence';
import type { Project } from '@/lib/types/database';

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  useEffect(() => {
    async function fetchProjects() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .order('updated_at', { ascending: false });

        if (error) throw error;
        setProjects((data as Project[]) ?? []);
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    let result = [...projects];

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.address?.toLowerCase().includes(q) ||
          p.client_name?.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter);
    }

    // Sort
    switch (sort) {
      case 'newest':
        result.sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        break;
      case 'oldest':
        result.sort(
          (a, b) =>
            new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
        );
        break;
      case 'name_asc':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return result;
  }, [projects, search, statusFilter, sort]);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteRequest = (id: string) => {
    const project = projects.find((p) => p.id === id);
    if (project) setDeleteTarget(project);
  };

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      if (isSupabaseConfigured()) {
        // Use server-side API route for reliable deletion (handles RLS properly)
        const res = await fetch(`/api/projects/${deleteTarget.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Delete request failed' }));
          throw new Error(body.error || `Delete failed (${res.status})`);
        }
      }

      // Clean up local data
      sessionStorage.removeItem(`project-meta-${deleteTarget.id}`);
      deleteProjectDataLocal(deleteTarget.id);
      try { await clearPdfFiles(deleteTarget.id); } catch { /* ignore cleanup errors */ }

      // Update UI — only after successful deletion
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete project';
      console.error('Failed to delete project:', err);
      setDeleteError(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <Button
          icon={<Plus className="h-4 w-4" />}
          onClick={() => router.push('/projects/new')}
        >
          New Project
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <ProjectFilters
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          sort={sort}
          onSortChange={setSort}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>

      {/* Grid */}
      <ProjectGrid
        projects={filteredProjects}
        loading={loading}
        onDelete={handleDeleteRequest}
      />
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => { if (!isDeleting) { setDeleteTarget(null); setDeleteError(null); } }}>
        <DialogTitle>Delete Project</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will permanently
          remove the project and all its data (line items, chat history, and files). This action cannot
          be undone.
        </DialogDescription>
        {deleteError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{deleteError}</p>
          </div>
        )}
        <DialogActions>
          <Button
            variant="secondary"
            onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteConfirm}
            disabled={isDeleting}
            icon={isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
