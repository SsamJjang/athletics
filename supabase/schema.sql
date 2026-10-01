-- =====================================================================
-- GCS Athletics — full schema.
-- Paste into Supabase Studio -> SQL Editor -> Run. Safe to re-run.
-- Then run admins.sql (who the admins are) and, once, seed.sql (sports).
-- =====================================================================

-- Supabase keeps extensions in their own `extensions` schema. Functions
-- below that need one (gen_random_bytes) put that schema on their path.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 0. Who is who.
--
--    school account  = signed in with Google as @gcssongdo.co.kr
--    parent account  = any other address (personal Google or emailed code)
--                      — sees only public content until VERIFIED
--    verified parent = redeemed a one-time code issued by their child's
--                      school account, or was verified by hand by an admin
--    admin           = email is listed in admins.sql
--
--    "Community" (school + verified parents + admins) is who can see
--    athletes, members-only posts, and sign-up lists for their family.
-- ---------------------------------------------------------------------

create or replace function public.school_domain()
returns text language sql immutable as $fn$ select 'gcssongdo.co.kr' $fn$;

-- Placeholder so this file runs on its own. admins.sql replaces it; a
-- re-run of this file must NOT wipe the real list, hence the guard.
-- (An older draft returned citext[]; that version is replaced.)
do $do$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'admin_emails'
       and p.prorettype <> 'text[]'::regtype
  ) then
    drop function public.admin_emails();
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'admin_emails'
  ) then
    execute $f$
      create function public.admin_emails() returns text[]
      language sql stable as $x$ select array[]::text[] $x$
    $f$;
  end if;
end
$do$;

-- The email in the signed JWT, lowercased. Supabase only issues a session
-- after the address is proven (Google says so, or the emailed code was
-- entered). All email comparisons in this file are lowercase text.
drop function if exists public.jwt_email();
create function public.jwt_email()
returns text language sql stable as $fn$
  select lower(nullif(auth.jwt() ->> 'email', ''))
$fn$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce(
    public.jwt_email() = any (select lower(trim(e)) from unnest(public.admin_emails()) as e),
    false
  )
$fn$;

create or replace function public.is_school()
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce(split_part(public.jwt_email(), '@', 2) = public.school_domain(), false)
$fn$;

-- ---------------------------------------------------------------------
-- 1. profiles — one per auth user, created by the trigger in section 2.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users on delete cascade,
  email           text unique not null,   -- always stored lowercase
  full_name       text not null default '',
  avatar_url      text,
  kind            text not null check (kind in ('school', 'parent')),
  grade           smallint check (grade between 1 and 12),
  -- Parents only: an admin vouched for this person directly (e.g. the
  -- office confirmed them) — the fallback when a child can't issue a code.
  admin_verified  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- If an earlier draft of this file created email as citext, convert it.
do $do$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'email' and data_type <> 'text'
  ) then
    alter table public.profiles alter column email type text using lower(email::text);
  end if;
end
$do$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 2. The gate. Runs inside the signup transaction: raising here rolls the
--    whole signup back, so no account survives and the OAuth callback
--    comes back with an error the app translates.
--
--    There is no roster. The domain IS the roster for students; anyone
--    else becomes an unverified parent account, which sees nothing a
--    logged-out visitor can't already see.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  domain text := lower(split_part(coalesce(new.email, ''), '@', 2));
begin
  if new.email is null or new.email = '' then
    raise exception 'email_required: accounts need an email address'
      using errcode = '42501';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, kind)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      ''
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    case when domain = public.school_domain() then 'school' else 'parent' end
  )
  on conflict (id) do nothing;

  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A signed-in user may rename themselves or set their grade, but never
-- change what kind of account they are or verify themselves.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then
    new.email          := old.email;
    new.kind           := old.kind;
    new.admin_verified := old.admin_verified;
  end if;
  new.id := old.id;
  return new;
end;
$fn$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------
-- 3. Parent verification.
--
--    A student (proven by their school Google login) issues a one-time
--    code from their account page and gives it to their parent. The
--    parent signs in with their own account and enters it. The link is
--    visible to the student, who can revoke it, and to admins.
--
--    Codes: 8 characters from a 31-symbol alphabet (~8.5e11 combos),
--    single-use, expire after 7 days, max 3 live per student. Guessing
--    is capped at 8 wrong tries per account per hour.
-- ---------------------------------------------------------------------
create table if not exists public.parent_invites (
  code        text primary key,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  used_by     uuid references public.profiles(id) on delete set null,
  used_at     timestamptz
);
create index if not exists parent_invites_student_idx on public.parent_invites (student_id);

create table if not exists public.parent_links (
  parent_id     uuid not null references public.profiles(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  relationship  text not null default 'Parent'
                  check (char_length(relationship) between 1 and 40),
  created_at    timestamptz not null default now(),
  primary key (parent_id, student_id),
  check (parent_id <> student_id)
);
create index if not exists parent_links_student_idx on public.parent_links (student_id);

create table if not exists public.parent_redeem_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users on delete cascade,
  ok          boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists redeem_attempts_user_idx
  on public.parent_redeem_attempts (user_id, created_at desc);

create or replace function public.is_verified_parent()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.parent_links where parent_id = auth.uid())
      or exists (select 1 from public.profiles
                  where id = auth.uid() and kind = 'parent' and admin_verified)
$fn$;

create or replace function public.is_community()
returns boolean language sql stable security definer set search_path = public as $fn$
  select public.is_admin() or public.is_school() or public.is_verified_parent()
$fn$;

-- Is `other` my linked child or my linked parent?
create or replace function public.is_linked(other uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.parent_links
     where (parent_id = auth.uid() and student_id = other)
        or (student_id = auth.uid() and parent_id = other)
  )
$fn$;

create or replace function public.create_parent_invite()
returns public.parent_invites
language plpgsql volatile security definer set search_path = public, extensions as $fn$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
  bytes bytea;
  live int;
  inv_row public.parent_invites;
begin
  if auth.uid() is null or not public.is_school() then
    raise exception 'only_students: only school accounts can invite a parent'
      using errcode = '42501';
  end if;

  select count(*) into live from public.parent_invites
   where student_id = auth.uid() and used_at is null and expires_at > now();
  if live >= 3 then
    raise exception 'too_many_codes: you already have 3 unused codes — revoke one first'
      using errcode = '42501';
  end if;

  loop
    bytes := gen_random_bytes(8);
    new_code := '';
    for i in 0..7 loop
      new_code := new_code || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.parent_invites where code = new_code);
  end loop;

  insert into public.parent_invites (code, student_id)
  values (new_code, auth.uid())
  returning * into inv_row;
  return inv_row;
end;
$fn$;

-- Returns {ok, error?, student_name?}. Wrong codes RETURN rather than
-- raise, so the attempt row commits and the rate limit actually counts.
create or replace function public.redeem_parent_invite(p_code text, p_relationship text default 'Parent')
returns jsonb
language plpgsql volatile security definer set search_path = public as $fn$
declare
  clean text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  inv public.parent_invites;
  fails int;
  parents int;
  student_name text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select count(*) into fails from public.parent_redeem_attempts
   where user_id = auth.uid() and not ok and created_at > now() - interval '1 hour';
  if fails >= 8 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  select * into inv from public.parent_invites
   where code = clean and used_at is null and expires_at > now()
   for update;

  if not found or inv.student_id = auth.uid() then
    insert into public.parent_redeem_attempts (user_id, ok) values (auth.uid(), false);
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select count(*) into parents from public.parent_links where student_id = inv.student_id;
  if parents >= 4 then
    return jsonb_build_object('ok', false, 'error', 'student_full');
  end if;

  insert into public.parent_links (parent_id, student_id, relationship)
  values (auth.uid(), inv.student_id, left(coalesce(nullif(trim(p_relationship), ''), 'Parent'), 40))
  on conflict (parent_id, student_id) do nothing;

  update public.parent_invites set used_by = auth.uid(), used_at = now()
   where code = inv.code;

  insert into public.parent_redeem_attempts (user_id, ok) values (auth.uid(), true);

  select full_name into student_name from public.profiles where id = inv.student_id;
  return jsonb_build_object('ok', true, 'student_name', student_name);
end;
$fn$;

-- One round trip for the app to learn what the current user may do.
create or replace function public.my_access()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'is_admin', public.is_admin(),
    'is_school', public.is_school(),
    'is_verified_parent', public.is_verified_parent(),
    'is_community', public.is_community()
  )
$fn$;

-- ---------------------------------------------------------------------
-- 4. Sports. `tier` separates the core teams from "opportunities" —
--    smaller sports (indoor rowing, etc.) the school may enter.
-- ---------------------------------------------------------------------
create table if not exists public.sports (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null check (slug ~ '^[a-z0-9-]+$'),
  name          text not null,
  season        text not null check (season in ('fall', 'winter', 'spring', 'year')),
  tier          text not null default 'team' check (tier in ('team', 'opportunity')),
  divisions     text,                 -- 'Varsity Boys · Varsity Girls · MS'
  emoji         text,
  color         text not null default '#E0492F',
  summary       text,
  body          text not null default '',   -- markdown
  coach         text,
  practice_info text,
  how_to_join   text,
  cover_url     text,
  sort_order    int not null default 100,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists sports_touch on public.sports;
create trigger sports_touch before update on public.sports
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 5. Events — games, tryouts, sign-up deadlines, meetings, practices.
--    A repeating practice is stored as one row per date sharing a
--    series_id, so a single week can be moved or cancelled.
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  series_id        uuid,
  title            text not null,
  kind             text not null default 'game'
                     check (kind in ('game', 'tournament', 'tryout', 'deadline', 'practice', 'meeting', 'other')),
  sport_id         uuid references public.sports(id) on delete set null,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  all_day          boolean not null default false,
  location         text,
  opponent         text,
  home_away        text check (home_away in ('home', 'away', 'neutral')),
  description      text not null default '',   -- markdown
  signup_enabled   boolean not null default false,
  signup_deadline  timestamptz,
  capacity         int check (capacity > 0),
  result           text,                      -- '3 – 1', '2nd of 8'
  outcome          text check (outcome in ('win', 'loss', 'draw')),
  members_only     boolean not null default false,
  cancelled        boolean not null default false,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index if not exists events_starts_idx on public.events (starts_at);
create index if not exists events_sport_idx  on public.events (sport_id);
create index if not exists events_series_idx on public.events (series_id);

drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

create table if not exists public.event_signups (
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  note        text check (char_length(note) <= 300),
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists signups_user_idx on public.event_signups (user_id);

-- Everyone may see how many are in; only admins and families see who.
create or replace view public.event_signup_totals
with (security_invoker = off) as
  select event_id, count(*)::int as total
    from public.event_signups
   group by event_id;
revoke select on public.event_signup_totals from anon;
grant select on public.event_signup_totals to authenticated;

create or replace function public.can_sign_up(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select public.is_school() and exists (
    select 1 from public.events e
     where e.id = p_event
       and e.signup_enabled
       and not e.cancelled
       and now() < coalesce(e.signup_deadline, e.starts_at)
       and (e.capacity is null
            or (select count(*) from public.event_signups s where s.event_id = e.id) < e.capacity)
  )
$fn$;

-- ---------------------------------------------------------------------
-- 6. Notices — announcements, optionally about one sport.
-- ---------------------------------------------------------------------
create table if not exists public.notices (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null default '',   -- markdown
  sport_id      uuid references public.sports(id) on delete set null,
  cover_url     text,
  pinned        boolean not null default false,
  members_only  boolean not null default false,
  published     boolean not null default true,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists notices_created_idx on public.notices (created_at desc);

drop trigger if exists notices_touch on public.notices;
create trigger notices_touch before update on public.notices
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 7. Meet our athletes — spotlights written by the ADs, not a directory
--    of every student. Community-only: these are minors' names and faces.
-- ---------------------------------------------------------------------
create table if not exists public.athletes (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  grade       smallint check (grade between 1 and 12),
  headline    text,                        -- 'Captain · Varsity Soccer'
  sport_ids   uuid[] not null default '{}',
  photo_url   text,
  quote       text,
  bio         text not null default '',    -- markdown
  qa          jsonb not null default '[]', -- [{ "q": "...", "a": "..." }]
  jersey      text,
  featured    boolean not null default false,
  published   boolean not null default true,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists athletes_touch on public.athletes;
create trigger athletes_touch before update on public.athletes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 8. Follows — "my teams" filter for the calendar.
-- ---------------------------------------------------------------------
create table if not exists public.follows (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  sport_id  uuid not null references public.sports(id)   on delete cascade,
  primary key (user_id, sport_id)
);

-- ---------------------------------------------------------------------
-- 9. Row level security. The anon key ships in the page, so every rule
--    that matters lives here.
-- ---------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.parent_invites         enable row level security;
alter table public.parent_links           enable row level security;
alter table public.parent_redeem_attempts enable row level security;
alter table public.sports                 enable row level security;
alter table public.events                 enable row level security;
alter table public.event_signups          enable row level security;
alter table public.notices                enable row level security;
alter table public.athletes               enable row level security;
alter table public.follows                enable row level security;

-- profiles: yourself, your linked family, and admins.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.is_linked(id));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles for delete to authenticated
  using (public.is_admin());

-- invites: created only through create_parent_invite(); the student sees
-- and revokes their own.
drop policy if exists invites_read on public.parent_invites;
create policy invites_read on public.parent_invites for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

drop policy if exists invites_delete on public.parent_invites;
create policy invites_delete on public.parent_invites for delete to authenticated
  using ((student_id = auth.uid() and used_at is null) or public.is_admin());

-- links: created only through redeem_parent_invite(). Either side, or an
-- admin, can break one.
drop policy if exists links_read on public.parent_links;
create policy links_read on public.parent_links for select to authenticated
  using (parent_id = auth.uid() or student_id = auth.uid() or public.is_admin());

drop policy if exists links_delete on public.parent_links;
create policy links_delete on public.parent_links for delete to authenticated
  using (parent_id = auth.uid() or student_id = auth.uid() or public.is_admin());

-- parent_redeem_attempts: no policies — only the SECURITY DEFINER
-- function touches it.

-- Nothing is readable without signing in: every read policy below is
-- `to authenticated`, so the anon key alone returns empty results.

-- sports: any signed-in account.
drop policy if exists sports_read on public.sports;
create policy sports_read on public.sports for select to authenticated
  using (active or public.is_admin());

drop policy if exists sports_admin on public.sports;
create policy sports_admin on public.sports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- events: any signed-in account, unless members_only (community only).
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
  using (not members_only or public.is_community());

drop policy if exists events_admin on public.events;
create policy events_admin on public.events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- signups: students sign themselves up; parents see their children's;
-- admins see everyone.
drop policy if exists signups_read on public.event_signups;
create policy signups_read on public.event_signups for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.is_linked(user_id));

drop policy if exists signups_insert_own on public.event_signups;
create policy signups_insert_own on public.event_signups for insert to authenticated
  with check (user_id = auth.uid() and public.can_sign_up(event_id));

drop policy if exists signups_delete on public.event_signups;
create policy signups_delete on public.event_signups for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- notices: any signed-in account unless members_only; drafts are admin-only.
drop policy if exists notices_read on public.notices;
create policy notices_read on public.notices for select to authenticated
  using ((published and (not members_only or public.is_community())) or public.is_admin());

drop policy if exists notices_admin on public.notices;
create policy notices_admin on public.notices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- athletes: community only.
drop policy if exists athletes_read on public.athletes;
create policy athletes_read on public.athletes for select to authenticated
  using ((published and public.is_community()) or public.is_admin());

drop policy if exists athletes_admin on public.athletes;
create policy athletes_admin on public.athletes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- follows: your own. Parents can read their child's to build a family view.
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select to authenticated
  using (user_id = auth.uid() or public.is_linked(user_id));

drop policy if exists follows_write on public.follows;
create policy follows_write on public.follows for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 10. Image uploads (sport covers, athlete photos, notice covers).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists media_admin_insert on storage.objects;
create policy media_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());

drop policy if exists media_admin_update on storage.objects;
create policy media_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_admin());

drop policy if exists media_admin_delete on storage.objects;
create policy media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());

-- ---------------------------------------------------------------------
-- 11. Function grants. Supabase grants EXECUTE to anon by default; the
--     RPCs below mean nothing without a user, so keep them signed-in only.
-- ---------------------------------------------------------------------
revoke execute on function public.create_parent_invite()             from anon, public;
revoke execute on function public.redeem_parent_invite(text, text)   from anon, public;
grant  execute on function public.create_parent_invite()             to authenticated;
grant  execute on function public.redeem_parent_invite(text, text)   to authenticated;
grant  execute on function public.my_access()                        to anon, authenticated;
