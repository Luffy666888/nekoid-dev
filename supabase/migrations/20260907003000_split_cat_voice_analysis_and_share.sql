alter table public.cat_voices
  add column if not exists analysis_summary text,
  add column if not exists personality_interpretation text,
  add column if not exists share_headline text,
  add column if not exists share_insight text,
  add column if not exists share_tags text[] not null default '{}'::text[];

comment on column public.cat_voices.analysis is
  'Legacy combined analysis retained for backward compatibility.';
comment on column public.cat_voices.analysis_summary is
  'Objective visual and behavioral analysis for result-page reading.';
comment on column public.cat_voices.personality_interpretation is
  'Interpretation connecting observed behavior to the saved cat persona.';
comment on column public.cat_voices.share_headline is
  'Short, social-first headline generated in the same AI request.';
comment on column public.cat_voices.share_insight is
  'Short explanation used by native and web share cards.';
comment on column public.cat_voices.share_tags is
  'Dynamic persona and scene tags generated for sharing.';
