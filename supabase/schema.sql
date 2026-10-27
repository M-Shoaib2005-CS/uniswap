-- =====================================================================
-- UniSwap database schema v1.0  (Supabase / PostgreSQL)
-- Run the whole file once in: Supabase dashboard > SQL Editor > New query
-- Modules follow the SAD: Users, Listings, Search, Transactions, Messaging,
-- Feed, Reviews, Moderation, Subscriptions, Notifications.
-- =====================================================================

-- ---------- settings (read only by SECURITY DEFINER code) -------------
create table public.app_settings (
  key   text primary key,
  value text not null
);
alter table public.app_settings enable row level security;   -- no policies: not readable by clients

insert into public.app_settings(key, value) values
  ('allowed_email_domain',    'student.uet.edu.pk'),
  ('bootstrap_admin_emails',  'seadmin@student.uet.edu.pk');

-- ---------- reference data ---------------------------------------------
create table public.zones (
  id        serial primary key,
  name      text not null unique check (char_length(trim(name)) between 2 and 80),
  category  text not null default 'Other'
            check (category in ('Academic','Admin','Hostel','Food','Sports','Recreation','Hub','Other')),
  lat       double precision not null check (lat between -90 and 90),
  lng       double precision not null check (lng between -180 and 180),
  active    boolean not null default true
);

create table public.categories (
  id      serial primary key,
  name    text not null unique check (char_length(trim(name)) between 2 and 40),
  sort    int  not null default 0,
  active  boolean not null default true
);

-- ---------- users -------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  display_name     text not null check (char_length(trim(display_name)) between 2 and 60),
  avatar_path      text,
  department       text check (char_length(department) <= 80),
  default_zone_id  int references public.zones(id) on delete set null,
  is_admin         boolean not null default false,
  is_suspended     boolean not null default false,
  trust_score      numeric(3,2),               -- average of received ratings, null until first review
  ratings_count    int not null default 0,
  swaps_count      int not null default 0,
  is_pro           boolean not null default false,
  pro_until        timestamptz,
  founding_member  boolean not null default false,
  created_at       timestamptz not null default now()
);

create table public.user_private (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  notification_prefs  jsonb not null default '{"messages":true,"requests":true,"reminders":true,"likes":true,"comments":true}',
  suspension_reason   text
);

create table public.device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  token       text not null unique,
  platform    text not null default 'android',
  updated_at  timestamptz not null default now()
);

create table public.blocks (
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ---------- listings ----------------------------------------------------
create type public.listing_mode   as enum ('rent','sell','both');
create type public.listing_status as enum ('available','requested','rented','sold','archived');
create type public.item_condition as enum ('new','like_new','good','fair');

create table public.items (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  title          text not null check (char_length(trim(title)) between 3 and 80),
  description    text not null default '' check (char_length(description) <= 1000),
  category_id    int  not null references public.categories(id),
  condition      public.item_condition not null,
  mode           public.listing_mode not null,
  rent_price     numeric(10,0) check (rent_price > 0),        -- per semester
  deposit        numeric(10,0) check (deposit >= 0),          -- refundable security deposit
  sale_price     numeric(10,0) check (sale_price > 0),
  zone_id        int  not null references public.zones(id),
  status         public.listing_status not null default 'available',
  boosted_until  timestamptz,
  removed_at     timestamptz,                                 -- set by moderation
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint rent_needs_price check (mode = 'sell' or (rent_price is not null and deposit is not null)),
  constraint sell_needs_price check (mode = 'rent' or sale_price is not null)
);
create index items_status_idx   on public.items(status);
create index items_zone_idx     on public.items(zone_id);
create index items_category_idx on public.items(category_id);
create index items_created_idx  on public.items(created_at desc);
create index items_owner_idx    on public.items(owner_id);

create table public.item_images (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items(id) on delete cascade,
  path        text not null,
  position    smallint not null default 0 check (position between 0 and 4),
  created_at  timestamptz not null default now(),
  unique (item_id, position)
);

create table public.saved_items (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  item_id     uuid not null references public.items(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- ---------- transactions ------------------------------------------------
create type public.txn_kind      as enum ('rent','buy');
create type public.txn_status    as enum ('requested','accepted','rented','returned','completed','declined','cancelled');
create type public.deposit_status as enum ('none','held','returned','deducted');

create table public.transactions (
  id                      uuid primary key default gen_random_uuid(),
  item_id                 uuid not null references public.items(id) on delete cascade,
  owner_id                uuid not null references public.profiles(id) on delete cascade,
  requester_id            uuid not null references public.profiles(id) on delete cascade,
  kind                    public.txn_kind not null,
  status                  public.txn_status not null default 'requested',
  start_date              date,
  due_date                date,
  price                   numeric(10,0) not null,
  deposit                 numeric(10,0) not null default 0,
  deposit_status          public.deposit_status not null default 'none',
  deposit_outcome         public.deposit_status,               -- owner's decision at return
  note                    text check (char_length(note) <= 300),
  owner_handover_at       timestamptz,
  requester_handover_at   timestamptz,
  owner_return_at         timestamptz,
  requester_return_at     timestamptz,
  last_reminded_on        date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (owner_id <> requester_id),
  check (kind = 'buy' or (start_date is not null and due_date is not null
                          and due_date > start_date and due_date - start_date <= 120))
);
-- BR-05: an item can never have two live requests / accepted rentals at once
create unique index one_live_txn_per_item on public.transactions(item_id)
  where status in ('requested','accepted','rented');
create index txn_owner_idx     on public.transactions(owner_id, created_at desc);
create index txn_requester_idx on public.transactions(requester_id, created_at desc);

create table public.txn_evidence (
  id           uuid primary key default gen_random_uuid(),
  txn_id       uuid not null references public.transactions(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  phase        text not null check (phase in ('handover','return')),
  note         text check (char_length(note) <= 300),
  photo_paths  text[] not null default '{}' check (coalesce(array_length(photo_paths,1),0) <= 2),
  created_at   timestamptz not null default now(),
  unique (txn_id, user_id, phase)
);

-- ---------- messaging ---------------------------------------------------
create table public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  item_id              uuid not null references public.items(id) on delete cascade,
  owner_id             uuid not null references public.profiles(id) on delete cascade,
  other_id             uuid not null references public.profiles(id) on delete cascade,
  last_message_at      timestamptz not null default now(),
  last_message_preview text,
  owner_read_at        timestamptz not null default now(),
  other_read_at        timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  unique (item_id, other_id),
  check (owner_id <> other_id)
);
create index conv_owner_idx on public.conversations(owner_id, last_message_at desc);
create index conv_other_idx on public.conversations(other_id, last_message_at desc);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid references public.profiles(id) on delete cascade,   -- null = system message
  kind             text not null default 'text' check (kind in ('text','system')),
  body             text not null check (char_length(trim(body)) between 1 and 1000),
  created_at       timestamptz not null default now()
);
create index messages_conv_idx on public.messages(conversation_id, created_at desc);

-- ---------- campus feed -------------------------------------------------
create table public.posts (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references public.profiles(id) on delete cascade,
  body           text not null check (char_length(trim(body)) between 1 and 1000),
  item_id        uuid references public.items(id) on delete set null,
  like_count     int not null default 0,
  comment_count  int not null default 0,
  removed_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index posts_created_idx on public.posts(created_at desc);

create table public.post_images (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  path        text not null,
  position    smallint not null default 0 check (position between 0 and 3),
  created_at  timestamptz not null default now(),
  unique (post_id, position)
);

create table public.post_likes (
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(trim(body)) between 1 and 500),
  removed_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index comments_post_idx on public.comments(post_id, created_at);

-- ---------- reviews -----------------------------------------------------
create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  txn_id       uuid not null references public.transactions(id) on delete cascade,
  reviewer_id  uuid not null references public.profiles(id) on delete cascade,
  reviewee_id  uuid not null references public.profiles(id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  comment      text check (char_length(comment) <= 300),
  created_at   timestamptz not null default now(),
  unique (txn_id, reviewer_id),                      -- FR-REV-03
  check (reviewer_id <> reviewee_id)
);
create index reviews_reviewee_idx on public.reviews(reviewee_id, created_at desc);

-- ---------- moderation --------------------------------------------------
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references public.profiles(id) on delete cascade,
  target_type     text not null check (target_type in ('item','post','comment','user','conversation')),
  target_id       uuid not null,
  target_user_id  uuid references public.profiles(id) on delete cascade,
  reason          text not null check (reason in ('spam','fake','abusive','unsafe','inappropriate','other')),
  details         text check (char_length(details) <= 500),
  status          text not null default 'open' check (status in ('open','upheld','dismissed')),
  resolved_by     uuid references public.profiles(id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index reports_status_idx on public.reports(status, created_at);

create table public.admin_actions (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references public.profiles(id) on delete set null,   -- null = automatic (BR-06)
  action       text not null,
  target_type  text,
  target_id    uuid,
  note         text,
  created_at   timestamptz not null default now()
);

-- ---------- notifications ----------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('messages','requests','reminders','likes','comments','system')),
  title       text not null,
  body        text not null default '',
  data        jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notif_user_idx on public.notifications(user_id, created_at desc);
-- =====================================================================
-- Helpers, triggers and business-rule functions
-- Convention: functions that must bypass RLS are SECURITY DEFINER with a fixed
-- search_path. Guards that block client edits check `current_user`: inside a
-- definer function it is the owner (postgres); for a direct client statement
-- it is `authenticated`.
-- =====================================================================

create or replace function public.is_client() returns boolean
language sql stable as $$ select current_user in ('authenticated','anon') $$;

create or replace function public.is_active_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid() and not p.is_suspended and u.email_confirmed_at is not null
  )
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid() and p.is_admin and not p.is_suspended and u.email_confirmed_at is not null
  )
$$;

create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks
                 where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();
create trigger txn_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

-- ---------- distance between zones (walking estimate, metres) ----------
create or replace function public.zone_distance_m(a int, b int) returns int
language sql stable as $$
  select (round((2 * 6371000 * asin(sqrt(
            power(sin(radians(zb.lat - za.lat) / 2), 2) +
            cos(radians(za.lat)) * cos(radians(zb.lat)) *
            power(sin(radians(zb.lng - za.lng) / 2), 2)
         )) * 1.3) / 10) * 10)::int
  from public.zones za, public.zones zb
  where za.id = a and zb.id = b
$$;

-- ---------- sign-up: domain check + profile -----------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  dom text; admins text; nm text;
begin
  select value into dom    from public.app_settings where key = 'allowed_email_domain';
  select value into admins from public.app_settings where key = 'bootstrap_admin_emails';
  if lower(split_part(coalesce(new.email, ''), '@', 2)) <> lower(dom) then
    raise exception 'Only @% email addresses can register', dom using errcode = 'P0001';
  end if;
  nm := left(trim(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1))), 60);
  if char_length(nm) < 2 then nm := 'Student'; end if;
  -- Pro is not granted automatically (decision: revisit later); is_pro stays false for new accounts
  insert into public.profiles(id, display_name, is_admin)
  values (new.id, nm, lower(new.email) = any (string_to_array(lower(coalesce(admins, '')), ',')));
  insert into public.user_private(user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.check_email_domain() returns trigger
language plpgsql security definer set search_path = public as $$
declare dom text;
begin
  select value into dom from public.app_settings where key = 'allowed_email_domain';
  if lower(split_part(coalesce(new.email, ''), '@', 2)) <> lower(dom) then
    raise exception 'Only @% email addresses are allowed', dom using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed before update of email on auth.users
  for each row when (new.email is distinct from old.email)
  execute function public.check_email_domain();

-- ---------- guards on protected columns --------------------------------
create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if not public.is_client() then return new; end if;
  if (new.is_admin, new.is_suspended, new.trust_score, new.ratings_count, new.swaps_count,
      new.is_pro, new.pro_until, new.founding_member, new.id)
     is distinct from
     (old.is_admin, old.is_suspended, old.trust_score, old.ratings_count, old.swaps_count,
      old.is_pro, old.pro_until, old.founding_member, old.id) then
    raise exception 'These profile fields cannot be changed' using errcode = '42501';
  end if;
  if not public.is_active_member() then
    raise exception 'Your account cannot edit its profile right now' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard_t before update on public.profiles
  for each row execute function public.profiles_guard();

create or replace function public.user_private_guard() returns trigger
language plpgsql as $$
begin
  if public.is_client() and new.suspension_reason is distinct from old.suspension_reason then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger user_private_guard_t before update on public.user_private
  for each row execute function public.user_private_guard();

-- ---------- rate limits (NFR-SEC-04) -----------------------------------
create or replace function public.rate_limit_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid; n int; lim int; win interval;
begin
  uid := auth.uid();
  if uid is null then return new; end if;
  if tg_table_name = 'messages' then
    select count(*) into n from public.messages where sender_id = uid and created_at > now() - interval '1 minute'; lim := 30;
  elsif tg_table_name = 'posts' then
    select count(*) into n from public.posts where author_id = uid and created_at > now() - interval '1 hour'; lim := 10;
  elsif tg_table_name = 'comments' then
    select count(*) into n from public.comments where author_id = uid and created_at > now() - interval '10 minutes'; lim := 20;
  elsif tg_table_name = 'items' then
    select count(*) into n from public.items where owner_id = uid and created_at > now() - interval '1 day'; lim := 20;
  elsif tg_table_name = 'reports' then
    select count(*) into n from public.reports where reporter_id = uid and created_at > now() - interval '1 hour'; lim := 10;
  else
    return new;
  end if;
  if n >= lim then
    raise exception 'You are doing that too often. Please wait a moment.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger rl_messages before insert on public.messages for each row execute function public.rate_limit_check();
create trigger rl_posts    before insert on public.posts    for each row execute function public.rate_limit_check();
create trigger rl_comments before insert on public.comments for each row execute function public.rate_limit_check();
create trigger rl_items    before insert on public.items    for each row execute function public.rate_limit_check();
create trigger rl_reports  before insert on public.reports  for each row execute function public.rate_limit_check();

-- ---------- photo cap (FR-LST-08: 40 stored photos on a free account) --
create or replace function public.account_photo_count(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.item_images ii join public.items i on i.id = ii.item_id where i.owner_id = uid)::int
       + (select count(*) from public.post_images pi join public.posts p on p.id = pi.post_id where p.author_id = uid)::int
       + (select coalesce(sum(coalesce(array_length(photo_paths, 1), 0)), 0) from public.txn_evidence where user_id = uid)::int
$$;

create or replace function public.is_pro_now(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and is_pro and (pro_until is null or pro_until > now()))
$$;

create or replace function public.photo_cap_check() returns trigger
language plpgsql set search_path = public as $$
declare owner uuid;
begin
  if not public.is_client() then return new; end if;
  if tg_table_name = 'item_images' then
    select owner_id into owner from public.items where id = new.item_id;
  else
    select author_id into owner from public.posts where id = new.post_id;
  end if;
  if not public.is_pro_now(owner) and public.account_photo_count(owner) >= 40 then
    raise exception 'Photo limit reached (40 photos on a free account)' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger item_images_cap before insert on public.item_images for each row execute function public.photo_cap_check();
create trigger post_images_cap before insert on public.post_images for each row execute function public.photo_cap_check();

-- ---------- items: limits and status guard -----------------------------
create or replace function public.items_guard() returns trigger
language plpgsql set search_path = public as $$
declare n int;
begin
  if not public.is_client() then return new; end if;
  if tg_op = 'INSERT' then
    if not public.is_active_member() then
      raise exception 'Verify your university email to create listings' using errcode = '42501';
    end if;
    if new.status <> 'available' or new.boosted_until is not null or new.removed_at is not null then
      raise exception 'Invalid listing state' using errcode = '42501';
    end if;
    select count(*) into n from public.items
      where owner_id = new.owner_id and status in ('available','requested','rented') and removed_at is null;
    if n >= 5 and not public.is_pro_now(new.owner_id) then
      raise exception 'Free accounts can have 5 active listings' using errcode = 'P0001';
    end if;
  else
    if not public.is_active_member() then
      raise exception 'Your account cannot edit listings right now' using errcode = '42501';
    end if;
    if new.owner_id <> old.owner_id or new.boosted_until is distinct from old.boosted_until
       or new.removed_at is distinct from old.removed_at then
      raise exception 'These listing fields cannot be changed' using errcode = '42501';
    end if;
    if old.status in ('requested','rented','sold') then
      raise exception 'This listing is part of an active or completed transaction' using errcode = 'P0001';
    end if;
    if new.status not in ('available','archived') then
      raise exception 'Invalid status change' using errcode = '42501';
    end if;
    if old.status = 'archived' and new.status = 'available' then
      select count(*) into n from public.items
        where owner_id = new.owner_id and status in ('available','requested','rented') and removed_at is null;
      if n >= 5 and not public.is_pro_now(new.owner_id) then
        raise exception 'Free accounts can have 5 active listings' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger items_guard_t before insert or update on public.items
  for each row execute function public.items_guard();

-- ---------- notifications ----------------------------------------------
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text default '', p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare pref text;
begin
  select notification_prefs ->> p_kind into pref from public.user_private where user_id = p_user;
  if coalesce(pref, 'true') = 'false' then return; end if;
  insert into public.notifications(user_id, kind, title, body, data)
  values (p_user, p_kind, p_title, left(p_body, 200), p_data);
end $$;

create or replace function public.display_name_of(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select display_name from public.profiles where id = uid
$$;

-- ---------- conversations ----------------------------------------------
create or replace function public.ensure_conversation(p_item uuid, p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare owner uuid; cid uuid;
begin
  select owner_id into owner from public.items where id = p_item;
  if owner is null then raise exception 'Listing not found'; end if;
  insert into public.conversations(item_id, owner_id, other_id)
  values (p_item, owner, p_other)
  on conflict (item_id, other_id) do nothing;
  select id into cid from public.conversations where item_id = p_item and other_id = p_other;
  return cid;
end $$;

create or replace function public.system_message(p_conv uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.messages(conversation_id, sender_id, kind, body) values (p_conv, null, 'system', p_body);
end $$;

-- FR-MSG-01: "Chat with owner"
create or replace function public.start_conversation(p_item uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); it public.items%rowtype;
begin
  if me is null or not public.is_active_member() then
    raise exception 'Verify your university email to chat' using errcode = '42501';
  end if;
  select * into it from public.items where id = p_item and removed_at is null;
  if not found then raise exception 'Listing not found'; end if;
  if it.owner_id = me then raise exception 'This is your own listing'; end if;
  if public.is_blocked(me, it.owner_id) then raise exception 'You cannot message this user'; end if;
  return public.ensure_conversation(p_item, me);
end $$;

create or replace function public.messages_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.conversations%rowtype; recipient uuid;
begin
  select * into c from public.conversations where id = new.conversation_id;
  update public.conversations
     set last_message_at = new.created_at,
         last_message_preview = left(new.body, 80),
         owner_read_at = case when new.sender_id = c.owner_id then new.created_at else owner_read_at end,
         other_read_at = case when new.sender_id = c.other_id then new.created_at else other_read_at end
   where id = c.id;
  if new.kind = 'text' and new.sender_id is not null then
    recipient := case when new.sender_id = c.owner_id then c.other_id else c.owner_id end;
    perform public.notify(recipient, 'messages', public.display_name_of(new.sender_id), new.body,
                          jsonb_build_object('conversation_id', c.id));
  end if;
  return new;
end $$;
create trigger messages_after_insert_t after insert on public.messages
  for each row execute function public.messages_after_insert();

create or replace function public.mark_conversation_read(p_conv uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  update public.conversations
     set owner_read_at = case when owner_id = me then now() else owner_read_at end,
         other_read_at = case when other_id = me then now() else other_read_at end
   where id = p_conv and me in (owner_id, other_id);
end $$;

create or replace function public.my_conversations()
returns table (id uuid, item_id uuid, item_title text, item_cover text, item_status public.listing_status,
               other_id uuid, other_name text, other_avatar text,
               last_message_preview text, last_message_at timestamptz, unread int)
language sql stable as $$
  select c.id, c.item_id, i.title,
         (select path from public.item_images ii where ii.item_id = i.id order by position limit 1),
         i.status,
         o.id, o.display_name, o.avatar_path,
         c.last_message_preview, c.last_message_at,
         (select count(*)::int from public.messages m
           where m.conversation_id = c.id and m.sender_id is distinct from auth.uid()
             and m.kind = 'text'
             and m.created_at > case when c.owner_id = auth.uid() then c.owner_read_at else c.other_read_at end)
  from public.conversations c
  join public.items i on i.id = c.item_id
  join public.profiles o on o.id = case when c.owner_id = auth.uid() then c.other_id else c.owner_id end
  where auth.uid() in (c.owner_id, c.other_id)
    and not public.is_blocked(c.owner_id, c.other_id)
  order by c.last_message_at desc
$$;

-- ---------- feed counters ----------------------------------------------
create or replace function public.post_likes_counter() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid; author uuid;
begin
  pid := coalesce(new.post_id, old.post_id);
  update public.posts set like_count = (select count(*) from public.post_likes where post_id = pid) where id = pid;
  if tg_op = 'INSERT' then
    select author_id into author from public.posts where id = pid;
    if author <> new.user_id then
      perform public.notify(author, 'likes', public.display_name_of(new.user_id) || ' liked your post', '',
                            jsonb_build_object('post_id', pid));
    end if;
  end if;
  return null;
end $$;
create trigger post_likes_counter_t after insert or delete on public.post_likes
  for each row execute function public.post_likes_counter();

create or replace function public.comments_counter() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid; author uuid;
begin
  pid := coalesce(new.post_id, old.post_id);
  update public.posts set comment_count =
    (select count(*) from public.comments where post_id = pid and removed_at is null) where id = pid;
  if tg_op = 'INSERT' then
    select author_id into author from public.posts where id = pid;
    if author <> new.author_id then
      perform public.notify(author, 'comments', public.display_name_of(new.author_id) || ' commented on your post',
                            new.body, jsonb_build_object('post_id', pid));
    end if;
  end if;
  return null;
end $$;
create trigger comments_counter_t after insert or delete or update of removed_at on public.comments
  for each row execute function public.comments_counter();

create or replace function public.posts_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_client() then return new; end if;
  if not public.is_active_member() then
    raise exception 'Verify your university email to post' using errcode = '42501';
  end if;
  if new.item_id is not null and not exists (select 1 from public.items where id = new.item_id and owner_id = new.author_id) then
    raise exception 'You can only link your own listings' using errcode = 'P0001';
  end if;
  if new.like_count <> 0 or new.comment_count <> 0 or new.removed_at is not null then
    raise exception 'Invalid post' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger posts_guard_t before insert on public.posts
  for each row execute function public.posts_guard();

create or replace function public.comments_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_client() then return new; end if;
  if not public.is_active_member() then
    raise exception 'Verify your university email to comment' using errcode = '42501';
  end if;
  if new.removed_at is not null then raise exception 'Invalid comment' using errcode = '42501'; end if;
  return new;
end $$;
create trigger comments_guard_t before insert on public.comments
  for each row execute function public.comments_guard();

-- ---------- reviews -> trust score -------------------------------------
create or replace function public.reviews_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set
    trust_score   = (select round(avg(rating)::numeric, 2) from public.reviews where reviewee_id = new.reviewee_id),
    ratings_count = (select count(*) from public.reviews where reviewee_id = new.reviewee_id)
  where id = new.reviewee_id;
  perform public.notify(new.reviewee_id, 'system', 'You received a new review',
                        public.display_name_of(new.reviewer_id) || ' rated you ' || new.rating || '/5',
                        jsonb_build_object('txn_id', new.txn_id));
  return null;
end $$;
create trigger reviews_after_insert_t after insert on public.reviews
  for each row execute function public.reviews_after_insert();

-- =====================================================================
-- Transactions (FR-TRX). All writes go through these functions.
-- =====================================================================

create or replace function public.request_item(
  p_item uuid, p_kind public.txn_kind,
  p_start date default null, p_due date default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); it public.items%rowtype; tid uuid; conv uuid; nm text;
begin
  if me is null or not public.is_active_member() then
    raise exception 'Verify your university email to continue' using errcode = '42501';
  end if;
  select * into it from public.items where id = p_item and removed_at is null for update;
  if not found then raise exception 'This listing is no longer available'; end if;
  if it.owner_id = me then raise exception 'You cannot request your own listing'; end if;              -- FR-TRX-04
  if public.is_blocked(me, it.owner_id) then raise exception 'You cannot request this listing'; end if;
  if it.status <> 'available' then raise exception 'This listing was taken in the meantime'; end if;   -- A2
  if p_kind = 'rent' then
    if it.mode = 'sell' then raise exception 'This item is not offered for rent'; end if;
    if p_start is null or p_due is null then raise exception 'Choose a start date and a return date'; end if;
    if p_due <= p_start then raise exception 'Return date must be after the start date'; end if;        -- FR-TRX-02
    if p_start < current_date then raise exception 'Start date cannot be in the past'; end if;
    if p_due - p_start > 120 then raise exception 'A rental can last at most 120 days'; end if;         -- BR-03
  else
    if it.mode = 'rent' then raise exception 'This item is not for sale'; end if;
  end if;

  insert into public.transactions(item_id, owner_id, requester_id, kind, start_date, due_date, price, deposit, note)
  values (it.id, it.owner_id, me, p_kind,
          case when p_kind = 'rent' then p_start end, case when p_kind = 'rent' then p_due end,
          case when p_kind = 'rent' then it.rent_price else it.sale_price end,
          case when p_kind = 'rent' then it.deposit else 0 end,
          nullif(trim(coalesce(p_note, '')), ''))
  returning id into tid;

  update public.items set status = 'requested' where id = it.id;
  conv := public.ensure_conversation(it.id, me);
  nm := public.display_name_of(me);
  perform public.system_message(conv,
    case when p_kind = 'rent'
         then 'Rental request sent · ' || to_char(p_start, 'DD Mon') || ' to ' || to_char(p_due, 'DD Mon')
         else 'Purchase request sent' end);
  perform public.notify(it.owner_id, 'requests', nm || ' sent a request', it.title,
                        jsonb_build_object('txn_id', tid, 'item_id', it.id));
  return tid;
end $$;

create or replace function public.respond_request(p_txn uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.transactions%rowtype; it public.items%rowtype; conv uuid;
begin
  select * into t from public.transactions where id = p_txn for update;
  if not found or t.owner_id <> me then raise exception 'Request not found'; end if;
  if t.status <> 'requested' then raise exception 'This request has already been answered'; end if;
  select * into it from public.items where id = t.item_id for update;
  if p_accept then
    update public.transactions set status = 'accepted' where id = t.id;
    update public.items set status = case when t.kind = 'rent' then 'rented'::public.listing_status
                                          else 'sold'::public.listing_status end where id = t.item_id;   -- FR-TRX-06
  else
    update public.transactions set status = 'declined' where id = t.id;
    update public.items set status = 'available' where id = t.item_id;                                     -- FR-TRX-07
  end if;
  conv := public.ensure_conversation(t.item_id, t.requester_id);
  perform public.system_message(conv, case when p_accept then 'Request accepted' else 'Request declined' end);
  perform public.notify(t.requester_id, 'requests',
    case when p_accept then 'Your request was accepted' else 'Your request was declined' end,
    it.title, jsonb_build_object('txn_id', t.id, 'item_id', t.item_id));
end $$;

create or replace function public.cancel_request(p_txn uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.transactions%rowtype; other uuid;
begin
  select * into t from public.transactions where id = p_txn for update;
  if not found or me not in (t.owner_id, t.requester_id) then raise exception 'Request not found'; end if;
  if t.status not in ('requested','accepted') then raise exception 'This request can no longer be cancelled'; end if;
  if t.owner_handover_at is not null or t.requester_handover_at is not null then
    raise exception 'The handover has already started';
  end if;
  update public.transactions set status = 'cancelled' where id = t.id;
  update public.items set status = 'available' where id = t.item_id and status in ('requested','rented','sold');
  other := case when me = t.owner_id then t.requester_id else t.owner_id end;
  perform public.system_message(public.ensure_conversation(t.item_id, t.requester_id), 'Request cancelled');
  perform public.notify(other, 'requests', 'A request was cancelled',
                        public.display_name_of(me), jsonb_build_object('txn_id', t.id));
end $$;

create or replace function public.save_evidence(p_txn uuid, p_phase text, p_note text, p_photos text[]) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); photos text[] := coalesce(p_photos, '{}'); pth text;
begin
  if coalesce(array_length(photos, 1), 0) > 2 then raise exception 'You can add up to 2 photos'; end if;
  foreach pth in array photos loop
    if pth not like me::text || '/' || p_txn::text || '/%' then raise exception 'Invalid photo path'; end if;
  end loop;
  if coalesce(array_length(photos, 1), 0) > 0 and not public.is_pro_now(me)
     and public.account_photo_count(me) + array_length(photos, 1) > 40 then
    raise exception 'Photo limit reached (40 photos on a free account)';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is null and coalesce(array_length(photos, 1), 0) = 0 then return; end if;
  insert into public.txn_evidence(txn_id, user_id, phase, note, photo_paths)
  values (p_txn, me, p_phase, nullif(trim(coalesce(p_note, '')), ''), photos);
end $$;

-- FR-TRX-08: both sides confirm the handover
create or replace function public.confirm_handover(p_txn uuid, p_note text default null, p_photos text[] default '{}')
returns public.txn_status language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.transactions%rowtype; is_owner boolean; other uuid; it_title text;
begin
  if not public.is_active_member() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into t from public.transactions where id = p_txn for update;
  if not found or me not in (t.owner_id, t.requester_id) then raise exception 'Transaction not found'; end if;
  if t.status <> 'accepted' then raise exception 'The handover can only be confirmed after the request is accepted'; end if;
  is_owner := (me = t.owner_id);
  if (is_owner and t.owner_handover_at is not null) or (not is_owner and t.requester_handover_at is not null) then
    raise exception 'You have already confirmed the handover';
  end if;
  perform public.save_evidence(p_txn, 'handover', p_note, p_photos);
  update public.transactions set
    owner_handover_at     = case when is_owner then now() else owner_handover_at end,
    requester_handover_at = case when not is_owner then now() else requester_handover_at end
  where id = t.id returning * into t;
  other := case when is_owner then t.requester_id else t.owner_id end;
  select title into it_title from public.items where id = t.item_id;
  if t.owner_handover_at is not null and t.requester_handover_at is not null then
    if t.kind = 'rent' then
      update public.transactions set status = 'rented',
             deposit_status = case when t.deposit > 0 then 'held'::public.deposit_status else 'none'::public.deposit_status end
       where id = t.id;
    else
      update public.transactions set status = 'completed' where id = t.id;
      update public.profiles set swaps_count = swaps_count + 1 where id in (t.owner_id, t.requester_id);
    end if;
    perform public.system_message(public.ensure_conversation(t.item_id, t.requester_id), 'Handover confirmed by both');
    perform public.notify(other, 'requests', 'Handover confirmed by both', it_title, jsonb_build_object('txn_id', t.id));
  else
    perform public.notify(other, 'requests', public.display_name_of(me) || ' confirmed the handover',
                          'Please confirm on your side too', jsonb_build_object('txn_id', t.id));
  end if;
  select status into t.status from public.transactions where id = t.id;
  return t.status;
end $$;

-- FR-TRX-09: both sides confirm the return; the owner records the deposit outcome
create or replace function public.confirm_return(
  p_txn uuid, p_note text default null, p_photos text[] default '{}',
  p_deposit public.deposit_status default null)
returns public.txn_status language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.transactions%rowtype; is_owner boolean; other uuid; it_title text;
begin
  if not public.is_active_member() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into t from public.transactions where id = p_txn for update;
  if not found or me not in (t.owner_id, t.requester_id) then raise exception 'Transaction not found'; end if;
  if t.status <> 'rented' then raise exception 'This rental is not active'; end if;
  is_owner := (me = t.owner_id);
  if (is_owner and t.owner_return_at is not null) or (not is_owner and t.requester_return_at is not null) then
    raise exception 'You have already confirmed the return';
  end if;
  if is_owner and t.deposit > 0 and (p_deposit is null or p_deposit not in ('returned','deducted')) then
    raise exception 'Choose whether the deposit was returned or deducted';
  end if;
  perform public.save_evidence(p_txn, 'return', p_note, p_photos);
  update public.transactions set
    owner_return_at     = case when is_owner then now() else owner_return_at end,
    requester_return_at = case when not is_owner then now() else requester_return_at end,
    deposit_outcome     = case when is_owner and t.deposit > 0 then p_deposit else deposit_outcome end
  where id = t.id returning * into t;
  other := case when is_owner then t.requester_id else t.owner_id end;
  select title into it_title from public.items where id = t.item_id;
  if t.owner_return_at is not null and t.requester_return_at is not null then
    update public.transactions set status = 'returned',
           deposit_status = case when t.deposit > 0 then coalesce(t.deposit_outcome, 'returned') else 'none' end
     where id = t.id;
    update public.items set status = 'available' where id = t.item_id and status = 'rented';
    update public.profiles set swaps_count = swaps_count + 1 where id in (t.owner_id, t.requester_id);
    perform public.system_message(public.ensure_conversation(t.item_id, t.requester_id), 'Return confirmed by both');
    perform public.notify(other, 'requests', 'Return confirmed by both', it_title, jsonb_build_object('txn_id', t.id));
  else
    perform public.notify(other, 'requests', public.display_name_of(me) || ' confirmed the return',
                          'Please confirm on your side too', jsonb_build_object('txn_id', t.id));
  end if;
  select status into t.status from public.transactions where id = t.id;
  return t.status;
end $$;

-- FR-REV-01/03
create or replace function public.submit_review(p_txn uuid, p_rating int, p_comment text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.transactions%rowtype; other uuid; rid uuid;
begin
  if not public.is_active_member() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into t from public.transactions where id = p_txn;
  if not found or me not in (t.owner_id, t.requester_id) then raise exception 'Transaction not found'; end if;
  if t.status not in ('returned','completed') then raise exception 'You can review once the swap is complete'; end if;
  if p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5'; end if;
  other := case when me = t.owner_id then t.requester_id else t.owner_id end;
  begin
    insert into public.reviews(txn_id, reviewer_id, reviewee_id, rating, comment)
    values (p_txn, me, other, p_rating, nullif(trim(coalesce(p_comment, '')), '')) returning id into rid;
  exception when unique_violation then
    raise exception 'You have already reviewed this swap';
  end;
  return rid;
end $$;

-- scheduled jobs (called by pg_cron) --------------------------------------
create or replace function public.send_return_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select t.*, i.title from public.transactions t join public.items i on i.id = t.item_id
    where t.status = 'rented' and t.due_date <= current_date + 1
      and t.last_reminded_on is distinct from current_date
  loop
    perform public.notify(r.owner_id, 'reminders',
      case when r.due_date < current_date then 'Return overdue' else 'Return due soon' end,
      r.title || ' · due ' || to_char(r.due_date, 'DD Mon'), jsonb_build_object('txn_id', r.id));
    perform public.notify(r.requester_id, 'reminders',
      case when r.due_date < current_date then 'Return overdue' else 'Return due soon' end,
      r.title || ' · due ' || to_char(r.due_date, 'DD Mon'), jsonb_build_object('txn_id', r.id));
    update public.transactions set last_reminded_on = current_date where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.expire_stale_requests() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select * from public.transactions where status = 'requested' and created_at < now() - interval '72 hours' loop
    update public.transactions set status = 'cancelled' where id = r.id;
    update public.items set status = 'available' where id = r.item_id and status = 'requested';
    perform public.system_message(public.ensure_conversation(r.item_id, r.requester_id), 'Request expired');
    perform public.notify(r.requester_id, 'requests', 'Your request expired', 'The owner did not reply in 72 hours',
                          jsonb_build_object('txn_id', r.id));
    n := n + 1;
  end loop;
  return n;
end $$;

-- =====================================================================
-- Search (FR-SRC) - ranked by walking distance between zones
-- =====================================================================
create or replace function public.search_items(
  p_query text default null,
  p_mode text default 'all',            -- 'rent' | 'buy' | 'all'
  p_category int default null,
  p_zone int default null,              -- origin zone; defaults to the user's own zone
  p_sort text default 'distance',       -- 'distance' | 'price' | 'newest'
  p_limit int default 20,
  p_offset int default 0,
  p_saved_only boolean default false,
  p_owner uuid default null)
returns table (
  id uuid, title text, mode public.listing_mode, status public.listing_status, condition public.item_condition,
  rent_price numeric, deposit numeric, sale_price numeric,
  zone_id int, zone_name text, category_id int, category_name text,
  distance_m int, cover_path text, owner_id uuid, owner_name text, owner_trust numeric,
  created_at timestamptz, boosted boolean, is_saved boolean)
language sql stable as $$
  with origin as (
    select coalesce(p_zone, (select default_zone_id from public.profiles where id = auth.uid())) as zid
  ), q as (
    select case when nullif(trim(coalesce(p_query, '')), '') is null then null
                else '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' end as pat
  ), base as (
    select i.*, z.name as zname, c.name as cname,
           (select zone_distance_m(o.zid, i.zone_id) from origin o where o.zid is not null) as dist,
           coalesce(case when p_mode = 'buy' then i.sale_price else coalesce(i.rent_price, i.sale_price) end, 0) as eff_price,
           (i.boosted_until is not null and i.boosted_until > now()) as is_boosted
    from public.items i
    join public.zones z on z.id = i.zone_id
    join public.categories c on c.id = i.category_id
    cross join q
    where i.status <> 'archived'
      and (p_owner is null or i.owner_id = p_owner)
      and (p_mode = 'all' or (p_mode = 'rent' and i.mode in ('rent','both')) or (p_mode = 'buy' and i.mode in ('sell','both')))
      and (p_category is null or i.category_id = p_category)
      and (q.pat is null or i.title ilike q.pat escape '\' or c.name ilike q.pat escape '\' or z.name ilike q.pat escape '\')
      and (not p_saved_only or exists (select 1 from public.saved_items s where s.item_id = i.id and s.user_id = auth.uid()))
  )
  select b.id, b.title, b.mode, b.status, b.condition, b.rent_price, b.deposit, b.sale_price,
         b.zone_id, b.zname, b.category_id, b.cname, b.dist,
         (select ii.path from public.item_images ii where ii.item_id = b.id order by ii.position limit 1),
         b.owner_id, p.display_name, p.trust_score, b.created_at, b.is_boosted,
         exists (select 1 from public.saved_items s where s.item_id = b.id and s.user_id = auth.uid())
  from base b join public.profiles p on p.id = b.owner_id
  order by
    (case when p_sort = 'price'  then b.eff_price end) asc nulls last,
    (case when p_sort = 'newest' then extract(epoch from b.created_at) end) desc nulls last,
    (case when p_sort not in ('price','newest') then b.dist end) asc nulls last,
    b.is_boosted desc, b.created_at desc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- Pro: boost a listing to the top of its zone for 7 days (FR-PRO-02)
create or replace function public.boost_item(p_item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not public.is_pro_now(me) then raise exception 'Boosts are a Pro feature'; end if;
  update public.items set boosted_until = now() + interval '7 days'
   where id = p_item and owner_id = me and status = 'available' and removed_at is null;
  if not found then raise exception 'Listing not found or not available'; end if;
end $$;

-- =====================================================================
-- Reports and moderation (FR-MOD)
-- =====================================================================
create or replace function public.submit_report(p_type text, p_target uuid, p_reason text, p_details text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tu uuid; rid uuid;
begin
  if not public.is_active_member() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_type = 'item' then select owner_id into tu from public.items where id = p_target;
  elsif p_type = 'post' then select author_id into tu from public.posts where id = p_target;
  elsif p_type = 'comment' then select author_id into tu from public.comments where id = p_target;
  elsif p_type = 'user' then select id into tu from public.profiles where id = p_target;
  elsif p_type = 'conversation' then
    select case when owner_id = me then other_id else owner_id end into tu
      from public.conversations where id = p_target and me in (owner_id, other_id);
  else raise exception 'Invalid report type';
  end if;
  if tu is null then raise exception 'Nothing to report'; end if;
  if tu = me then raise exception 'You cannot report yourself'; end if;
  begin
    insert into public.reports(reporter_id, target_type, target_id, target_user_id, reason, details)
    values (me, p_type, p_target, tu, p_reason, nullif(trim(coalesce(p_details, '')), '')) returning id into rid;
  exception when unique_violation then
    raise exception 'You have already reported this';
  end;
  return rid;
end $$;

create or replace function public.admin_log(p_admin uuid, p_action text, p_type text, p_target uuid, p_note text)
returns void language sql security definer set search_path = public as $$
  insert into public.admin_actions(admin_id, action, target_type, target_id, note) values (p_admin, p_action, p_type, p_target, p_note)
$$;

create or replace function public.apply_suspension(p_user uuid, p_suspend boolean, p_reason text, p_admin uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set is_suspended = p_suspend where id = p_user and not is_admin;
  update public.user_private set suspension_reason = case when p_suspend then p_reason end where user_id = p_user;
  perform public.admin_log(p_admin, case when p_suspend then 'suspend_user' else 'reinstate_user' end, 'user', p_user, p_reason);
  perform public.notify(p_user, 'system',
    case when p_suspend then 'Your account was suspended' else 'Your account was reinstated' end, coalesce(p_reason, ''), '{}');
end $$;

create or replace function public.admin_set_suspended(p_user uuid, p_suspend boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  perform public.apply_suspension(p_user, p_suspend, p_reason, auth.uid());
end $$;

create or replace function public.remove_target(p_type text, p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_type = 'item' then
    update public.items set removed_at = now(), status = case when status = 'available' then 'archived' else status end
     where id = p_target;
  elsif p_type = 'post' then update public.posts set removed_at = now() where id = p_target;
  elsif p_type = 'comment' then update public.comments set removed_at = now() where id = p_target;
  end if;
end $$;

create or replace function public.admin_resolve_report(p_report uuid, p_action text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.reports%rowtype; me uuid := auth.uid(); upheld int;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  select * into r from public.reports where id = p_report for update;
  if not found then raise exception 'Report not found'; end if;
  if r.status <> 'open' then raise exception 'This report is already resolved'; end if;
  if p_action not in ('dismiss','warn','remove','suspend') then raise exception 'Invalid action'; end if;

  update public.reports set status = case when p_action = 'dismiss' then 'dismissed' else 'upheld' end,
         resolved_by = me, resolved_at = now(), resolution_note = p_note where id = r.id;
  perform public.admin_log(me, 'report_' || p_action, r.target_type, r.target_id, p_note);

  if p_action = 'remove' then
    perform public.remove_target(r.target_type, r.target_id);
    perform public.notify(r.target_user_id, 'system', 'Your content was removed', coalesce(p_note, 'It broke the community rules'), '{}');
  elsif p_action = 'warn' then
    perform public.notify(r.target_user_id, 'system', 'Warning from the moderators', coalesce(p_note, 'Please follow the community rules'), '{}');
  elsif p_action = 'suspend' then
    perform public.apply_suspension(r.target_user_id, true, coalesce(p_note, 'Repeated or serious violations'), me);
  end if;

  -- BR-06: three upheld reports in 30 days -> automatic suspension pending review
  if p_action <> 'dismiss' and r.target_user_id is not null then
    select count(*) into upheld from public.reports
      where target_user_id = r.target_user_id and status = 'upheld' and resolved_at > now() - interval '30 days';
    if upheld >= 3 and exists (select 1 from public.profiles where id = r.target_user_id and not is_suspended and not is_admin) then
      perform public.apply_suspension(r.target_user_id, true, 'Automatic: 3 upheld reports in 30 days, pending review', null);
    end if;
  end if;
end $$;

create or replace function public.admin_report_queue(p_status text default 'open')
returns table (id uuid, target_type text, target_id uuid, target_user_id uuid, target_user_name text,
               reporter_name text, reason text, details text, status text, created_at timestamptz, preview text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
  select r.id, r.target_type, r.target_id, r.target_user_id, tu.display_name, ru.display_name,
         r.reason, r.details, r.status, r.created_at,
         case r.target_type
           when 'item' then (select i.title from public.items i where i.id = r.target_id)
           when 'post' then (select left(p.body, 140) from public.posts p where p.id = r.target_id)
           when 'comment' then (select left(c.body, 140) from public.comments c where c.id = r.target_id)
           when 'user' then tu.display_name
           else 'Conversation' end
  from public.reports r
  left join public.profiles tu on tu.id = r.target_user_id
  join public.profiles ru on ru.id = r.reporter_id
  where r.status = p_status
  order by r.created_at asc
  limit 100;
end $$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users',            (select count(*) from public.profiles),
    'active_listings',  (select count(*) from public.items where status in ('available','requested','rented') and removed_at is null),
    'completed_swaps',  (select count(*) from public.transactions where status in ('returned','completed')),
    'open_reports',     (select count(*) from public.reports where status = 'open'),
    'posts',            (select count(*) from public.posts where removed_at is null),
    'suspended_users',  (select count(*) from public.profiles where is_suspended));
end $$;

create or replace function public.admin_search_users(p_query text) returns table
  (id uuid, display_name text, is_suspended boolean, is_admin boolean, trust_score numeric, swaps_count int, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query select p.id, p.display_name, p.is_suspended, p.is_admin, p.trust_score, p.swaps_count, p.created_at
    from public.profiles p
    where p.display_name ilike '%' || replace(replace(coalesce(p_query, ''), '%', ''), '_', '') || '%'
    order by p.created_at desc limit 30;
end $$;

-- =====================================================================
-- Account deletion (FR-AUTH-07 / NFR-PRIV-02)
-- The app deletes the user's storage files first, then calls this.
-- =====================================================================
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if exists (select 1 from public.transactions
             where me in (owner_id, requester_id) and status in ('requested','accepted','rented')) then
    raise exception 'Finish or cancel your active requests and rentals before deleting your account';
  end if;
  delete from auth.users where id = me;     -- cascades to every personal table
end $$;

-- 002_item_delete_guard
-- (deleting it would cascade-delete the other student's history and reviews).
create or replace function public.items_delete_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  -- account deletion (definer context) may cascade; app users may not delete items that have history
  if public.is_client() and exists (select 1 from public.transactions where item_id = old.id) then
    raise exception 'This listing has transaction history. Archive it instead of deleting it.' using errcode = 'P0001';
  end if;
  return old;
end $$;

drop trigger if exists items_delete_guard_t on public.items;
create trigger items_delete_guard_t before delete on public.items
  for each row execute function public.items_delete_guard();

-- 003_device_tokens
-- 003: push notification device tokens.
-- A phone's token may move between accounts (log out, log in as someone else), so registration
-- goes through a function instead of direct table writes.
create or replace function public.register_device_token(p_token text, p_platform text default 'android') returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_token is null or char_length(p_token) < 10 or char_length(p_token) > 300 then raise exception 'Invalid token'; end if;
  insert into public.device_tokens(user_id, token, platform) values (me, p_token, coalesce(p_platform, 'android'))
  on conflict (token) do update set user_id = me, platform = excluded.platform, updated_at = now();
end $$;

create or replace function public.unregister_device_token(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from public.device_tokens where token = p_token and user_id = auth.uid();
$$;
grant execute on function public.register_device_token(text, text), public.unregister_device_token(text) to authenticated;

-- =====================================================================
-- Row level security (NFR-SEC-02). Every table has RLS enabled.
-- Tables that must only change through functions have NO write policies.
-- =====================================================================

alter table public.zones          enable row level security;
alter table public.categories     enable row level security;
alter table public.profiles       enable row level security;
alter table public.user_private   enable row level security;
alter table public.device_tokens  enable row level security;
alter table public.blocks         enable row level security;
alter table public.items          enable row level security;
alter table public.item_images    enable row level security;
alter table public.saved_items    enable row level security;
alter table public.transactions   enable row level security;
alter table public.txn_evidence   enable row level security;
alter table public.conversations  enable row level security;
alter table public.messages       enable row level security;
alter table public.posts          enable row level security;
alter table public.post_images    enable row level security;
alter table public.post_likes     enable row level security;
alter table public.comments       enable row level security;
alter table public.reviews        enable row level security;
alter table public.reports        enable row level security;
alter table public.admin_actions  enable row level security;
alter table public.notifications  enable row level security;

-- reference data: everyone signed in reads, admins manage (FR-MOD-05)
create policy zones_read   on public.zones      for select to authenticated using (true);
create policy zones_admin  on public.zones      for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy cats_read    on public.categories for select to authenticated using (true);
create policy cats_admin   on public.categories for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles: readable by signed-in users, own row editable (protected columns guarded by trigger)
create policy profiles_read   on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy user_private_read   on public.user_private for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy user_private_update on public.user_private for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy device_tokens_own on public.device_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy blocks_own on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- listings
create policy items_read on public.items for select to authenticated using (
  owner_id = auth.uid() or public.is_admin()
  or (removed_at is null and status <> 'archived'
      and not exists (select 1 from public.profiles p where p.id = owner_id and p.is_suspended)));
create policy items_insert on public.items for insert to authenticated
  with check (owner_id = auth.uid() and public.is_active_member());
create policy items_update on public.items for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy items_delete on public.items for delete to authenticated
  using (owner_id = auth.uid() and status in ('available','archived'));

create policy item_images_read on public.item_images for select to authenticated
  using (exists (select 1 from public.items i where i.id = item_id));
create policy item_images_insert on public.item_images for insert to authenticated
  with check (public.is_active_member() and exists (select 1 from public.items i where i.id = item_id and i.owner_id = auth.uid())
              and split_part(path, '/', 1) = auth.uid()::text);
create policy item_images_delete on public.item_images for delete to authenticated
  using (exists (select 1 from public.items i where i.id = item_id and i.owner_id = auth.uid()));

create policy saved_own on public.saved_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_active_member());

-- transactions: participants read; all changes through functions
create policy txn_read on public.transactions for select to authenticated
  using (auth.uid() in (owner_id, requester_id) or public.is_admin());
create policy evidence_read on public.txn_evidence for select to authenticated
  using (public.is_admin() or exists (select 1 from public.transactions t
         where t.id = txn_id and auth.uid() in (t.owner_id, t.requester_id)));

-- messaging: only the two participants
create policy conv_read on public.conversations for select to authenticated
  using (auth.uid() in (owner_id, other_id));
create policy msg_read on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() in (c.owner_id, c.other_id)));
create policy msg_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and kind = 'text' and public.is_active_member()
    and exists (select 1 from public.conversations c
                where c.id = conversation_id and auth.uid() in (c.owner_id, c.other_id)
                  and not public.is_blocked(c.owner_id, c.other_id)));

-- feed
create policy posts_read on public.posts for select to authenticated using (
  author_id = auth.uid() or public.is_admin()
  or (removed_at is null and not public.is_blocked(author_id, auth.uid())));
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = auth.uid());
create policy posts_delete on public.posts for delete to authenticated
  using (author_id = auth.uid());

create policy post_images_read on public.post_images for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy post_images_insert on public.post_images for insert to authenticated
  with check (public.is_active_member() and exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
              and split_part(path, '/', 1) = auth.uid()::text);
create policy post_images_delete on public.post_images for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

create policy likes_read on public.post_likes for select to authenticated using (true);
create policy likes_insert on public.post_likes for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_member()
              and exists (select 1 from public.posts p where p.id = post_id));
create policy likes_delete on public.post_likes for delete to authenticated using (user_id = auth.uid());

create policy comments_read on public.comments for select to authenticated using (
  author_id = auth.uid() or public.is_admin() or removed_at is null);
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and p.removed_at is null));
create policy comments_delete on public.comments for delete to authenticated using (author_id = auth.uid());

-- reviews are public to signed-in users; inserts only via submit_review()
create policy reviews_read on public.reviews for select to authenticated using (true);

-- reports: own reports visible; admins see all. Inserts only via submit_report()
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
create policy admin_actions_read on public.admin_actions for select to authenticated using (public.is_admin());

-- notifications: own only; users may mark read / delete
create policy notif_read   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Privileges: only signed-in users may touch data or call RPCs
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon, public;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- internal helpers: not callable by app users
revoke execute on function public.notify(uuid, text, text, text, jsonb) from authenticated;
revoke execute on function public.ensure_conversation(uuid, uuid) from authenticated;
revoke execute on function public.system_message(uuid, text) from authenticated;
revoke execute on function public.save_evidence(uuid, text, text, text[]) from authenticated;
revoke execute on function public.apply_suspension(uuid, boolean, text, uuid) from authenticated;
revoke execute on function public.remove_target(text, uuid) from authenticated;
revoke execute on function public.admin_log(uuid, text, text, uuid, text) from authenticated;
revoke execute on function public.send_return_reminders() from authenticated;
revoke execute on function public.expire_stale_requests() from authenticated;
grant  execute on function public.send_return_reminders(), public.expire_stale_requests() to service_role;

-- tables nobody should write directly (defence in depth on top of "no policy")
revoke insert, update, delete on public.transactions, public.txn_evidence, public.conversations,
  public.reviews, public.reports, public.admin_actions, public.app_settings from authenticated;
revoke all on public.app_settings from authenticated;
revoke update on public.notifications from authenticated;
grant  update (read_at) on public.notifications to authenticated;
revoke update on public.messages from authenticated;
revoke update on public.profiles from authenticated;
grant  update (display_name, avatar_path, department, default_zone_id) on public.profiles to authenticated;
revoke update on public.user_private from authenticated;
grant  update (notification_prefs) on public.user_private to authenticated;
revoke update on public.items from authenticated;
grant  update (title, description, category_id, condition, mode, rent_price, deposit, sale_price, zone_id, status) on public.items to authenticated;

alter default privileges in schema public revoke execute on functions from public;
-- =====================================================================
-- Storage buckets and policies
-- File paths: {user_id}/{file}                    (avatars, item-images, post-images)
--             {user_id}/{transaction_id}/{file}   (evidence, private)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',     'avatars',     true,  1048576, array['image/jpeg','image/png','image/webp']),
  ('item-images', 'item-images', true,  1048576, array['image/jpeg','image/png','image/webp']),
  ('post-images', 'post-images', true,  1048576, array['image/jpeg','image/png','image/webp']),
  ('evidence',    'evidence',    false, 1048576, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "own folder upload" on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars','item-images','post-images','evidence')
              and (storage.foldername(name))[1] = auth.uid()::text
              and public.is_active_member());
create policy "own folder update" on storage.objects for update to authenticated
  using (bucket_id in ('avatars','item-images','post-images','evidence') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder delete" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars','item-images','post-images','evidence') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "evidence read" on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
    or exists (select 1 from public.transactions t
               where t.id::text = (storage.foldername(name))[2] and auth.uid() in (t.owner_id, t.requester_id))));
create policy "own folder list" on storage.objects for select to authenticated
  using (bucket_id in ('avatars','item-images','post-images') and (storage.foldername(name))[1] = auth.uid()::text);

-- realtime: chat messages and notifications
do $$ begin
  alter publication supabase_realtime add table public.messages, public.notifications;
exception when others then raise notice 'realtime publication not updated: %', sqlerrm;
end $$;

-- =====================================================================
-- Seed data
-- =====================================================================
insert into public.categories(name, sort) values
  ('Books', 1), ('Lab gear', 2), ('Tools', 3), ('Electronics', 4), ('Clothing', 5), ('Other', 6);

insert into public.zones(name, category, lat, lng) values
  ('Department of Computer Science',            'Academic',   31.578943131165097, 74.35748801488168),
  ('Department of Electrical Engineering',      'Academic',   31.577797984242835, 74.3562449518109),
  ('Department of Architectural Engineering',   'Academic',   31.57797405768564,  74.35471211182929),
  ('Department of Civil Engineering',           'Academic',   31.579049173935758, 74.3570390106319),
  ('Department of Chemical Engineering',        'Academic',   31.580155417412865, 74.3559467370692),
  ('Department of Computer Engineering',        'Academic',   31.578577918196714, 74.35832817469296),
  ('Department of Mechatronics & Control Eng.', 'Academic',   31.57756750593948,  74.35845943512403),
  ('Dept of Metallurgical & Materials Eng.',    'Academic',   31.58003289236621,  74.3558446199937),
  ('Department of City & Regional Planning',    'Academic',   31.579224895800408, 74.35591392198663),
  ('Department of Chemistry',                   'Academic',   31.57742508838155,  74.35229719417578),
  ('Institute of Business & Management (IB&M)','Academic',   31.578357151867987, 74.35370226118201),
  ('Al-Khawarizmi Institute of CS (KICS)',      'Academic',   31.578122634983313, 74.3578500120612),
  ('Institute of Data Science',                 'Academic',   31.580586418345707, 74.35538925921958),
  ('Main Block',                                'Admin',      31.5780427604943,   74.35991736236399),
  ('Admin Block',                               'Admin',      31.577088323996524, 74.35484489203216),
  ('Main Auditorium',                           'Hub',        31.578593265752264, 74.35938842005571),
  ('Sports Auditorium',                         'Sports',     31.58124054257788,  74.35311748052334),
  ('Sports Complex',                            'Sports',     31.581449611500897, 74.35371268380062),
  ('Football Ground',                           'Sports',     31.580057445861243, 74.3545089223809),
  ('Junaid Jamshed Cricket Stadium',            'Sports',     31.58201837468001,  74.35510976748813),
  ('Lalazar Park',                              'Recreation', 31.578152135923922, 74.35604141067222),
  ('SSC (Main Cafe)',                           'Food',       31.57895078443223,  74.35305245252545),
  ('Bhola Cafe',                                'Food',       31.580624581482308, 74.35406322509435),
  ('Shopping Centre',                           'Food',       31.579864774899928, 74.35313524140872),
  ('Bus Stand',                                 'Hub',        31.579194503535255, 74.35420250511008),
  ('Zubair Hall (Boys)',                        'Hostel',     31.579789175443164, 74.35223997765611),
  ('Sultan Mehmood Ghaznavi Hall (Boys)',       'Hostel',     31.579373093247206, 74.35290914732215),
  ('Mumtaz Hall (Boys)',                        'Hostel',     31.58078698191929,  74.35197997726178),
  ('Quaid-e-Azam Hall (Boys)',                  'Hostel',     31.58103868247671,  74.3511541557898),
  ('Sir Syed Hall (Boys)',                      'Hostel',     31.582112861538043, 74.35091720283872),
  ('Iqbal Hall (Boys)',                         'Hostel',     31.582233015024222, 74.35204272941517),
  ('Bachelors Faculty Hostel',                  'Hostel',     31.57937212057776,  74.36096838265975),
  ('Khadija Hall (Girls)',                      'Hostel',     31.57950646305128,  74.35992415961726),
  ('Khalid Hall (Girls)',                       'Hostel',     31.57865344626616,  74.3519024000511),
  ('Zohra Hall (Girls)',                        'Hostel',     31.58224186027114,  74.35716900168362),
  ('New Girls Hostel',                          'Hostel',     31.57943299288578,  74.36185261939615);

-- scheduled jobs (pg_cron). If the extension is not enabled the notice explains how.
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('uniswap-return-reminders', '0 3 * * *',  'select public.send_return_reminders()');
  perform cron.schedule('uniswap-expire-requests',  '15 * * * *', 'select public.expire_stale_requests()');
exception when others then
  raise notice 'pg_cron not set up (%). Enable it in Database > Extensions, then re-run the two cron.schedule calls.', sqlerrm;
end $$;
