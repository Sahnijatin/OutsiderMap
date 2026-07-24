-- Delhi NCR, properly.
--
-- The catalog covered 22 areas, all of them Delhi proper plus Gurgaon and
-- Noida bolted on. NCR is where people actually live and go out, and someone
-- in Indirapuram opening the map to find nothing within an hour's drive
-- concludes the app is not for them.
--
-- NCR stays ONE city rather than becoming five. People think of it as one
-- place, they cross its internal borders without noticing, and splitting it
-- would fragment the map into five sparse ones - each below the density where
-- a discovery map is worth opening.

update public.cities
set areas = array[
  -- Delhi
  'Connaught Place', 'Khan Market', 'Hauz Khas', 'Shahpur Jat',
  'Champa Gali', 'Lodhi Colony', 'Mehrauli', 'Greater Kailash', 'Saket',
  'Vasant Kunj', 'Old Delhi', 'Karol Bagh', 'Lajpat Nagar', 'Nizamuddin',
  'Majnu ka Tilla', 'Paharganj', 'Defence Colony', 'Green Park',
  'Kamla Nagar', 'Aerocity',
  -- More of Delhi that the first pass missed
  'Chandni Chowk', 'Daryaganj', 'Jangpura', 'Malviya Nagar', 'Chittaranjan Park',
  'Safdarjung', 'Rajouri Garden', 'Punjabi Bagh', 'Pitampura', 'Model Town',
  'Civil Lines', 'Dwarka', 'Janakpuri', 'Vasant Vihar', 'Sarojini Nagar',
  'INA', 'Yusuf Sarai', 'Satya Niketan', 'North Campus', 'Okhla',
  'Jamia Nagar', 'Shahdara', 'Preet Vihar', 'Mayur Vihar', 'Laxmi Nagar',
  -- Gurugram
  'Gurgaon', 'Cyber Hub', 'Golf Course Road', 'Sohna Road', 'Sector 29',
  'MG Road Gurgaon', 'Sushant Lok', 'DLF Phase 1', 'DLF Phase 3', 'Manesar',
  -- Noida and Greater Noida
  'Noida', 'Sector 18 Noida', 'Sector 62 Noida', 'Sector 104 Noida',
  'Greater Noida', 'Knowledge Park',
  -- The rest of NCR
  'Ghaziabad', 'Indirapuram', 'Vaishali', 'Raj Nagar Extension',
  'Faridabad', 'Sector 15 Faridabad', 'Ballabgarh',
  'Sonipat', 'Bahadurgarh'
]
where slug = 'delhi';

-- The city is Delhi NCR now; say so, since the area list crosses three states.
update public.cities
set name = 'Delhi NCR'
where slug = 'delhi';
