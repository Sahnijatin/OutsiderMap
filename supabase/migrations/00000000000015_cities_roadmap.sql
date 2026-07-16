-- Roadmap cities: OutsiderMap is India-wide with Delhi as the launch market.
-- Non-live rows power the quest wizard's city step (selectable when live,
-- greyed "soon" until then) and cost nothing - is_live gates everything.

insert into public.cities (slug, name, lat, lng, zoom, is_live)
values
  ('mumbai', 'Mumbai', 19.0760, 72.8777, 11.5, false),
  ('bangalore', 'Bangalore', 12.9716, 77.5946, 11.5, false),
  ('jaipur', 'Jaipur', 26.9124, 75.7873, 11.8, false),
  ('goa', 'Goa', 15.4909, 73.8278, 10.5, false),
  ('rishikesh', 'Rishikesh', 30.0869, 78.2676, 12.5, false)
on conflict (slug) do nothing;
