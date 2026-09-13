alter table public.cat_personas
  add column if not exists misunderstanding text,
  add column if not exists core_personality text,
  add column if not exists love_language text,
  add column if not exists evidence jsonb not null default '[]'::jsonb;

update public.cat_personas
set misunderstanding = analysis
where misunderstanding is null;
