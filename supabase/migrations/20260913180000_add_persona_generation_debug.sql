alter table public.cat_personas
  add column if not exists generation_id text,
  add column if not exists input_hash text,
  add column if not exists prompt_version jsonb not null default '{}'::jsonb,
  add column if not exists generation_input jsonb,
  add column if not exists stage_outputs jsonb not null default '{}'::jsonb,
  add column if not exists eval_result jsonb,
  add column if not exists stage_logs jsonb not null default '[]'::jsonb,
  add column if not exists generation_model text,
  add column if not exists generation_retry_count integer not null default 0;

create index if not exists cat_personas_generation_id_idx
  on public.cat_personas(generation_id)
  where generation_id is not null;

create index if not exists cat_personas_input_hash_idx
  on public.cat_personas(input_hash)
  where input_hash is not null;

comment on column public.cat_personas.generation_id is
  'Unique id for one persona generation pipeline run.';

comment on column public.cat_personas.input_hash is
  'Stable hash of the persona generation input snapshot.';

comment on column public.cat_personas.prompt_version is
  'Per-stage prompt versions used by the persona generation pipeline.';

comment on column public.cat_personas.generation_input is
  'Debug-only persona generation input snapshot. Do not expose in production UI.';

comment on column public.cat_personas.stage_outputs is
  'Persona generation intermediate outputs for stage 1, stage 2, and stage 3.';

comment on column public.cat_personas.eval_result is
  'Persona generation evaluation scores and fatal-rule results.';

comment on column public.cat_personas.stage_logs is
  'Per-stage provider, model, latency, output, retry and error metadata.';
