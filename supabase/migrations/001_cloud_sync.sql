begin;

create table if not exists public.app_sync_state (
  workspace_id uuid primary key,
  revision bigint not null default 0 check (revision >= 0),
  schema_version integer not null default 1 check (schema_version = 1),
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'bootstrap'
);

create table if not exists public.app_sync_history (
  workspace_id uuid not null,
  revision bigint not null,
  schema_version integer not null check (schema_version = 1),
  snapshot jsonb not null,
  saved_at timestamptz not null default now(),
  saved_by text not null,
  primary key (workspace_id, revision)
);

create index if not exists app_sync_history_workspace_revision_idx
  on public.app_sync_history (workspace_id, revision desc);

insert into public.app_sync_state (
  workspace_id,
  revision,
  schema_version,
  snapshot,
  updated_by
)
values (
  'd56cc0d5-623c-40f0-8f66-12e56688bc54',
  0,
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'app', 'wangzhe-account-manager-cloud-sync',
    'workspaceId', 'd56cc0d5-623c-40f0-8f66-12e56688bc54',
    'generatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'nodes', jsonb_build_object(
      'root', jsonb_build_object(
        'id', 'root',
        'type', 'group',
        'parentId', null,
        'position', 0,
        'updatedAt', 0,
        'updatedBy', 'bootstrap',
        'data', jsonb_build_object('name', '全部账号', 'createdAt', 0)
      )
    ),
    'tombstones', '{}'::jsonb
  ),
  'bootstrap'
)
on conflict (workspace_id) do nothing;

alter table public.app_sync_state enable row level security;
alter table public.app_sync_history enable row level security;

drop policy if exists app_sync_state_fixed_workspace_read on public.app_sync_state;
create policy app_sync_state_fixed_workspace_read
  on public.app_sync_state
  for select
  to anon
  using (workspace_id = 'd56cc0d5-623c-40f0-8f66-12e56688bc54'::uuid);

drop policy if exists app_sync_history_fixed_workspace_read on public.app_sync_history;
create policy app_sync_history_fixed_workspace_read
  on public.app_sync_history
  for select
  to anon
  using (workspace_id = 'd56cc0d5-623c-40f0-8f66-12e56688bc54'::uuid);

revoke all on public.app_sync_state from anon, authenticated;
revoke all on public.app_sync_history from anon, authenticated;
grant select on public.app_sync_state to anon;
grant select on public.app_sync_history to anon;

create or replace function public.save_wangzhe_sync_state(
  p_workspace_id uuid,
  p_expected_revision bigint,
  p_schema_version integer,
  p_snapshot jsonb,
  p_device_id text
)
returns table (
  workspace_id uuid,
  revision bigint,
  schema_version integer,
  snapshot jsonb,
  updated_at timestamptz,
  updated_by text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_row public.app_sync_state%rowtype;
  next_revision bigint;
begin
  if p_workspace_id <> 'd56cc0d5-623c-40f0-8f66-12e56688bc54'::uuid then
    raise exception using
      errcode = '42501',
      message = 'workspace is not allowed';
  end if;
  if p_schema_version <> 1 then
    raise exception using
      errcode = '22023',
      message = 'unsupported schema version';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'snapshot must be a JSON object';
  end if;
  if octet_length(p_snapshot::text) > 2097152 then
    raise exception using
      errcode = '22001',
      message = 'snapshot exceeds 2MB';
  end if;
  if coalesce(length(btrim(p_device_id)), 0) = 0 or length(p_device_id) > 160 then
    raise exception using
      errcode = '22023',
      message = 'device id is invalid';
  end if;

  select *
    into current_row
    from public.app_sync_state
    where app_sync_state.workspace_id = p_workspace_id
    for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'workspace state does not exist';
  end if;
  if current_row.revision <> p_expected_revision then
    raise exception using
      errcode = '40001',
      message = format(
        'revision mismatch: expected %s, current %s',
        p_expected_revision,
        current_row.revision
      );
  end if;

  next_revision := current_row.revision + 1;

  insert into public.app_sync_history (
    workspace_id,
    revision,
    schema_version,
    snapshot,
    saved_at,
    saved_by
  )
  values (
    current_row.workspace_id,
    current_row.revision,
    current_row.schema_version,
    current_row.snapshot,
    current_row.updated_at,
    current_row.updated_by
  )
  on conflict (workspace_id, revision) do nothing;

  update public.app_sync_state
    set revision = next_revision,
        schema_version = p_schema_version,
        snapshot = p_snapshot,
        updated_at = now(),
        updated_by = p_device_id
    where app_sync_state.workspace_id = p_workspace_id
    returning
      app_sync_state.workspace_id,
      app_sync_state.revision,
      app_sync_state.schema_version,
      app_sync_state.snapshot,
      app_sync_state.updated_at,
      app_sync_state.updated_by
    into current_row;

  delete from public.app_sync_history
    where app_sync_history.workspace_id = p_workspace_id
      and app_sync_history.revision not in (
        select retained.revision
          from public.app_sync_history as retained
          where retained.workspace_id = p_workspace_id
          order by retained.revision desc
          limit 50
      );

  return query
  select
    current_row.workspace_id,
    current_row.revision,
    current_row.schema_version,
    current_row.snapshot,
    current_row.updated_at,
    current_row.updated_by;
end;
$function$;

revoke all on function public.save_wangzhe_sync_state(
  uuid,
  bigint,
  integer,
  jsonb,
  text
) from public, authenticated;
grant execute on function public.save_wangzhe_sync_state(
  uuid,
  bigint,
  integer,
  jsonb,
  text
) to anon;

do $block$
begin
  if not exists (
    select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'app_sync_state'
  ) then
    alter publication supabase_realtime add table public.app_sync_state;
  end if;
end;
$block$;

commit;
