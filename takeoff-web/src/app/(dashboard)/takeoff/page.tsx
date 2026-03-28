'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ProjectGrid } from '@/components/projects/ProjectGrid';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import type { Project } from '@/lib/types/database';

export default function TakeoffPage() {
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
            .order('updated_at', { ascending: false });
          if (error) throw error;
          // TODO: filter by project type once stored in DB
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

  return (
    <div className="px-8 py-8">
      {/* Hero */}
      <div className="mb-8 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 p-8 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                <FileText className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold">Takeoff Estimator</h1>
            </div>
            <p className="text-blue-100 text-sm max-w-lg mt-2">
              Upload construction blueprint PDFs for AI-powered analysis. Extract building
              details and generate detailed material and labor cost estimates for all trades.
            </p>
          </div>
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => router.push('/projects/new-takeoff')}
            className="bg-white text-blue-700 hover:bg-blue-50 border-0 shrink-0"
          >
            New Takeoff
          </Button>
        </div>
      </div>

      {/* Recent Projects */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Projects</h2>
        <ProjectGrid projects={projects} loading={loading} />
      </div>
    </div>
  );
}
