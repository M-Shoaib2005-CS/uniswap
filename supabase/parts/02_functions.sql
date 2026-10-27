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

