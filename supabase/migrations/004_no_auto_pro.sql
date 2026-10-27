-- 004: new accounts no longer get Pro automatically. Existing founding members keep what they have.
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


-- Optional: also remove Pro from the accounts that already received it automatically.
-- update public.profiles set is_pro = false, pro_until = null, founding_member = false where founding_member;
