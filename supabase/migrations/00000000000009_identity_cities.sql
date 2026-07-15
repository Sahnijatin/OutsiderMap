-- Outsider pivot, part 1: member identity + multi-city foundation.
--
-- Every member gets a permanent sequential outsider number (assigned at
-- signup, never reassigned, never editable) and a unique username chosen
-- during setup. Cities become data instead of a hardcoded 'delhi' literal.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- cities — launch markets. A city being "live" gates where the map, chat and
-- quests operate; Delhi is the first. Areas feed intent parsing per city.
-- ---------------------------------------------------------------------------

create table public.cities (
  slug text primary key,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  zoom double precision not null default 11.5,
  is_live boolean not null default false,
  areas text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.cities enable row level security;

create policy "cities: readable by everyone"
  on public.cities for select
  using (true);

create policy "cities: admin can write"
  on public.cities for all
  using (public.is_admin())
  with check (public.is_admin());

insert into public.cities (slug, name, lat, lng, zoom, is_live, areas)
values (
  'delhi', 'Delhi', 28.6139, 77.2090, 11.2, true,
  array[
    'Connaught Place', 'Khan Market', 'Hauz Khas', 'Shahpur Jat',
    'Champa Gali', 'Lodhi Colony', 'Mehrauli', 'Greater Kailash', 'Saket',
    'Vasant Kunj', 'Old Delhi', 'Karol Bagh', 'Lajpat Nagar', 'Nizamuddin',
    'Majnu ka Tilla', 'Paharganj', 'Defence Colony', 'Green Park',
    'Kamla Nagar', 'Aerocity', 'Gurgaon', 'Noida'
  ]
);

-- ---------------------------------------------------------------------------
-- profiles: outsider number + username + home city
-- ---------------------------------------------------------------------------

create sequence public.outsider_number_seq start 1;

alter table public.profiles
  add column outsider_number int unique,
  add column username citext unique
    check (username is null or username::text ~ '^[a-z0-9_]{3,20}$'),
  add column home_city text references public.cities(slug) default 'delhi';

-- Numbers are permanent: only the initial assignment (null -> value) is
-- allowed; username may be set once by the owner (null -> value) and after
-- that only the service role (support path) can change it. RLS with-check
-- cannot compare OLD and NEW, so a trigger enforces immutability.
create or replace function public.protect_identity_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if new.outsider_number is distinct from old.outsider_number
     and old.outsider_number is not null then
    raise exception 'outsider_number is permanent';
  end if;
  if new.username is distinct from old.username
     and old.username is not null then
    raise exception 'username can only be set once';
  end if;
  return new;
end;
$$;

create trigger protect_identity_columns
  before update on public.profiles
  for each row execute function public.protect_identity_columns();

-- Assign the outsider number at signup, atomically with profile creation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, outsider_number)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    nextval('public.outsider_number_seq')
  );
  insert into public.subscriptions (user_id) values (new.id);
  return new;
end;
$$;

-- Backfill existing members in join order so the earliest believers get the
-- lowest numbers.
with ordered as (
  select id, row_number() over (order by created_at, id) as rn
  from public.profiles
  where outsider_number is null
)
update public.profiles p
set outsider_number = ordered.rn
from ordered
where p.id = ordered.id;

-- Keep the sequence ahead of everything assigned by the backfill.
select setval(
  'public.outsider_number_seq',
  coalesce((select max(outsider_number) from public.profiles), 0) + 1,
  false
);

-- Usernames are looked up publicly (availability checks, reel badges), but
-- profiles RLS only lets owners/admins read rows. Expose a narrow
-- security-definer availability check instead of widening row access.
create or replace function public.username_available(candidate citext)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.profiles where username = candidate
  );
$$;
