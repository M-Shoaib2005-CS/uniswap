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
