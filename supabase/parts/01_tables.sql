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
