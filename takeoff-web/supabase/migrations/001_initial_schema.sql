-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  address text default '',
  client_name text default '',
  building_type text default 'residential',
  status text default 'draft' check (status in ('draft', 'analyzing', 'in_progress', 'complete')),
  building_model jsonb,
  thumbnail_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists project_files (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  file_name text not null,
  storage_path text not null,
  file_type text not null check (file_type in ('pdf', 'png', 'xlsx')),
  page_number int,
  file_size bigint default 0,
  created_at timestamptz default now()
);

create table if not exists line_items (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  trade text not null,
  category text not null,
  description text not null,
  quantity float8 not null default 0,
  unit text not null default 'ea',
  material_unit_cost float8 default 0,
  material_total float8 default 0,
  labor_hours float8 default 0,
  labor_rate float8 default 0,
  labor_total float8 default 0,
  line_total float8 default 0,
  user_unit_cost float8,
  user_labor_rate_pct float8,
  user_unit_price float8,
  sort_order int default 0,
  is_user_added boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists chat_messages (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

create table if not exists cost_profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  is_default boolean default false,
  costs jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- INDEXES
-- ============================================

create index if not exists idx_projects_user_id on projects(user_id);
create index if not exists idx_projects_status on projects(status);
create index if not exists idx_line_items_project_id on line_items(project_id);
create index if not exists idx_line_items_trade on line_items(trade);
create index if not exists idx_chat_messages_project_id on chat_messages(project_id);
create index if not exists idx_cost_profiles_user_id on cost_profiles(user_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table projects enable row level security;
alter table project_files enable row level security;
alter table line_items enable row level security;
alter table chat_messages enable row level security;
alter table cost_profiles enable row level security;

-- Projects: users can only access their own
create policy "Users select own projects" on projects for select using (auth.uid() = user_id);
create policy "Users insert own projects" on projects for insert with check (auth.uid() = user_id);
create policy "Users update own projects" on projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own projects" on projects for delete using (auth.uid() = user_id);

-- Project files: users can only access files in their own projects
create policy "Users select own project files" on project_files for select using (project_id in (select id from projects where user_id = auth.uid()));
create policy "Users insert own project files" on project_files for insert with check (project_id in (select id from projects where user_id = auth.uid()));
create policy "Users update own project files" on project_files for update using (project_id in (select id from projects where user_id = auth.uid()));
create policy "Users delete own project files" on project_files for delete using (project_id in (select id from projects where user_id = auth.uid()));

-- Line items: users can only access line items in their own projects
create policy "Users select own line items" on line_items for select using (project_id in (select id from projects where user_id = auth.uid()));
create policy "Users insert own line items" on line_items for insert with check (project_id in (select id from projects where user_id = auth.uid()));
create policy "Users update own line items" on line_items for update using (project_id in (select id from projects where user_id = auth.uid()));
create policy "Users delete own line items" on line_items for delete using (project_id in (select id from projects where user_id = auth.uid()));

-- Chat messages: users can only access messages in their own projects
create policy "Users select own chat messages" on chat_messages for select using (project_id in (select id from projects where user_id = auth.uid()));
create policy "Users insert own chat messages" on chat_messages for insert with check (project_id in (select id from projects where user_id = auth.uid()));
create policy "Users update own chat messages" on chat_messages for update using (project_id in (select id from projects where user_id = auth.uid()));
create policy "Users delete own chat messages" on chat_messages for delete using (project_id in (select id from projects where user_id = auth.uid()));

-- Cost profiles: users can only access their own
create policy "Users select own cost profiles" on cost_profiles for select using (auth.uid() = user_id);
create policy "Users insert own cost profiles" on cost_profiles for insert with check (auth.uid() = user_id);
create policy "Users update own cost profiles" on cost_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own cost profiles" on cost_profiles for delete using (auth.uid() = user_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

create trigger line_items_updated_at
  before update on line_items
  for each row execute function update_updated_at();

create trigger cost_profiles_updated_at
  before update on cost_profiles
  for each row execute function update_updated_at();
