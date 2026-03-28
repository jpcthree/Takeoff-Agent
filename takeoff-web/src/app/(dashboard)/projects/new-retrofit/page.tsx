'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  CreateProjectWizard,
  type ProjectFormData,
} from '@/components/projects/CreateProjectWizard';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export default function NewRetrofitPage() {
  const router = useRouter();

  const handleComplete = async (data: ProjectFormData) => {
    const goLocal = async (id: string) => {
      sessionStorage.setItem(
        `project-meta-${id}`,
        JSON.stringify({
          name: data.name,
          address: data.address,
          clientName: data.clientName,
          buildingType: data.buildingType,
          selectedTrades: data.selectedTrades,
          inputMethod: 'address',
        })
      );
      router.push(`/project/${id}`);
    };

    try {
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

          sessionStorage.setItem(
            `project-meta-${project.id}`,
            JSON.stringify({
              name: data.name,
              address: data.address,
              clientName: data.clientName,
              buildingType: data.buildingType,
              selectedTrades: data.selectedTrades,
              inputMethod: 'address',
            })
          );

          router.push(`/project/${project.id}`);
          return;
        }
      }

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
        onClick={() => router.push('/retrofit')}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Retrofit Estimator
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">
        New Retrofit Estimate
      </h1>
      <CreateProjectWizard mode="retrofit" onComplete={handleComplete} />
    </div>
  );
}
