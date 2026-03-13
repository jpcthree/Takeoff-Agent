'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  CreateProjectWizard,
  type ProjectFormData,
} from '@/components/projects/CreateProjectWizard';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export default function NewProjectPage() {
  const router = useRouter();

  const handleComplete = async (data: ProjectFormData) => {
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
          router.push(`/project/${project.id}`);
          return;
        }
      }

      // No auth / no Supabase — use a local project ID and store meta in sessionStorage
      const localId = `local-${Date.now().toString(36)}`;
      sessionStorage.setItem(
        `project-meta-${localId}`,
        JSON.stringify({
          name: data.name,
          address: data.address,
          clientName: data.clientName,
          buildingType: data.buildingType,
        })
      );
      router.push(`/project/${localId}`);
    } catch (err) {
      console.error('Failed to create project:', err);
      // Fallback to local project on any error
      const localId = `local-${Date.now().toString(36)}`;
      sessionStorage.setItem(
        `project-meta-${localId}`,
        JSON.stringify({
          name: data.name,
          address: data.address,
          clientName: data.clientName,
          buildingType: data.buildingType,
        })
      );
      router.push(`/project/${localId}`);
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
