create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text not null default 'Student',
  registration_number text,
  course text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.papers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  unit_code text,
  unit_name text,
  course text,
  exam_type text not null default 'Uncategorized',
  year integer not null check (year between 1900 and 2100),
  file_name text not null,
  file_type text not null check (file_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  storage_path text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  rejection_reason text,
  download_count integer not null default 0,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists papers_status_created_at_idx on public.papers(status, created_at desc);
create index if not exists papers_uploader_created_at_idx on public.papers(uploader_id, created_at desc);
create index if not exists papers_filter_idx on public.papers(course, year, exam_type);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, registration_number)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), 'Student'),
    nullif(new.raw_user_meta_data ->> 'registration_number', '')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.papers enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select (id, name, course) on table public.profiles to anon, authenticated;
revoke all on table public.papers from anon, authenticated;
grant select on table public.papers to anon, authenticated;
grant insert on table public.papers to authenticated;

drop policy if exists "Profiles are readable" on public.profiles;
create policy "Profiles are readable" on public.profiles
  for select to anon, authenticated using (true);

drop policy if exists "Approved papers are public" on public.papers;
create policy "Approved papers are public" on public.papers
  for select to anon, authenticated using (status = 'APPROVED');

drop policy if exists "Owners can read their papers" on public.papers;
create policy "Owners can read their papers" on public.papers
  for select to authenticated using (uploader_id = auth.uid());

drop policy if exists "Authenticated users submit pending papers" on public.papers;
create policy "Authenticated users submit pending papers" on public.papers
  for insert to authenticated
  with check (uploader_id = auth.uid() and status = 'PENDING');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('papers', 'papers', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 20971520,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Users upload to their own folder" on storage.objects;
create policy "Users upload to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'papers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users read approved or own papers" on storage.objects;
create policy "Users read approved or own papers" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'papers'
    and exists (
      select 1 from public.papers paper
      where paper.storage_path = name
        and (paper.status = 'APPROVED' or paper.uploader_id = auth.uid())
    )
  );

drop policy if exists "Users delete their own files" on storage.objects;
create policy "Users delete their own files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'papers'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (select 1 from public.papers paper where paper.storage_path = name)
  );