alter table public.cat_voices
  add column if not exists subtext text;

comment on column public.cat_voices.subtext is
  'Short restrained thought shown between behavior tags and the AI interpretation.';
