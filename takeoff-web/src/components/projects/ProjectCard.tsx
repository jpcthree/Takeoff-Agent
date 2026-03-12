'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { FileText, MoreVertical, FolderOpen, Copy, Download, Trash2 } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Dropdown, DropdownItem, DropdownDivider } from '@/components/ui/Dropdown';
import type { Project, ProjectStatus } from '@/lib/types/database';

interface ProjectCardProps {
  project: Project;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
}

const statusLabels: Record<ProjectStatus, string> = {
  draft: 'Draft',
  analyzing: 'Analyzing',
  in_progress: 'In Progress',
  complete: 'Complete',
};

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function ProjectCard({ project, onDelete, onDuplicate }: ProjectCardProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/project/${project.id}`);
  };

  return (
    <div
      onClick={handleClick}
      className="group relative bg-white rounded-xl border border-gray-200 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer overflow-hidden"
    >
      {/* Thumbnail placeholder */}
      <div className="relative aspect-video bg-gray-100 flex items-center justify-center">
        <FileText className="h-10 w-10 text-gray-300" />

        {/* 3-dot menu */}
        <div
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Dropdown
            align="right"
            trigger={
              <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 shadow-sm hover:bg-white transition-colors cursor-pointer">
                <MoreVertical className="h-4 w-4 text-gray-600" />
              </button>
            }
          >
            <DropdownItem
              icon={<FolderOpen className="h-4 w-4" />}
              onClick={() => router.push(`/project/${project.id}`)}
            >
              Open
            </DropdownItem>
            <DropdownItem
              icon={<Copy className="h-4 w-4" />}
              onClick={() => onDuplicate?.(project.id)}
            >
              Duplicate
            </DropdownItem>
            <DropdownItem
              icon={<Download className="h-4 w-4" />}
              onClick={() => {}}
            >
              Export
            </DropdownItem>
            <DropdownDivider />
            <DropdownItem
              icon={<Trash2 className="h-4 w-4" />}
              danger
              onClick={() => onDelete?.(project.id)}
            >
              Delete
            </DropdownItem>
          </Dropdown>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-900 truncate">
          {project.name}
        </h3>
        {project.address && (
          <p className="mt-0.5 text-xs text-gray-500 truncate">
            {project.address}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <Badge variant={project.status as BadgeVariant}>
            {statusLabels[project.status]}
          </Badge>
          <span className="text-xs text-gray-400">
            {formatRelativeDate(project.updated_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

export { ProjectCard };
export type { ProjectCardProps };
