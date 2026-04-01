'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Home, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogTitle, DialogDescription, DialogActions } from '@/components/ui/Dialog';
import { ProjectGrid } from '@/components/projects/ProjectGrid';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { clearPdfFiles } from '@/lib/utils/pdf-store';
import { deleteProjectDataLocal } from '@/lib/data/local-persistence';
import type { Project } from '@/lib/types/database';

export default function RetrofitPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProjects() {
      try {
        if (isSupabaseConfigured()) {
          const supabase = createClient();
          const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('input_method', 'address')
            .order('updated_at', { ascending: false });
          if (error) throw error;
          setProjects((data as Project[]) ?? []);
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProjects();
  }, []);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      if (isSupabaseConfigured()) {
        const res = await fetch(`/api/projects/${deleteTarget.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Delete request failed' }));
          throw new Error(body.error || `Delete failed (${res.status})`);
        }
      }
      sessionStorage.removeItem(`project-meta-${deleteTarget.id}`);
      deleteProjectDataLocal(deleteTarget.id);
      try { await clearPdfFiles(deleteTarget.id); } catch { /* ignore */ }
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
      {/* Hero */}
      <div className="mb-8 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-8 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                <Home className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold">Retrofit Estimator</h1>
            </div>
            <p className="text-emerald-100 text-sm max-w-lg mt-2">
              Generate cost estimates for existing homes from just an address. We look up
              property data, images, and building characteristics to estimate insulation,
              drywall, roofing, gutters, and more.
            </p>
          </div>
          <Button
            variant="ghost"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => router.push('/projects/new-retrofit')}
            className="!bg-white !text-emerald-700 hover:!bg-emerald-50 shadow-sm shrink-0"
          >
            New Estimate
          </Button>
        </div>
      </div>

      {/* Projects */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Retrofit Estimates</h2>
        <ProjectGrid
          projects={projects}
          loading={loading}
          onDelete={(id) => {
            const project = projects.find((p) => p.id === id);
            if (project) setDeleteTarget(project);
          }}
        />
      </div>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => { if (!isDeleting) { setDeleteTarget(null); setDeleteError(null); } }}>
        <DialogTitle>Delete Estimate</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will permanently
          remove the estimate and all its data. This action cannot be undone.
        </DialogDescription>
        {deleteError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{deleteError}</p>
          </div>
        )}
        <DialogActions>
          <Button variant="secondary" onClick={() => { setDeleteTarget(null); setDeleteError(null); }} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteConfirm}
            disabled={isDeleting}
            icon={isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
