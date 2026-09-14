alter table public.cat_voices
  drop constraint if exists cat_voices_aspect_check;

alter table public.cat_voices
  add constraint cat_voices_aspect_check
  check (aspect is null or aspect in ('9:16', '4:5', '4:3', '3:4', '1:1'));
