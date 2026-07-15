-- Hotfix: admins could not update their own profile row.
--
-- The original owner-update policy carried "with check (is_admin = false)"
-- to block privilege escalation, but WITH CHECK evaluates the row as it is
-- being written - for an account that already has is_admin = true, EVERY
-- self-update failed (including claiming a username in /setup).
--
-- Fix: relax the policy to plain ownership, and move the escalation guard
-- into the identity-protection trigger, where OLD vs NEW can actually be
-- compared.

drop policy "profiles: owner can update" on public.profiles;

create policy "profiles: owner can update"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.protect_identity_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  -- Privilege escalation guard (moved here from the update policy).
  if new.is_admin is distinct from old.is_admin then
    raise exception 'is_admin cannot be changed';
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
