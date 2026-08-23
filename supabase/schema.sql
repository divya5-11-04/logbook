-- ============================================================
-- Logbook schema for Supabase (Postgres)
-- Run this in the Supabase SQL editor once, on a fresh project.
-- ============================================================

-- 1. Profiles: one row per authenticated user, created on signup.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  target_role text not null,
  voice text not null default 'direct and understated',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are viewable by owner"
  on profiles for select using (auth.uid() = id);
create policy "profiles are insertable by owner"
  on profiles for insert with check (auth.uid() = id);
create policy "profiles are updatable by owner"
  on profiles for update using (auth.uid() = id);

-- 2. Job categories: no longer a hardcoded list of 5 — an open, growing table.
-- Seeded with the categories from the base dataset; anyone can propose a new one
-- when adding a posting from the UI.
create table if not exists categories (
  id serial primary key,
  slug text unique not null,          -- e.g. 'information-technology'
  label text not null                 -- e.g. 'Information Technology'
);

-- 3. Job postings: the growing dataset. is_seed = true for the original Kaggle
-- import; false for postings users add through the app. Attributed to the user
-- who added it, but readable by everyone (it's shared, aggregate data).
create table if not exists job_postings (
  id bigserial primary key,
  category_id int not null references categories(id),
  title text not null,
  skills text[] not null default '{}',
  is_seed boolean not null default false,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists job_postings_category_idx on job_postings(category_id);

alter table job_postings enable row level security;

create policy "job postings are viewable by anyone signed in"
  on job_postings for select using (auth.role() = 'authenticated');
create policy "signed-in users can add job postings"
  on job_postings for insert with check (auth.uid() = added_by);

-- 4. Entries: a user's logged accomplishments. Private to the owner.
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text not null,
  domain text not null,
  skills text[] not null default '{}',
  impact_metric text default '',
  post text not null,
  resume_bullet text not null,
  created_at timestamptz not null default now()
);

create index if not exists entries_user_idx on entries(user_id);

alter table entries enable row level security;

create policy "entries are viewable by owner"
  on entries for select using (auth.uid() = user_id);
create policy "entries are insertable by owner"
  on entries for insert with check (auth.uid() = user_id);
create policy "entries are deletable by owner"
  on entries for delete using (auth.uid() = user_id);

-- 5. Auto-create a profiles row when a new auth user completes signup.
-- name/target_role/voice come from the signup form via raw_user_meta_data.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, target_role, voice)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'New user'),
    coalesce(new.raw_user_meta_data->>'target_role', 'Not set'),
    coalesce(new.raw_user_meta_data->>'voice', 'direct and understated')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- 6. Seed categories (extendable — the app lets users type a new one too).
insert into categories (slug, label) values
  ('information-technology', 'Information Technology'),
  ('business-development', 'Business Development'),
  ('finance', 'Finance'),
  ('hr', 'HR'),
  ('sales', 'Sales'),
  ('marketing', 'Marketing'),
  ('design', 'Design'),
  ('operations', 'Operations'),
  ('legal', 'Legal'),
  ('healthcare', 'Healthcare'),
  ('education', 'Education'),
  ('customer-success', 'Customer Success')
on conflict (slug) do nothing;

-- 7. A view that pre-aggregates skill frequency per category, so the growth
-- endpoint doesn't have to scan job_postings on every request.
create or replace view category_skill_counts
with (security_invoker = true) as
select
  c.slug as category_slug,
  c.label as category_label,
  skill,
  count(*) as skill_count,
  (select count(*) from job_postings jp2 where jp2.category_id = c.id) as category_job_count
from job_postings jp
join categories c on c.id = jp.category_id
cross join lateral unnest(jp.skills) as skill
group by c.slug, c.label, skill;
