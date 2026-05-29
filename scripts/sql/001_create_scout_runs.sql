create table if not exists scout_runs (
  run_id text primary key,
  schema_version integer not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  queued_at timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz,
  attempt_count integer not null default 0,
  worker_stage text,
  worker_id text,
  worker_note text,
  last_error_message text,
  raw_query text not null,
  normalized_query text not null,
  market_term text not null,
  categories text[] not null default '{}',
  location_label text,
  location_city text,
  location_region text,
  search_query text not null,
  search_provider text,
  search_source text,
  sample_quality text check (
    sample_quality is null
    or sample_quality in ('strong_sample', 'adequate_sample', 'partial_sample', 'weak_sample')
  ),
  acquisition jsonb,
  selected_candidates jsonb not null default '[]'::jsonb,
  business_results jsonb,
  shortlist jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  error_message text,
  persistence_metadata jsonb not null default '{}'::jsonb
);

create table if not exists scout_worker_heartbeats (
  worker_id text primary key,
  heartbeat_at timestamptz not null default now(),
  note text not null default ''
);

alter table scout_runs add column if not exists queued_at timestamptz;
alter table scout_runs add column if not exists started_at timestamptz;
alter table scout_runs add column if not exists finished_at timestamptz;
alter table scout_runs add column if not exists heartbeat_at timestamptz;
alter table scout_runs add column if not exists attempt_count integer not null default 0;
alter table scout_runs add column if not exists worker_stage text;
alter table scout_runs add column if not exists worker_id text;
alter table scout_runs add column if not exists worker_note text;
alter table scout_runs add column if not exists last_error_message text;

update scout_runs
set
  queued_at = coalesce(queued_at, created_at),
  started_at = coalesce(
    started_at,
    case when status in ('running', 'completed', 'failed') then created_at else null end
  ),
  finished_at = coalesce(
    finished_at,
    case when status in ('completed', 'failed') then updated_at else null end
  ),
  heartbeat_at = coalesce(
    heartbeat_at,
    case when status in ('running', 'completed', 'failed') then updated_at else queued_at end
  ),
  attempt_count = case
    when attempt_count > 0 then attempt_count
    when status = 'queued' then 0
    else 1
  end,
  worker_stage = coalesce(
    worker_stage,
    case
      when status = 'queued' then 'queued'
      when status = 'running' then 'starting'
      when status = 'completed' then 'completed'
      when status = 'failed' then 'failed'
      else null
    end
  ),
  worker_note = coalesce(
    worker_note,
    case
      when status = 'queued' then 'Run stored and waiting for a worker.'
      when status = 'running' then 'Worker picked up the run and is processing it.'
      when status = 'completed' then 'Run completed and report saved.'
      when status = 'failed' then coalesce(error_message, 'Scout run failed.')
      else null
    end
  ),
  last_error_message = coalesce(last_error_message, error_message)
where true;

create index if not exists scout_runs_created_at_idx on scout_runs (created_at desc);
create index if not exists scout_runs_status_created_at_idx on scout_runs (status, created_at desc);

create table if not exists scout_outreach_drafts (
  draft_id text primary key,
  run_id text not null references scout_runs (run_id) on delete cascade,
  candidate_id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  business_name text not null,
  primary_url text not null,
  tone text not null check (tone in ('calm', 'direct', 'friendly')),
  draft_length text not null check (draft_length in ('brief', 'standard')),
  recommended_channel text check (
    recommended_channel is null
    or recommended_channel in ('email', 'contact_form', 'phone', 'facebook_dm', 'instagram_dm', 'linkedin_message', 'website')
  ),
  contact_channels jsonb not null default '[]'::jsonb,
  contact_rationale jsonb not null default '[]'::jsonb,
  subject_line text not null,
  body text not null,
  short_message text,
  phone_talking_points jsonb,
  grounding jsonb not null default '[]'::jsonb,
  model text,
  unique (run_id, candidate_id)
);

alter table scout_outreach_drafts add column if not exists recommended_channel text;
alter table scout_outreach_drafts add column if not exists contact_channels jsonb not null default '[]'::jsonb;
alter table scout_outreach_drafts add column if not exists contact_rationale jsonb not null default '[]'::jsonb;
alter table scout_outreach_drafts add column if not exists short_message text;
alter table scout_outreach_drafts add column if not exists phone_talking_points jsonb;

create index if not exists scout_outreach_drafts_run_updated_idx
  on scout_outreach_drafts (run_id, updated_at desc);

create table if not exists scout_lead_annotations (
  run_id text not null references scout_runs (run_id) on delete cascade,
  candidate_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  state text not null default 'needs_review' check (
    state in ('needs_review', 'saved', 'contacted', 'dismissed', 'not_a_fit')
  ),
  operator_note text not null default '',
  follow_up_date date,
  primary key (run_id, candidate_id)
);

alter table scout_lead_annotations add column if not exists state text not null default 'needs_review';
alter table scout_lead_annotations add column if not exists operator_note text not null default '';
alter table scout_lead_annotations add column if not exists follow_up_date date;

create index if not exists scout_lead_annotations_run_updated_idx
  on scout_lead_annotations (run_id, updated_at desc);

create index if not exists scout_lead_annotations_updated_idx
  on scout_lead_annotations (updated_at desc);

create table if not exists scout_outreach_profiles (
  profile_id text primary key,
  updated_at timestamptz not null,
  sender_name text not null default '',
  company_name text not null default 'tenra',
  role_title text not null default '',
  service_line text not null default '',
  service_summary text not null default '',
  default_call_to_action text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  website_url text not null default '',
  scheduler_url text not null default '',
  tone_notes text not null default '',
  avoid_phrases jsonb not null default '[]'::jsonb,
  signature text not null default ''
);

alter table scout_outreach_profiles add column if not exists sender_name text not null default '';
alter table scout_outreach_profiles add column if not exists updated_at timestamptz not null default now();
alter table scout_outreach_profiles add column if not exists company_name text not null default 'tenra';
alter table scout_outreach_profiles alter column company_name set default 'tenra';
alter table scout_outreach_profiles add column if not exists role_title text not null default '';
alter table scout_outreach_profiles add column if not exists service_line text not null default '';
alter table scout_outreach_profiles add column if not exists service_summary text not null default '';
alter table scout_outreach_profiles add column if not exists default_call_to_action text not null default '';
alter table scout_outreach_profiles add column if not exists contact_email text not null default '';
alter table scout_outreach_profiles add column if not exists contact_phone text not null default '';
alter table scout_outreach_profiles add column if not exists website_url text not null default '';
alter table scout_outreach_profiles add column if not exists scheduler_url text not null default '';
alter table scout_outreach_profiles add column if not exists tone_notes text not null default '';
alter table scout_outreach_profiles add column if not exists avoid_phrases jsonb not null default '[]'::jsonb;
alter table scout_outreach_profiles add column if not exists signature text not null default '';

create index if not exists scout_outreach_profiles_updated_idx
  on scout_outreach_profiles (updated_at desc);
