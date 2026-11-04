-- Per-user sync records. Public card catalogue remains bundled/reference data.
create table if not exists public.user_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id text not null,
  record_type text not null check (record_type in ('app_state','holding','profile','goal','spend','preference','aura_history')),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, record_id)
);
alter table public.user_data enable row level security;
alter table public.user_data force row level security;
revoke all on public.user_data from anon;
grant select, insert, update, delete on public.user_data to authenticated;
drop policy if exists user_data_select_own on public.user_data;
drop policy if exists user_data_insert_own on public.user_data;
drop policy if exists user_data_update_own on public.user_data;
drop policy if exists user_data_delete_own on public.user_data;
create policy user_data_select_own on public.user_data for select to authenticated using ((select auth.uid()) = user_id);
create policy user_data_insert_own on public.user_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_data_update_own on public.user_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_data_delete_own on public.user_data for delete to authenticated using ((select auth.uid()) = user_id);
create index if not exists user_data_updated_idx on public.user_data (user_id, updated_at);
