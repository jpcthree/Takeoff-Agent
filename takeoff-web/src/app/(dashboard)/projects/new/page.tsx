'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  CreateProjectWizard,
  type ProjectFormData,
} from '@/components/projects/CreateProjectWizard';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { storePdfFiles } from '@/lib/utils/pdf-store';

export default function NewProjectPage() {
  const router = useRouter();

  /** Save project meta + files, then navigate to workspace */
  const handleComplete = async (data: ProjectFormData) => {
    // Helper to store files & meta locally and navigate
    const goLocal = async (id: string) => {
      sessionStorage.setItem(
        `project-meta-${id}`,
        JSON.stringify({
          name: data.name,
          address: data.address,
          clientName: data.clientName,
          buildingType: data.buildingType,
          selectedTrades: data.selectedTrades,
          inputMethod: data.inputMethod,
        })
      );
      // Store PDF files in IndexedDB so workspace can pick them up
      if (data.inputMethod === 'plans' && data.files.length > 0) {
        await storePdfFiles(id, data.files);
      }
      router.push(`/project/${id}`);
    };

    try {
      // If Supabase is configured, persist to DB
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: project, error } = await supabase
            .from('projects')
            .insert({
              user_id: user.id,
              name: data.name,
              address: data.address,
              client_name: data.clientName,
              building_type: data.buildingType,
              status: 'draft',
            })
            .select()
            .single();

          if (error) throw error;

          // Store selected trades in sessionStorage for the workspace
          sessionStorage.setItem(
            `project-meta-${project.id}`,
            JSON.stringify({
              name: data.name,
              address: data.address,
              clientName: data.clientName,
              buildingType: data.buildingType,
              selectedTrades: data.selectedTrades,
              inputMethod: data.inputMethod,
            })
          );

          // Store PDFs in IndexedDB for the workspace to load
          if (data.inputMethod === 'plans' && data.files.length > 0) {
            await storePdfFiles(project.id, data.files);
          }
          router.push(`/project/${project.id}`);
          return;
        }
      }

      // No auth / no Supabase — use a local project ID
      const localId = `local-${Date.now().toString(36)}`;
      await goLocal(localId);
    } catch (err) {
      console.error('Failed to create project:', err);
      const localId = `local-${Date.now().toString(36)}`;
      await goLocal(localId);
    }
  };

  return (
    <div className="px-8 py-8">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Projects
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">
        Create New Project
      </h1>
      <CreateProjectWizard onComplete={handleComplete} />
    </div>
  );
}
