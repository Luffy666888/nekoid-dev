create index cat_personas_cat_owner_idx
  on public.cat_personas(cat_id, user_id);

create index cat_voices_cat_owner_idx
  on public.cat_voices(cat_id, user_id);
