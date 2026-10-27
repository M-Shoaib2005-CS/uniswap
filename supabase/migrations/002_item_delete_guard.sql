-- 002: a listing that has transaction history can only be archived, never deleted
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
