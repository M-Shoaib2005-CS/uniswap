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
