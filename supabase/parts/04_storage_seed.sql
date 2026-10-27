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
