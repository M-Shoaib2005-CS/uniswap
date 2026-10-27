-- OPTIONAL demo listings so the Home screen is not empty. Run after creating the admin account.
-- Owner = the bootstrap admin (seadmin@student.uet.edu.pk). Delete later with:
--   delete from public.items where title in (select title from ... ) or just archive them in the app.
do $$
declare owner uuid; z int; c int;
begin
  select u.id into owner from auth.users u where u.email = 'seadmin@student.uet.edu.pk';
  if owner is null then raise exception 'Create the seadmin@student.uet.edu.pk user first (Authentication > Users > Add user)'; end if;

  insert into public.items(owner_id, title, description, category_id, condition, mode, rent_price, deposit, sale_price, zone_id)
  select owner, v.title, v.descr, (select id from public.categories where name = v.cat), v.cond::public.item_condition,
         v.mode::public.listing_mode, v.rent, v.dep, v.sale, (select id from public.zones where name = v.zone)
  from (values
    ('Calculus: Early Transcendentals', 'Stewart 8th edition. Barely used, no highlighting.', 'Books', 'good', 'both', 1200, 500, 4500, 'Department of Computer Science'),
    ('Discrete Mathematics and Its Applications', 'Rosen, 7th edition. Solutions manual included.', 'Books', 'good', 'rent', 900, 400, null, 'Department of Civil Engineering'),
    ('Introduction to Algorithms (CLRS)', 'Fourth edition, clean copy.', 'Books', 'like_new', 'both', 1500, 600, 6000, 'Main Block'),
    ('Digital Logic Trainer Kit', 'Complete kit with breadboard and ICs.', 'Lab gear', 'good', 'rent', 450, 200, null, 'Iqbal Hall (Boys)'),
    ('Lab coat, size M', 'White, washed, no stains.', 'Lab gear', 'good', 'both', 300, 100, 900, 'Department of Chemistry'),
    ('Casio fx-991EX Calculator', 'Works perfectly, comes with cover.', 'Electronics', 'like_new', 'sell', null, null, 3500, 'SSC (Main Cafe)'),
    ('Soldering Iron Set', '60W iron, stand, solder and flux.', 'Tools', 'good', 'rent', 350, 300, null, 'Department of Electrical Engineering'),
    ('Engineering Drawing Board + T-square', 'A2 board, perfect for first-year drawing.', 'Tools', 'fair', 'both', 400, 150, 1500, 'Department of Architectural Engineering'),
    ('Arduino Uno Starter Kit', 'Uno R3, sensors, jumper wires.', 'Electronics', 'like_new', 'both', 600, 300, 3200, 'Department of Mechatronics & Control Eng.'),
    ('Probability and Statistics for Engineers', 'Walpole, 9th edition.', 'Books', 'good', 'rent', 800, 300, null, 'Institute of Business & Management (IB&M)'),
    ('Winter hoodie (UET), size L', 'Worn twice.', 'Clothing', 'like_new', 'sell', null, null, 1800, 'Zubair Hall (Boys)'),
    ('Scientific Drawing Instruments Set', 'Compass, dividers, protractor.', 'Tools', 'good', 'rent', 250, 100, null, 'Khadija Hall (Girls)')
  ) as v(title, descr, cat, cond, mode, rent, dep, sale, zone);
end $$;
