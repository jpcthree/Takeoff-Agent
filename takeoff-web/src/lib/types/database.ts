export type ProjectStatus = 'draft' | 'analyzing' | 'in_progress' | 'complete';
export type FileType = 'pdf' | 'png' | 'xlsx';
export type ChatRole = 'user' | 'assistant' | 'system';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  address: string;
  client_name: string;
  building_type: string;
  status: ProjectStatus;
  building_model: Record<string, any> | null;
  thumbnail_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  file_name: string;
  storage_path: string;
  file_type: FileType;
  page_number: number | null;
  file_size: number;
  created_at: string;
}

export interface LineItem {
  id: string;
  project_id: string;
  trade: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  material_unit_cost: number;
  material_total: number;
  labor_hours: number;
  labor_rate: number;
  labor_total: number;
  line_total: number;
  user_unit_cost: number | null;
  user_labor_rate_pct: number | null;
  user_unit_price: number | null;
  sort_order: number;
  is_user_added: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  project_id: string;
  role: ChatRole;
  content: string;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface CostProfile {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  costs: Record<string, any>;
  created_at: string;
  updated_at: string;
}
