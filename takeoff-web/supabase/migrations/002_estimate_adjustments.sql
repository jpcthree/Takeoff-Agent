-- ============================================
-- ESTIMATE ADJUSTMENTS TABLE
-- Tracks user/chat corrections to line items
-- for the learning loop.
-- ============================================

create table if not exists estimate_adjustments (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  trade text not null,
  item_description text not null,
  field_changed text not null,          -- 'quantity', 'unitCost', 'unitPrice', 'laborRatePct'
  original_value float8,
  new_value float8,
  source text not null default 'user',  -- 'user' | 'chat' | 'import'
  reason text,                          -- optional explanation from chat
  created_at timestamptz default now()
);

create index if not exists idx_adjustments_project on estimate_adjustments(project_id);
create index if not exists idx_adjustments_trade on estimate_adjustments(trade);

-- RLS
alter table estimate_adjustments enable row level security;

create policy "Users select own adjustments"
  on estimate_adjustments for select
  using (project_id in (select id from projects where user_id = auth.uid()));

create policy "Users insert own adjustments"
  on estimate_adjustments for insert
  with check (project_id in (select id from projects where user_id = auth.uid()));

create policy "Users delete own adjustments"
  on estimate_adjustments for delete
  using (project_id in (select id from projects where user_id = auth.uid()));

-- ============================================
-- ADD input_method COLUMN TO PROJECTS TABLE
-- Tracks whether project uses plans or address
-- ============================================

alter table projects add column if not exists input_method text default 'plans'
  check (input_method in ('plans', 'address'));

-- ============================================
-- ADD property_data COLUMN TO PROJECTS TABLE
-- Stores the full property lookup result as JSON
-- ============================================

alter table projects add column if not exists property_data jsonb;
alter table projects add column if not exists assumptions jsonb;
