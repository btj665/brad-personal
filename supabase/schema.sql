-- The Tables — backend schema.
--
-- Run this once in your Supabase project's SQL editor (see SETUP.md). It is
-- written to be safe to re-run: tables use "if not exists", functions are
-- "create or replace", and policies are dropped before they're recreated.
--
-- The shape:
--   profiles  one row per user: their username and whether they're the admin.
--   wallets   one row per user: the single play-money balance every game shares,
--             plus lifetime totals for the admin dashboard.
--   activity  an append-only log of play, flushed by the client in batches, for
--             the admin's time-series and per-game breakdown.
--
-- The rules that matter:
--   * Row-level security means a signed-in user can read only their own profile,
--     wallet and activity. The anon key in the browser grants nothing more.
--   * Nobody can write their wallet directly. Money only moves through the
--     security-definer functions below, which validate the amounts — so a tampered
--     client can't set its own balance, only play the batches through.
--   * The admin dashboard reads through admin_* functions that check is_admin;
--     the service-role key is never shipped to the browser.

-- The starting stake, and what a broke wallet is topped back up to.
-- Change the 1000s here if you want a different starting bankroll.

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance numeric not null default 1000,
  total_wagered numeric not null default 0,
  total_won numeric not null default 0,
  rounds bigint not null default 0,
  topups integer not null default 0,
  last_topup timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  game text not null,
  wagered numeric not null default 0,
  won numeric not null default 0,
  rounds integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists activity_user_time on public.activity (user_id, created_at desc);
create index if not exists activity_time on public.activity (created_at desc);

-- ---------------------------------------------------------------- new users

-- When someone signs up, give them a profile (username from the signup form) and
-- a funded wallet. The very first person to sign up becomes the admin, so the
-- owner just signs up first — no manual step, though you can flip the flag by
-- hand later (see SETUP.md).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_user boolean;
  uname text;
begin
  select count(*) = 0 into first_user from public.profiles;
  uname := coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1));

  insert into public.profiles (id, username, is_admin)
  values (new.id, uname, first_user)
  on conflict (id) do nothing;

  insert into public.wallets (user_id, balance)
  values (new.id, 1000)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.activity enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "read own wallet" on public.wallets;
create policy "read own wallet" on public.wallets
  for select using (auth.uid() = user_id);

drop policy if exists "read own activity" on public.activity;
create policy "read own activity" on public.activity
  for select using (auth.uid() = user_id);

-- No insert/update/delete policies: the wallet and activity are written only by
-- the security-definer functions below, which run as the owner and bypass RLS.

-- ---------------------------------------------------------------- money

-- Settle a batch of play. The client accumulates what it wagered and won across a
-- few rounds and calls this; the server is the one that actually moves the money,
-- clamping a wallet that would go negative to zero and rejecting nonsense amounts.
-- Returns the authoritative new balance.
create or replace function public.settle_batch(
  p_game text,
  p_wagered numeric,
  p_won numeric,
  p_rounds integer
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  -- Guard against garbage or overflow from a tampered client. This is play money,
  -- but a bogus batch shouldn't be able to poison the admin totals unboundedly.
  if p_wagered < 0 or p_won < 0 or p_rounds < 0
     or p_wagered > 1e9 or p_won > 1e9 or p_rounds > 100000 then
    raise exception 'invalid batch';
  end if;

  update public.wallets
    set balance = greatest(0, balance - p_wagered + p_won),
        total_wagered = total_wagered + p_wagered,
        total_won = total_won + p_won,
        rounds = rounds + p_rounds,
        updated_at = now()
    where user_id = auth.uid()
    returning balance into new_balance;

  if new_balance is null then
    raise exception 'no wallet';
  end if;

  if p_wagered > 0 or p_won > 0 or p_rounds > 0 then
    insert into public.activity (user_id, game, wagered, won, rounds)
    values (auth.uid(), coalesce(nullif(trim(p_game), ''), 'unknown'), p_wagered, p_won, p_rounds);
  end if;

  return new_balance;
end;
$$;

-- Replenish a broke wallet. Refills to the base stake only when the balance is at
-- or below zero and a short cooldown has passed, so it can't be spammed. Returns
-- the balance (unchanged if a top-up wasn't due).
create or replace function public.top_up()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets;
  base numeric := 1000;
  cooldown interval := interval '15 seconds';
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into w from public.wallets where user_id = auth.uid() for update;
  if not found then
    raise exception 'no wallet';
  end if;

  if w.balance <= 0 and (w.last_topup is null or now() - w.last_topup > cooldown) then
    update public.wallets
      set balance = base, topups = topups + 1, last_topup = now(), updated_at = now()
      where user_id = auth.uid()
      returning balance into w.balance;
  end if;

  return w.balance;
end;
$$;

-- ---------------------------------------------------------------- admin

-- Is the caller the admin? Used by the admin functions and readable by the client
-- so the UI can show or hide the admin tab.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- The dashboard's headline numbers plus a 30-day signup series, as one JSON blob.
create or replace function public.admin_overview()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return json_build_object(
    'players', (select count(*) from public.profiles),
    'active_24h', (select count(distinct user_id) from public.activity where created_at > now() - interval '24 hours'),
    'rounds', (select coalesce(sum(rounds), 0) from public.wallets),
    'total_wagered', (select coalesce(sum(total_wagered), 0) from public.wallets),
    'total_won', (select coalesce(sum(total_won), 0) from public.wallets),
    'on_table', (select coalesce(sum(balance), 0) from public.wallets),
    'signups', (
      select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json)
      from (
        select date_trunc('day', created_at)::date as day, count(*) as count
        from public.profiles
        where created_at > now() - interval '30 days'
        group by 1
      ) d
    ),
    'by_game', (
      select coalesce(json_agg(row_to_json(g) order by g.wagered desc), '[]'::json)
      from (
        select game, sum(wagered) as wagered, sum(won) as won, sum(rounds) as rounds
        from public.activity group by game
      ) g
    )
  );
end;
$$;

-- One row per player for the admin table.
create or replace function public.admin_players()
returns table (
  username text,
  is_admin boolean,
  balance numeric,
  total_wagered numeric,
  total_won numeric,
  rounds bigint,
  topups integer,
  joined timestamptz,
  last_active timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
    select p.username, p.is_admin, w.balance, w.total_wagered, w.total_won,
           w.rounds, w.topups, p.created_at,
           (select max(a.created_at) from public.activity a where a.user_id = p.id)
    from public.profiles p
    join public.wallets w on w.user_id = p.id
    order by p.created_at desc;
end;
$$;

-- The most recent play, across everyone, for the admin's live feed.
create or replace function public.admin_activity(p_limit integer default 50)
returns table (
  username text,
  game text,
  wagered numeric,
  won numeric,
  rounds integer,
  at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
    select p.username, a.game, a.wagered, a.won, a.rounds, a.created_at
    from public.activity a
    join public.profiles p on p.id = a.user_id
    order by a.created_at desc
    limit greatest(1, least(p_limit, 500));
end;
$$;
