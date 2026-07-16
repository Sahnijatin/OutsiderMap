-- Friends: directional requests (requester -> addressee) with an unordered
-- unique pair, so duplicates and mutual-request races are impossible at the
-- schema level while the pending UI still knows who asked whom.

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester <> addressee)
);

create unique index friendships_pair_uniq
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_requester_idx on public.friendships (requester, status);
create index friendships_addressee_idx on public.friendships (addressee, status);

alter table public.friendships enable row level security;

create policy "friendships: participants can read"
  on public.friendships for select
  using (requester = auth.uid() or addressee = auth.uid());

create policy "friendships: requester can create pending"
  on public.friendships for insert
  with check (requester = auth.uid() and status = 'pending');

create policy "friendships: addressee can accept"
  on public.friendships for update
  using (addressee = auth.uid())
  with check (addressee = auth.uid() and status = 'accepted');

-- Decline, cancel and unfriend are all the same verb.
create policy "friendships: either side can remove"
  on public.friendships for delete
  using (requester = auth.uid() or addressee = auth.uid());

-- RLS with-check cannot compare OLD and NEW; a trigger pins the pair and
-- forbids un-accepting (protect_identity_columns pattern, migration 09).
create or replace function public.protect_friendship_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if new.requester is distinct from old.requester
     or new.addressee is distinct from old.addressee then
    raise exception 'friendship parties are immutable';
  end if;
  if old.status = 'accepted' and new.status = 'pending' then
    raise exception 'friendships cannot be un-accepted';
  end if;
  if new.status = 'accepted' and old.status = 'pending' then
    new.responded_at := now();
  end if;
  return new;
end;
$$;

create trigger protect_friendship_columns
  before update on public.friendships
  for each row execute function public.protect_friendship_columns();

-- Profiles RLS is owner-or-admin select, so member search and friend display
-- go through narrow security-definer functions exposing only public fields
-- (username_available precedent, migration 09).

create or replace function public.search_members(q text)
returns table (id uuid, username citext, display_name text, outsider_number int)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name, p.outsider_number
  from public.profiles p
  where auth.uid() is not null
    and p.username is not null
    and p.id <> auth.uid()
    and length(regexp_replace(lower(q), '[^a-z0-9_]', '', 'g')) >= 2
    and p.username::text like (regexp_replace(lower(q), '[^a-z0-9_]', '', 'g') || '%')
  order by p.username
  limit 10;
$$;

-- Slim public identity for a bounded id list - used to render friend rows.
-- Restricted to ids that share a friendship row with the caller, so it can't
-- be used to walk arbitrary profiles.
create or replace function public.get_public_profiles(ids uuid[])
returns table (id uuid, username citext, display_name text, outsider_number int)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name, p.outsider_number
  from public.profiles p
  where auth.uid() is not null
    and p.id = any(ids)
    and exists (
      select 1 from public.friendships f
      where (f.requester = auth.uid() and f.addressee = p.id)
         or (f.addressee = auth.uid() and f.requester = p.id)
    );
$$;

-- Exact-match lookup for sending a request by username. Returns at most one
-- row; the same slim shape as search.
create or replace function public.find_member_by_username(candidate citext)
returns table (id uuid, username citext, display_name text, outsider_number int)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name, p.outsider_number
  from public.profiles p
  where auth.uid() is not null
    and p.username = candidate
    and p.id <> auth.uid()
  limit 1;
$$;
