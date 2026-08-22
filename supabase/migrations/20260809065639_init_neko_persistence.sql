-- NEKO.ID persistence v1
-- Stores authenticated user profiles, cats, generated personas, cat voices,
-- and a private Supabase Storage bucket for user-owned media.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_object_key text,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  gender text not null check (gender in ('小公猫', '小母猫')),
  age_stage text not null check (age_stage in ('幼猫', '青年猫', '成熟猫', '资深猫')),
  avatar_object_key text,
  quiz jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cats_id_user_id_unique unique (id, user_id)
);

create table public.cat_personas (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null,
  user_id uuid not null,
  provider text,
  model text,
  type text not null,
  mbti text not null,
  match_score smallint not null check (match_score between 0 and 100),
  monologue text not null,
  analysis text not null,
  owner_role text not null,
  tags text[] not null default '{}'::text[],
  traits jsonb not null default '[]'::jsonb,
  observations jsonb not null default '[]'::jsonb,
  daily_mood text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cat_personas_cat_unique unique (cat_id),
  constraint cat_personas_cat_owner_fk
    foreign key (cat_id, user_id)
    references public.cats(id, user_id)
    on delete cascade
);

create table public.cat_voices (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null,
  user_id uuid not null,
  text text not null check (char_length(trim(text)) > 0),
  analysis text,
  mood text,
  location text,
  tags text[] not null default '{}'::text[],
  media_object_key text,
  media_type text check (media_type is null or media_type in ('photo', 'video')),
  aspect text check (aspect is null or aspect in ('9:16', '4:5', '3:4', '1:1')),
  video_duration text,
  grad text,
  local_time_label text,
  source_provider text,
  source_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cat_voices_cat_owner_fk
    foreign key (cat_id, user_id)
    references public.cats(id, user_id)
    on delete cascade
);

create index cats_user_active_idx
  on public.cats(user_id, updated_at desc)
  where is_active;

create index cat_personas_user_cat_idx
  on public.cat_personas(user_id, cat_id);

create index cat_voices_user_created_idx
  on public.cat_voices(user_id, created_at desc);

create index cat_voices_cat_created_idx
  on public.cat_voices(cat_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public;
revoke execute on function public.set_updated_at() from anon;
revoke execute on function public.set_updated_at() from authenticated;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

create trigger set_cats_updated_at
  before update on public.cats
  for each row
  execute function public.set_updated_at();

create trigger set_cat_personas_updated_at
  before update on public.cat_personas
  for each row
  execute function public.set_updated_at();

create trigger set_cat_voices_updated_at
  before update on public.cat_voices
  for each row
  execute function public.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(coalesce(new.raw_user_meta_data ->> 'name', new.email), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        updated_at = now();

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public;
revoke execute on function private.handle_new_user() from anon;
revoke execute on function private.handle_new_user() from authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.cats enable row level security;
alter table public.cat_personas enable row level security;
alter table public.cat_voices enable row level security;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "cats_select_own"
  on public.cats
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "cats_insert_own"
  on public.cats
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "cats_update_own"
  on public.cats
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "cats_delete_own"
  on public.cats
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "cat_personas_select_own"
  on public.cat_personas
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "cat_personas_insert_own"
  on public.cat_personas
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "cat_personas_update_own"
  on public.cat_personas
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "cat_personas_delete_own"
  on public.cat_personas
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "cat_voices_select_own"
  on public.cat_voices
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "cat_voices_insert_own"
  on public.cat_voices
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "cat_voices_update_own"
  on public.cat_voices
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "cat_voices_delete_own"
  on public.cat_voices
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.cats to authenticated;
grant select, insert, update, delete on public.cat_personas to authenticated;
grant select, insert, update, delete on public.cat_voices to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'neko-media',
  'neko-media',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']::text[]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      updated_at = now();

drop policy if exists "neko_media_select_own" on storage.objects;
create policy "neko_media_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'neko-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "neko_media_insert_own" on storage.objects;
create policy "neko_media_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'neko-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "neko_media_update_own" on storage.objects;
create policy "neko_media_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'neko-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'neko-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "neko_media_delete_own" on storage.objects;
create policy "neko_media_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'neko-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
